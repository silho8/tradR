import { createClient } from "npm:@supabase/supabase-js@2";
const headers = { "Access-Control-Allow-Origin":"*", "Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods":"POST, OPTIONS", "Content-Type":"application/json" };
const respond = (body: unknown, status=200) => new Response(JSON.stringify(body), { status, headers });
const esc = (s:string) => s.replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c] ?? c));
async function send(key:string,to:string,subject:string,html:string) {
 const r=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json"},body:JSON.stringify({from:"tradR. <support@tradrr.store>",to:[to],subject,html})});
 if(!r.ok){console.error("Agent email failed:",r.status,(await r.text()).slice(0,400));return false;} return true;
}
Deno.serve(async req=>{
 if(req.method==="OPTIONS") return new Response("ok",{headers});
 if(req.method!=="POST") return respond({error:"Method not allowed."},405);
 const url=Deno.env.get("SUPABASE_URL"), service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), key=Deno.env.get("RESEND_API_KEY");
 if(!url||!service||!key) return respond({error:"Agent email service is not configured."},503);
 const bearer=req.headers.get("Authorization")??"", token=bearer.startsWith("Bearer ")?bearer.slice(7):"";
 if(!token) return respond({error:"Sign in to continue."},401);
 const admin=createClient(url,service,{auth:{autoRefreshToken:false,persistSession:false}});
 try {
  const {data:auth,error:authError}=await admin.auth.getUser(token), actor=auth.user;
  if(authError||!actor) return respond({error:"Your session is invalid. Sign in again."},401);
  const body=await req.json().catch(()=>({})), action=body.action;
  if(action==="application_submitted"){
   const {data:agent,error}=await admin.from("delivery_agents").select("id,user_id,display_name,phone,status,created_at").eq("user_id",actor.id).maybeSingle();
   if(error) throw error;
   if(!agent||agent.status!=="pending") return respond({error:"No pending delivery-agent application was found."},404);
   if(!actor.email) return respond({error:"Your account has no email address."},400);
   const name=esc(agent.display_name), date=new Date(agent.created_at).toLocaleString("en-NG",{timeZone:"Africa/Lagos"})+" WAT";
   const applicantHtml=`<div style="font-family:Arial,sans-serif;max-width:580px;margin:auto;color:#172b3a"><div style="background:#102a43;color:#c6e28b;padding:22px;font-size:24px;font-weight:bold">tradR.</div><div style="padding:28px 22px"><p style="color:#718096;font-size:12px;font-weight:bold;letter-spacing:1.5px">ERRAND · DELIVERY NETWORK</p><h1>We’ve received your application.</h1><p>Hi ${name},</p><p>Your application to become a tradR. Errand delivery agent has been submitted successfully. Our team will review your LCU student proof and selfie before making a decision.</p><div style="background:#f3f6f2;padding:16px;border-radius:8px"><p><strong>Application status:</strong> Pending review</p><p><strong>Submitted:</strong> ${date}</p></div><p>We’ll email you again when your application has been reviewed.</p><p><a href="https://errand.tradrr.store/" style="display:inline-block;background:#c6e28b;color:#102a43;padding:13px 18px;text-decoration:none;font-weight:bold">Open tradR. Errand</a></p><p style="color:#687782;font-size:13px">Need help? Reply to this email or contact support@tradrr.store.</p></div></div>`;
   const adminHtml=`<div style="font-family:Arial,sans-serif;max-width:580px;margin:auto;color:#172b3a"><div style="background:#102a43;color:#c6e28b;padding:22px;font-size:24px;font-weight:bold">tradR. Admin</div><div style="padding:28px 22px"><h1>New delivery-agent application</h1><p>A new Errand application is waiting for review.</p><p><strong>Name:</strong> ${name}<br/><strong>Phone:</strong> ${esc(agent.phone)}<br/><strong>Status:</strong> Pending review<br/><strong>Submitted:</strong> ${date}</p><p>Open Admin and review the applicant’s LCU student proof and selfie.</p><p><a href="https://admin.tradrr.store/" style="display:inline-block;background:#c6e28b;color:#102a43;padding:13px 18px;text-decoration:none;font-weight:bold">Open Admin dashboard</a></p></div></div>`;
   const [applicantSent,adminSent]=await Promise.all([send(key,actor.email,"We received your tradR. Errand agent application",applicantHtml),send(key,"support@tradrr.store",`New delivery-agent application: ${agent.display_name}`,adminHtml)]);
   return respond({success:applicantSent||adminSent,applicant_email_sent:applicantSent,admin_email_sent:adminSent});
  }
  if(action==="status_updated"){
   if(actor.app_metadata?.role!=="admin") return respond({error:"Admin access is required."},403);
   const id=typeof body.agent_id==="string"?body.agent_id:"", status=body.status;
   if(!/^[0-9a-f-]{36}$/i.test(id)||!["approved","suspended"].includes(status)) return respond({error:"A valid agent and review status are required."},400);
   const {data:agent,error}=await admin.from("delivery_agents").select("id,user_id,display_name,status").eq("id",id).maybeSingle();
   if(error) throw error;
   if(!agent||agent.status!==status) return respond({error:"The agent review status could not be verified."},409);
   const {data:account,error:accountError}=await admin.auth.admin.getUserById(agent.user_id);
   if(accountError) throw accountError;
   const recipient=account.user?.email;
   if(!recipient) return respond({error:"The agent account has no email address."},404);
   const approved=status==="approved", subject=approved?"Your tradR. Errand agent application is approved":"An update about your tradR. Errand agent application";
   const heading=approved?"You’re approved!":"Your agent access has changed";
   const message=approved?"Your identity review is complete and your delivery-agent application has been approved. You can now open Errand and accept available delivery jobs.":"Your tradR. Errand delivery-agent access is currently suspended. Please contact the tradR. team if you need clarification.";
   const html=`<div style="font-family:Arial,sans-serif;max-width:580px;margin:auto;color:#172b3a"><div style="background:#102a43;color:#c6e28b;padding:22px;font-size:24px;font-weight:bold">tradR.</div><div style="padding:28px 22px"><p style="color:#718096;font-size:12px;font-weight:bold;letter-spacing:1.5px">ERRAND · APPLICATION UPDATE</p><h1>${heading}</h1><p>Hi ${esc(agent.display_name)},</p><p>${message}</p><p><a href="https://errand.tradrr.store/" style="display:inline-block;background:#c6e28b;color:#102a43;padding:13px 18px;text-decoration:none;font-weight:bold">Open tradR. Errand</a></p><p style="color:#687782;font-size:13px">Need help? Reply to this email or contact support@tradrr.store.</p></div></div>`;
   const sent=await send(key,recipient,subject,html);
   return respond({success:sent,applicant_email_sent:sent});
  }
  return respond({error:"Unknown notification action."},400);
 } catch(error) {
  console.error("delivery-agent-notifications failed:",error instanceof Error?error.message:"unknown");
  return respond({error:"Could not send the delivery-agent email notification."},500);
 }
});
