import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}
async function paystack(path: string, key: string, init: RequestInit = {}) {
  const response = await fetch("https://api.paystack.co" + path, {
    ...init,
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json", "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.status !== true) throw new Error(typeof payload?.message === "string" ? payload.message : "Paystack could not verify those bank details.");
  return payload.data;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return respond({ error: "Method not allowed." }, 405);
  const supabaseUrl = Deno.env.get("SUPABASE_URL"), serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), paystackKey = Deno.env.get("PAYSTACK_SECRET_KEY");
  if (!supabaseUrl || !serviceKey || !paystackKey) return respond({ error: "Seller payment setup is temporarily unavailable." }, 503);
  const authorization = req.headers.get("Authorization") ?? "", token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) return respond({ error: "Sign in to continue." }, 401);
  const admin = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  try {
    const { data: authData, error: authError } = await admin.auth.getUser(token), user = authData.user;
    if (authError || !user) return respond({ error: "Your session is invalid. Sign in again." }, 401);
    const body = await req.json().catch(() => ({})), action = typeof body.action === "string" ? body.action : "get";
    if (action === "banks") {
      const banks = await paystack("/bank?country=nigeria&currency=NGN&perPage=200", paystackKey);
      return respond({ banks: (Array.isArray(banks) ? banks : []).filter((bank: any) => bank?.code && bank?.name)
        .map((bank: any) => ({ code: String(bank.code), name: String(bank.name) }))
        .sort((a: {name:string}, b: {name:string}) => a.name.localeCompare(b.name)) });
    }
    if (action === "get") {
      const { data, error } = await admin.from("vendor_payout_accounts").select("bank_code,bank_name,account_name,account_last4,status,verified_at").eq("profile_id", user.id).maybeSingle();
      if (error) throw error;
      return respond({ account: data ?? null });
    }
    if (action !== "save") return respond({ error: "Unknown payment setup action." }, 400);
    const bankCode = typeof body.bank_code === "string" ? body.bank_code.trim() : "";
    const accountNumber = typeof body.account_number === "string" ? body.account_number.replace(/\s/g, "") : "";
    if (!/^\d{10}$/.test(accountNumber) || !/^[A-Za-z0-9_-]{2,20}$/.test(bankCode)) return respond({ error: "Enter a valid 10-digit Nigerian account number and choose a bank." }, 400);
    const resolved = await paystack(`/bank/resolve?account_number=${encodeURIComponent(accountNumber)}&bank_code=${encodeURIComponent(bankCode)}`, paystackKey, { method: "GET" });
    const accountName = typeof resolved?.account_name === "string" ? resolved.account_name.trim() : "";
    if (accountName.length < 2) return respond({ error: "Paystack could not confirm the account name. Check the details and try again." }, 422);
    const recipient = await paystack("/transferrecipient", paystackKey, { method: "POST", body: JSON.stringify({
      type: "nuban", name: accountName, account_number: accountNumber, bank_code: bankCode, currency: "NGN",
      email: user.email, description: "tradR. seller payout destination",
    }) });
    const recipientCode = typeof recipient?.recipient_code === "string" ? recipient.recipient_code : "";
    if (!/^RCP_/.test(recipientCode)) throw new Error("Paystack did not return a valid payout recipient.");
    const { data: vendor, error: vendorError } = await admin.from("vendors").select("id").eq("profile_id", user.id).maybeSingle();
    if (vendorError) throw vendorError;
    const bankName = typeof recipient?.details?.bank_name === "string" ? recipient.details.bank_name : String(body.bank_name ?? "Nigerian bank");
    const verifiedAt = new Date().toISOString();
    const { error: saveError } = await admin.from("vendor_payout_accounts").upsert({
      profile_id: user.id, vendor_id: vendor?.id ?? null, provider: "paystack", recipient_code: recipientCode,
      bank_code: bankCode, bank_name: bankName, account_name: accountName, account_last4: accountNumber.slice(-4),
      status: "verified", verified_at: verifiedAt, updated_at: verifiedAt,
    }, { onConflict: "profile_id" });
    if (saveError) throw saveError;
    return respond({ success: true, account: { bank_code: bankCode, bank_name: bankName, account_name: accountName, account_last4: accountNumber.slice(-4), status: "verified", verified_at: verifiedAt } });
  } catch (error) {
    console.error("seller-payout-setup failed:", error instanceof Error ? error.message : "unknown");
    return respond({ error: (error instanceof Error ? error.message : "Could not save your payment details.").slice(0, 220) }, 400);
  }
});
