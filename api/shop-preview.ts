declare const process: { env: Record<string, string | undefined> }
type VercelRequest = { query: Record<string, string | string[] | undefined>; headers: Record<string, string | string[] | undefined> }
type VercelResponse = { status(code: number): VercelResponse; send(body: string): VercelResponse; setHeader(name: string, value: string): void }
const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c] as string))
async function rest(path:string) {
 if (!supabaseUrl || !supabaseKey) throw new Error('Missing Supabase configuration')
 const r=await fetch(`${supabaseUrl.replace(/\/$/,'')}/rest/v1/${path}`,{headers:{apikey:supabaseKey,Authorization:`Bearer ${supabaseKey}`}})
 if(!r.ok) throw new Error(`Supabase REST ${r.status}`)
 return r.json()
}
export default async function handler(req:VercelRequest,res:VercelResponse) {
 const id=String(req.query.id||'')
 if(!/^[a-zA-Z0-9-]{1,100}$/.test(id)) return res.status(400).send('Invalid shop id')
 try {
  const vendors=await rest(`vendors?select=id,shop_name,bio,verification_status&id=eq.${encodeURIComponent(id)}&limit=1`) as Array<{id:string;shop_name:string;bio:string|null;verification_status:string}>
  const v=vendors[0]
  if(!v||v.verification_status!=='approved') return res.status(404).send('Shop not found')
  const host=req.headers['x-forwarded-host']||req.headers.host||'tradrr.store'
  const protocol=req.headers['x-forwarded-proto']||'https'
  const origin=`${protocol}://${host}`, canonical=`${origin}/shop/${encodeURIComponent(id)}`, image=`${origin}/api/shop-image?id=${encodeURIComponent(id)}`
  const description=(v.bio?.trim()||`Explore ${v.shop_name} on tradR., the marketplace made for Lead City University students.`).slice(0,300)
  const products=await rest(`listings?select=title&vendor_id=eq.${encodeURIComponent(id)}&status=eq.published&moderation_status=eq.approved&visible_until=gt.${encodeURIComponent(new Date().toISOString())}&order=created_at.desc&limit=3`) as Array<{title:string}>
  const title=`${v.shop_name} | tradR.`
  const meta=(name:string,value:string)=>`<meta ${name.startsWith('og:')?'property':'name'}="${name}" content="${esc(value)}">`
  const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(title)}</title><meta name="description" content="${esc(description)}"><link rel="canonical" href="${esc(canonical)}">${meta('og:type','website')}${meta('og:site_name','tradR.')}${meta('og:title',title)}${meta('og:description',description)}${meta('og:url',canonical)}${meta('og:image',image)}<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">${meta('twitter:card','summary_large_image')}${meta('twitter:title',title)}${meta('twitter:description',description)}${meta('twitter:image',image)}<meta name="robots" content="index,follow"><meta http-equiv="refresh" content="0;url=${esc(canonical)}"></head><body><h1>${esc(v.shop_name)}</h1><p>${esc(description)}</p><p>${esc(products.map(p=>p.title).join(' · '))}</p><a href="${esc(canonical)}">Open shop</a><script>location.replace(${JSON.stringify(canonical)})</script></body></html>`
  res.setHeader('Cache-Control','public, s-maxage=300, stale-while-revalidate=86400');res.setHeader('Content-Type','text/html; charset=utf-8');return res.status(200).send(html)
 } catch(e) { console.error('shop-preview error',e);return res.status(503).send('Shop preview unavailable') }
}
