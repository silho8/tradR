import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });
const digits = (phone: string) => phone.replace(/\D/g, "");
async function send(phone: string, message: Record<string, unknown>, token: string, phoneId: string, version: string) {
  const response = await fetch(`https://graph.facebook.com/${version}/${phoneId}/messages`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: digits(phone), ...message }) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.error) throw new Error(`WhatsApp send failed (${payload?.error?.code ?? response.status})`);
  return String(payload?.messages?.[0]?.id ?? "");
}
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);
  const url = Deno.env.get("SUPABASE_URL"), serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), paystackKey = Deno.env.get("PAYSTACK_SECRET_KEY"), waToken = Deno.env.get("WHATSAPP_ACCESS_TOKEN"), waPhoneId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
  const welcomeTemplate = Deno.env.get("WHATSAPP_WELCOME_TEMPLATE") ?? "tradr_welcome", welcomeLanguage = Deno.env.get("WHATSAPP_WELCOME_LANGUAGE") ?? "en_GB";
  const alertTemplate = Deno.env.get("WHATSAPP_WITHDRAWAL_TEMPLATE_NAME") ?? "tradr_withdrawal_alert", alertLanguage = Deno.env.get("WHATSAPP_WITHDRAWAL_TEMPLATE_LANGUAGE") ?? welcomeLanguage;
  if (!url || !serviceKey || !paystackKey || !waToken || !waPhoneId) return json({ error: "WhatsApp and Paystack credentials are not fully configured." }, 503);
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/, "");
  if (!jwt) return json({ error: "Sign in required." }, 401);
  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: authData, error: authError } = await admin.auth.getUser(jwt);
  if (authError || !authData.user) return json({ error: "Invalid session." }, 401);
  try {
    const body = await req.json().catch(() => ({})), requestId = typeof body.request_id === "string" ? body.request_id : "";
    if (!requestId) return json({ error: "A withdrawal request ID is required." }, 400);
    const { data: w, error: wErr } = await admin.from("seller_withdrawal_requests").select("id,profile_id,vendor_id,amount_kobo,status,payout_recipient_code,account_name,bank_name,vendors(shop_name)").eq("id", requestId).maybeSingle();
    if (wErr || !w) return json({ error: "Withdrawal request not found." }, 404);
    if (authData.user.id !== w.profile_id && authData.user.app_metadata?.role !== "admin") return json({ error: "Not authorised for this withdrawal." }, 403);
    if (!["requested", "approved"].includes(w.status)) return json({ error: "This withdrawal request is no longer active." }, 409);
    const { data: recipients, error: rErr } = await admin.from("admin_notification_recipients").select("user_id,phone_e164").eq("withdrawal_alerts_enabled", true);
    if (rErr) throw rErr;
    if (!recipients?.length) return json({ error: "No admin WhatsApp recipients are configured." }, 409);
    const pr = await fetch(`https://api.paystack.co/transferrecipient/${encodeURIComponent(w.payout_recipient_code)}`, { headers: { Authorization: `Bearer ${paystackKey}`, Accept: "application/json" } });
    const pp = await pr.json().catch(() => ({}));
    if (!pr.ok || pp?.status !== true) throw new Error("Could not retrieve the verified bank destination from Paystack.");
    const d = pp?.data?.details ?? {}, accountNumber = String(d.account_number ?? "");
    if (!/^\d{10}$/.test(accountNumber)) throw new Error("Paystack did not return a valid 10-digit account number.");
    const accountName = String(d.account_name ?? w.account_name), bankName = String(d.bank_name ?? w.bank_name);
    const shop = Array.isArray(w.vendors) ? String(w.vendors[0]?.shop_name ?? "tradR. seller") : String(w.vendors?.shop_name ?? "tradR. seller");
    const amount = new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(Number(w.amount_kobo) / 100);
    const ref = String(w.id).slice(0,8).toUpperCase(), version = Deno.env.get("WHATSAPP_API_VERSION") ?? "v22.0";
    let sent = 0, failed = 0;
    for (const recipient of recipients) {
      const phone = String(recipient.phone_e164);
      const { data: prior } = await admin.from("whatsapp_withdrawal_alerts").select("id,status").eq("withdrawal_request_id",requestId).eq("phone_e164",phone).maybeSingle();
      if (prior?.status === "sent") { sent++; continue; }
      const { data: row, error: upsertErr } = await admin.from("whatsapp_withdrawal_alerts").upsert({ withdrawal_request_id:requestId,phone_e164:phone,status:"sending",error_code:null,updated_at:new Date().toISOString() },{onConflict:"withdrawal_request_id,phone_e164"}).select("id").single();
      if (upsertErr || !row) { failed++; continue; }
      try {
        const { data: intro } = await admin.from("whatsapp_contact_introductions").select("phone_e164").eq("phone_e164",phone).maybeSingle();
        if (!intro) {
          await send(phone,{type:"template",template:{name:welcomeTemplate,language:{code:welcomeLanguage}}},waToken,waPhoneId,version);
          await admin.from("whatsapp_contact_introductions").upsert({phone_e164:phone,intro_template_name:welcomeTemplate,intro_sent_at:new Date().toISOString()},{onConflict:"phone_e164"});
        }
        const messageId = await send(phone,{type:"template",template:{name:alertTemplate,language:{code:alertLanguage},components:[{type:"body",parameters:[
          {type:"text",text:shop},{type:"text",text:amount},{type:"text",text:accountName},{type:"text",text:bankName},{type:"text",text:accountNumber},{type:"text",text:ref}
        ]}]}},waToken,waPhoneId,version);
        await admin.from("whatsapp_withdrawal_alerts").update({status:"sent",provider_message_id:messageId,sent_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",row.id); sent++;
      } catch (e) {
        const safe = e instanceof Error ? e.message.slice(0,160) : "WhatsApp send failed";
        await admin.from("whatsapp_withdrawal_alerts").update({status:"failed",error_code:safe,updated_at:new Date().toISOString()}).eq("id",row.id);
        console.error("Withdrawal alert delivery failed:",safe); failed++;
      }
    }
    return json({request_id:requestId,recipients:recipients.length,sent,failed});
  } catch (e) {
    const message = e instanceof Error ? e.message : "Notification failed.";
    console.error("notify-withdrawal-admins failed:",message); return json({error:message},500);
  }
});