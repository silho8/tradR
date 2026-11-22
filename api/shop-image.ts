declare const process: { env: Record<string, string | undefined> }
type VercelRequest = { query: Record<string, string | string[] | undefined>; headers: Record<string, string | string[] | undefined> }
type VercelResponse = { status(code: number): VercelResponse; send(body: string): VercelResponse; setHeader(name: string, value: string): void }
const url=process.env.VITE_SUPABASE_URL
const key=process.env.VITE_SUPABASE_PUBLISHABLE_KEY||process.env.VITE_SUPABASE_ANON_KEY
const esc=(v:unknown)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c] as string))
async function rest(path:string){if(!url||!key)throw new Error('Supabase env missing');const r=await fetch(`${url.replace(/\/$/,'')}/rest/v1/${path}`,{headers:{apikey:key,Authorization:`Bearer ${key}`}});if(!r.ok)throw new Error(`REST ${r.status}`);return r.json()}
export default async function handler(req:VercelRequest,res:VercelResponse){
 const id=String(req.query.id||'');if(!/^[a-zA-Z0-9-]{1,100}$/.test(id))return res.status(400).send('Invalid id')
 try{
  const rows=await rest(`vendors?select=shop_name,bio,logo_url,verification_status&id=eq.${encodeURIComponent(id)}&limit=1`) as Array<{shop_name:string;bio:string|null;logo_url:string|null;verification_status:string}>
  const v=rows[0];if(!v||v.verification_status!=='approved')return res.status(404).send('Shop not found')
  const listing=await rest(`listings?select=image_urls&vendor_id=eq.${encodeURIComponent(id)}&status=eq.published&moderation_status=eq.approved&visible_until=gt.${encodeURIComponent(new Date().toISOString())}&order=created_at.desc&limit=3`) as Array<{image_urls:string[]}>
  const images=listing.flatMap(x=>x.image_urls||[]).filter(Boolean).slice(0,3)
  const name=esc(v.shop_name.slice(0,48)),bio=esc((v.bio?.trim()||'Products and services from the Lead City University community.').slice(0,115))
  const clips=images.map((_,i)=>`<clipPath id="p${i}"><rect x="${700+i*145}" y="165" width="128" height="250" rx="18"/></clipPath>`).join('')
  const productImages=images.map((u,i)=>`<image href="${esc(u)}" x="${700+i*145}" y="165" width="128" height="250" preserveAspectRatio="xMidYMid slice" clip-path="url(#p${i})"/>`).join('')
  const logo=v.logo_url?`<clipPath id="logoClip"><rect x="86" y="176" width="96" height="96" rx="24"/></clipPath><image href="${esc(v.logo_url)}" x="86" y="176" width="96" height="96" preserveAspectRatio="xMidYMid slice" clip-path="url(#logoClip)"/>`:`<text x="134" y="240" text-anchor="middle" font-size="50" font-weight="700" fill="#c6ef65">${esc(v.shop_name.slice(0,1).toUpperCase())}</text>`
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#102a43"/><stop offset="1" stop-color="#183c54"/></linearGradient><linearGradient id="lime"><stop stop-color="#c7f36b"/><stop offset="1" stop-color="#a6d94d"/></linearGradient>${clips}</defs><rect width="1200" height="630" fill="url(#bg)"/><circle cx="50" cy="60" r="320" fill="#c6ef65" opacity=".05"/><rect x="52" y="52" width="610" height="526" rx="34" fill="#fff" opacity=".055"/><g font-family="Arial,sans-serif"><text x="86" y="130" font-size="25" font-weight="700" fill="#c6ef65">tradR.</text><rect x="86" y="176" width="96" height="96" rx="24" fill="#fff" opacity=".12"/>${logo}<text x="86" y="340" font-size="52" font-weight="700" fill="#fff">${name}</text><text x="86" y="388" font-size="20" fill="#d4e0ea">${bio}</text><text x="86" y="498" font-size="18" font-weight="700" fill="#c6ef65">MADE FOR LEAD CITY UNIVERSITY</text><text x="86" y="534" font-size="18" fill="#d4e0ea">Discover this shop at tradrr.store</text>${productImages}<rect x="700" y="456" width="418" height="74" rx="22" fill="url(#lime)"/><text x="909" y="502" text-anchor="middle" font-size="25" font-weight="700" fill="#102a43">OPEN SHOP ↗</text></g></svg>`
  res.setHeader('Content-Type','image/svg+xml; charset=utf-8');res.setHeader('Cache-Control','public, s-maxage=300, stale-while-revalidate=86400');return res.status(200).send(svg)
 }catch(e){console.error('shop image error',e);return res.status(503).send('Preview image unavailable')}
}
