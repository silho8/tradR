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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return respond({ error: "Method not allowed." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return respond({ error: "Admin service is not configured." }, 503);

  const authorization = req.headers.get("Authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) return respond({ error: "Sign in to continue." }, 401);

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    const user = authData.user;
    if (authError || !user) return respond({ error: "Your session is invalid. Sign in again." }, 401);
    if (user.app_metadata?.role !== "admin") return respond({ error: "Admin access is required." }, 403);

    const body = await req.json().catch(() => ({}));
    const action = typeof body.action === "string" ? body.action : "load";

    if (action === "load") {
      const [vendors, reports, activeListings] = await Promise.all([
        admin.from("vendors").select("id,shop_name,bio,whatsapp_number,verification_status,created_at,profile_id").eq("verification_status", "pending").order("created_at", { ascending: true }).limit(50),
        admin.from("seller_reports").select("id,reason,details,status,created_at,vendor_id,listing_id,evidence_paths,vendors(shop_name),listings(title)").in("status", ["pending", "reviewing"]).order("created_at", { ascending: true }).limit(50),
        admin.from("listings").select("id,title,description,category,price_ngn,image_urls,status,moderation_status,created_at,visible_until,vendor_id,vendors(shop_name,verification_status)").eq("status", "published").eq("moderation_status", "approved").gt("visible_until", new Date().toISOString()).order("created_at", { ascending: false }).limit(500),
      ]);
      const failure = vendors.error ?? reports.error ?? activeListings.error;
      if (failure) throw failure;
      const reportsWithEvidence = await Promise.all((reports.data ?? []).map(async report => {
        const evidenceUrls = await Promise.all((report.evidence_paths ?? []).map(async (path: string) => {
          const { data, error } = await admin.storage.from("report-evidence").createSignedUrl(path, 600);
          return error ? null : data.signedUrl;
        }));
        return { ...report, evidence_urls: evidenceUrls.filter(Boolean) };
      }));
      return respond({ vendors: vendors.data ?? [], reports: reportsWithEvidence, active_listings: activeListings.data ?? [] });
    }

    const id = typeof body.id === "string" ? body.id : "";
    if (!/^[0-9a-f-]{36}$/i.test(id)) return respond({ error: "A valid record ID is required." }, 400);

    if (action === "review_vendor") {
      const status = body.status;
      if (status !== "approved" && status !== "rejected") return respond({ error: "Choose approved or rejected." }, 400);
      const { data, error } = await admin.from("vendors").update({ verification_status: status }).eq("id", id).eq("verification_status", "pending").select("id").maybeSingle();
      if (error) throw error;
      if (!data) return respond({ error: "This shop is no longer pending review. Refresh the queue." }, 409);
      return respond({ success: true });
    }

    if (action === "remove_listing") {
      const { data, error } = await admin.from("listings").update({ status: "archived" }).eq("id", id).eq("status", "published").eq("moderation_status", "approved").select("id").maybeSingle();
      if (error) throw error;
      if (!data) return respond({ error: "This listing is no longer active. Refresh the admin desk." }, 409);
      return respond({ success: true, removed: true });
    }

    if (action === "review_report") {
      const status = body.status;
      if (status !== "reviewing" && status !== "resolved" && status !== "dismissed") return respond({ error: "Choose a valid report status." }, 400);
      const { data, error } = await admin.from("seller_reports").update({ status, updated_at: new Date().toISOString() }).eq("id", id).in("status", ["pending", "reviewing"]).select("id").maybeSingle();
      if (error) throw error;
      if (!data) return respond({ error: "This report is no longer active. Refresh the queue." }, 409);
      return respond({ success: true });
    }

    return respond({ error: "Unknown admin action." }, 400);
  } catch (error) {
    console.error("admin-moderation failed:", error instanceof Error ? error.message : "unknown error");
    return respond({ error: "The admin action could not be completed. Please refresh and try again." }, 500);
  }
});
