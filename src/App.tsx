import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'

const categories = [
  ['All finds', '✳'], ['Food & Drinks', '🥘'], ['Fashion & Thrift', '🧥'], ['Electronics', '🎧'],
  ['Beauty & Hair', '💅'], ['Books & Study Materials', '📚'], ['Tech Services', '💻'],
  ['Laundry & Cleaning', '🫧'], ['Accommodation', '🏡'], ['Other Services', '✦']
]
type Listing = { id: string; title: string; description: string; category: string; price_ngn: number; image_urls: string[]; created_at: string; vendor?: { shop_name: string; whatsapp_number: string } | null }
const images = [
  'photo-1595476108010-b4d1f102b1b1','photo-1543076447-215ad9ba6923','photo-1505740420928-5e560c06d30e',
  'photo-1473093295043-cdd812d0e601','photo-1455390582262-044cdead277a','photo-1542291026-7eec264c27ff',
  'photo-1534528741775-53994a69daeb','photo-1496181133206-80ce9b88a853'
]
const demoListings: Listing[] = [
  ['Clean girl knotless braids','Beauty & Hair',12000,'Tomi Hair Studio','Neat, lightweight braids with a clean finish. Book your slot before the weekend.'],
  ['Vintage denim jacket','Fashion & Thrift',8500,'Second Story','A really good thrift find. Size M, great condition, ready for pickup on campus.'],
  ['Your new everyday headphones','Electronics',18500,'Plug Point LCU','Wireless headphones with a full sound and long battery life. Test before you buy.'],
  ['Late-night pasta bowl','Food & Drinks',4500,'The Hungry Student','Creamy pasta, grilled chicken and a little heat. Made fresh and delivered around campus.'],
  ['BIO 201 study pack','Books & Study Materials',2500,'Study Plug','Well-organised study notes and practice questions for revision season.'],
  ['Clean sneakers, no stress','Laundry & Cleaning',3000,'FreshStep Care','Deep clean for your favourite kicks. Drop off in the morning, collect same day.'],
  ['Portraits that feel like you','Other Services',10000,'Frame by Feyi','Natural-light portraits for birthdays, graduation shoots and your next profile picture.'],
  ['Laptop setup & quick fixes','Tech Services',5000,'Byte Buddy','Windows setup, software installs and laptop troubleshooting without the runaround.']
] as const).map((item, i) => ({ id: 'demo-' + i, title: item[0], category: item[1], price_ngn: item[2], vendor: { shop_name: item[3], whatsapp_number: '2348012345678' }, description: item[4], image_urls: ['https://images.unsplash.com/' + images[i] + '?auto=format&fit=crop&w=900&q=80'], created_at: new Date(Date.now() - i * 100000).toISOString() }))

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined
const db = url && key ? createClient(url, key) : null
const schema = z.object({ title: z.string().trim().min(3).max(120), description: z.string().trim().min(10).max(3000), category: z.string().min(1), price_ngn: z.coerce.number().int().min(0).max(100000000000) })
const money = (n: number) => new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(n)

function Icon({ name, size = 19 }: { name: string; size?: number }) {
  const paths: Record<string, string> = {
    search: 'm20 20-4.4-4.4M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z',
    heart: 'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z',
    arrow: 'M5 12h14m-7-7 7 7-7 7', plus: 'M12 5v14m-7-7h14',
    pin: 'M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Zm-5 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
    close: 'M18 6 6 18M6 6l12 12', check: 'm5 12 4 4L19 6',
    message: 'M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z',
    sliders: 'M4 21v-7m0-4V3m8 18v-9m0-4V3m8 18v-5m0-4V3M2 14h4m4-6h4m4 8h4'
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name] ?? paths.arrow} /></svg>
}

export default function App() {
  const [category, setCategory] = useState('All finds')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('latest')
  const [favorites, setFavorites] = useState<string[]>([])
  const [authOpen, setAuthOpen] = useState(false)
  const [listingOpen, setListingOpen] = useState(false)
  const [selected, setSelected] = useState<Listing | null>(null)
  const [toast, setToast] = useState('')
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null)
  const [authMode, setAuthMode] = useState<'signup' | 'signin'>('signup')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ title: '', description: '', category: '', price_ngn: '' })

  const query = useQuery({
    queryKey: ['listings'],
    queryFn: async () => {
      if (!db) return demoListings
      const { data, error } = await db.from('listings').select('id,title,description,category,price_ngn,image_urls,created_at,vendor:vendors(shop_name,whatsapp_number)').eq('status', 'published').eq('moderation_status', 'approved').gt('visible_until', new Date().toISOString()).order('created_at', { ascending: false }).limit(24)
      if (error) throw error
      return (data ?? []) as unknown as Listing[]
    }
  })

  useEffect(() => {
    if (!db) return
    db.auth.getSession().then(({ data }) => { const u = data.session?.user; if (u) setUser({ id: u.id, email: u.email }) })
    const { data } = db.auth.onAuthStateChange((_event, session) => setUser(session?.user ? { id: session.user.id, email: session.user.email } : null))
    return () => data.subscription.unsubscribe()
  }, [])
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(''), 3200); return () => window.clearTimeout(timer) }, [toast])

  const listings = useMemo(() => {
    const term = search.toLowerCase().trim()
    return [...(query.data ?? [])].filter((l) => (category === 'All finds' || l.category === category) && (!term || [l.title, l.description, l.category, l.vendor?.shop_name ?? ''].some((v) => v.toLowerCase().includes(term))))
      .sort((a, b) => sort === 'price-low' ? a.price_ngn - b.price_ngn : sort === 'price-high' ? b.price_ngn - a.price_ngn : Date.parse(b.created_at) - Date.parse(a.created_at))
  }, [query.data, search, category, sort])

  async function authSubmit(e: FormEvent) {
    e.preventDefault()
    if (!db) { setToast('Supabase is not configured yet.'); return }
    setBusy(true)
    try {
      if (authMode === 'signup') {
        const { data, error } = await db.auth.signUp({ email, password, options: { data: { display_name: name.trim() } } })
        if (error) throw error
        setToast(data.session ? 'Account created. Welcome to tradR!' : 'Check your email to confirm your account.')
      } else {
        const { error } = await db.auth.signInWithPassword({ email, password })
        if (error) throw error
        setToast('Welcome back!')
      }
      setAuthOpen(false)
    } catch (err) { setToast(err instanceof Error ? err.message : 'Could not sign in.') } finally { setBusy(false) }
  }

  async function createListing(e: FormEvent) {
    e.preventDefault()
    const parsed = schema.safeParse({ ...form, price_ngn: form.price_ngn })
    if (!parsed.success) { setToast(parsed.error.issues[0]?.message ?? 'Check your listing details.'); return }
    if (!db || !user) { setListingOpen(false); setAuthOpen(true); setToast('Sign in first to create a listing.'); return }
    setBusy(true)
    try {
      const { data: vendor, error: vendorError } = await db.from('vendors').select('id').eq('profile_id', user.id).maybeSingle()
      if (vendorError) throw vendorError
      if (!vendor) { setToast('Vendor onboarding is coming next.'); return }
      const { error } = await db.from('listings').insert({ ...parsed.data, vendor_id: vendor.id, status: 'draft' })
      if (error) throw error
      setToast('Draft saved for review and subscription activation.')
      setListingOpen(false)
      setForm({ title: '', description: '', category: '', price_ngn: '' })
      await query.refetch()
    } catch (err) { setToast(err instanceof Error ? err.message : 'Could not save listing.') } finally { setBusy(false) }
  }

  const img = (l: Listing) => l.image_urls?.[0] || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=900&q=80'
  const closeModal = () => { setAuthOpen(false); setListingOpen(false); setSelected(null) }

  return <div className="app-shell">
    <div className="announcement"><span className="announcement-dot" /> YOUR CAMPUS, YOUR COMMUNITY. <span>Made for LCU students.</span><b>↗</b></div>
    <header className="site-header">
      <a className="brand" href="#" onClick={() => { setCategory('All finds'); setSearch('') }}><span className="brand-mark">t<span>.</span></span><span className="brand-word">tradR<span>.</span></span></a>
      <div className="header-location"><Icon name="pin" size={17}/><span><b>Lead City University</b><small>Ibadan, Nigeria</small></span><span className="chevron">⌄</span></div>
      <label className="header-search"><Icon name="search" size={18}/><input placeholder="Find anything on campus..." value={search} onChange={e => setSearch(e.target.value)} aria-label="Search marketplace"/><kbd>⌘ K</kbd></label>
      <nav className="header-actions"><button className="nav-link" onClick={() => document.getElementById('marketplace')?.scrollIntoView({ behavior: 'smooth' })}>Explore</button><button className="nav-link" onClick={() => setToast(favorites.length ? favorites.length + ' finds saved.' : 'Tap a heart to save a find.')}>Saved <sup>{favorites.length || ''}</sup></button>{user ? <button className="login-button" onClick={async () => { await db?.auth.signOut(); setUser(null); setToast('Signed out.') }}>{(user.email?.[0] ?? 'U').toUpperCase()} · Sign out</button> : <button className="login-button" onClick={() => { setAuthMode('signin'); setAuthOpen(true) }}>Log in</button>}<button className="sell-button" onClick={() => user ? setListingOpen(true) : setAuthOpen(true)}><Icon name="plus" size={17}/> Sell something</button></nav>
    </header>

    <main>
      <section className="hero">
        <div className="hero-copy"><div className="eyebrow"><span>✳</span> THE LCU MARKETPLACE</div><h1>Good finds.<br/>Great <em>people.</em></h1><p className="hero-subtitle">From your next favourite fit to that person who fixes everything. Find it right here on campus.</p>
          <label className="hero-search"><Icon name="search" size={20}/><input placeholder="What are you looking for?" value={search} onChange={e => setSearch(e.target.value)} aria-label="Search listings"/><button onClick={() => document.getElementById('marketplace')?.scrollIntoView({ behavior: 'smooth' })}>Find it <Icon name="arrow" size={17}/></button></label>
          <div className="hero-footnote"><span className="avatar-stack"><i>O</i><i>T</i><i>A</i><i>+</i></span><span><b>LCU people,</b> real deals.</span><span className="footnote-divider"/><span className="trust-stars">★★★★★</span><span>Built for campus life</span></div>
        </div>
        <div className="hero-art"><div className="hero-art-bg"/><div className="hero-sticker">THE GOOD<br/>STUFF IS<br/><b>CLOSE BY.</b><span>↘</span></div><div className="hero-photo hero-photo-main"><img src="https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=1000&q=85" alt="Streetwear style inspiration"/><span className="photo-label">STYLE FINDS <b>↗</b></span></div><div className="hero-photo hero-photo-small"><img src="https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=600&q=85" alt="Coffee on a table"/></div><div className="hero-floating-card"><span>✳</span><div><b>Something good</b><small>is always nearby</small></div><strong>↗</strong></div><div className="hero-art-caption">YOUR CAMPUS. YOUR PEOPLE. YOUR MARKET.</div></div>
        <div className="hero-bottomline"><span>01 / THE CAMPUS EDIT</span><i/><span>SCROLL TO EXPLORE ↓</span></div>
      </section>

      <section className="category-section"><div className="section-topline"><span>YOUR NEXT FIND IS IN HERE</span><span>01 — 09</span></div><div className="category-row">{categories.map(([label, emoji]) => <button key={label} className={category === label ? 'category-pill active' : 'category-pill'} onClick={() => { setCategory(label); document.getElementById('marketplace')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }}><span>{emoji}</span>{label}</button>)}</div></section>

      <section className="marketplace-section" id="marketplace"><div className="marketplace-heading"><div><div className="eyebrow"><span>✳</span> THE MARKETPLACE</div><h2>Good stuff, <em>found.</em></h2><p>The things you need, from people just around the corner.</p></div><button className="outline-button" onClick={() => { setCategory('All finds'); setSearch(''); setSort('latest') }}>See everything <Icon name="arrow" size={17}/></button></div>
        <div className="market-toolbar"><div className="results-count"><span/> {query.isLoading ? 'Finding your next thing…' : listings.length + ' finds to fall for'} <i>/ at Lead City</i></div><div className="toolbar-actions"><label htmlFor="sort">Sort by</label><select id="sort" value={sort} onChange={e => setSort(e.target.value)}><option value="latest">Latest finds</option><option value="price-low">Price: low to high</option><option value="price-high">Price: high to low</option></select><button className="filter-button" onClick={() => setToast('Choose a category above to narrow your finds.')}><Icon name="sliders" size={17}/> Filters</button></div></div>
        {query.isError && <div className="inline-notice">We couldn’t reach the live marketplace. <button onClick={() => query.refetch()}>Try again</button></div>}
        {query.isLoading ? <div className="listing-grid">{[1,2,3,4].map(n => <div className="skeleton-card" key={n}><div/><span/><span/></div>)}</div> : listings.length ? <div className="listing-grid">{listings.map((l, i) => <article className="listing-card" key={l.id}><button className="listing-image-button" onClick={() => setSelected(l)} aria-label={'View ' + l.title}><img className="listing-image" src={img(l)} alt={l.title} loading={i > 3 ? 'lazy' : 'eager'}/>{i === 0 && <span className="listing-badge">CAMPUS FAVOURITE</span>}<span className="image-open"><Icon name="arrow"/></span></button><button className={favorites.includes(l.id) ? 'favorite-button is-favorite' : 'favorite-button'} onClick={() => setFavorites(old => old.includes(l.id) ? old.filter(x => x !== l.id) : [...old, l.id])} aria-label="Save listing"><Icon name="heart"/></button><div className="listing-meta"><span>{l.category}</span><b>✳</b></div><button className="listing-title" onClick={() => setSelected(l)}>{l.title}</button><div className="listing-vendor"><span className="vendor-avatar">{(l.vendor?.shop_name?.[0] ?? 'L').toUpperCase()}</span><span>{l.vendor?.shop_name ?? 'LCU seller'}</span><i>·</i><span>LCU</span></div><div className="listing-bottom"><strong>{money(Number(l.price_ngn))}</strong><button onClick={() => setSelected(l)} aria-label="Listing details"><Icon name="arrow"/></button></div></article>)}</div> : <div className="empty-state"><span className="empty-icon"><Icon name="search" size={25}/></span><h3>No finds just yet.</h3><p>Try another search or category. Your next favourite thing is out there.</p><button className="outline-button" onClick={() => { setSearch(''); setCategory('All finds') }}>Clear filters</button></div>}
        <div className="marketplace-end"><span>THAT'S THE CAMPUS EDIT, FOR NOW.</span><b>✳</b><span>MORE GOOD THINGS COMING.</span></div>
      </section>

      <section className="seller-banner"><div className="seller-banner-mark">t<span>.</span></div><div className="seller-banner-copy"><span className="eyebrow">GOT SOMETHING GOOD?</span><h2>Your side hustle<br/>looks good <em>here.</em></h2><p>Put your product or service in front of the people who need it. Your next customer might be two blocks away.</p><button onClick={() => user ? setListingOpen(true) : setAuthOpen(true)}>Start selling <Icon name="arrow" size={17}/></button></div><div className="seller-banner-art"><div className="seller-circle circle-one"/><div className="seller-circle circle-two"/><div className="seller-note note-one">YOUR<br/>THING.</div><div className="seller-note note-two">YOUR<br/>PEOPLE. <span>↗</span></div><div className="seller-banner-grid"/></div><div className="seller-banner-foot"><span>MADE FOR THE MAKERS.</span><span>LCU / IBADAN / NIGERIA</span></div></section>
      <section className="trust-strip"><div><span className="trust-icon">↗</span><span><b>Real campus connections</b><small>Find people who are right here.</small></span></div><div><span className="trust-icon">♡</span><span><b>Keep it direct</b><small>Talk to sellers on WhatsApp.</small></span></div><div><span className="trust-icon">✳</span><span><b>Made for LCU</b><small>Your campus community, in one place.</small></span></div></section>
    </main>

    <footer className="site-footer"><a className="brand" href="#"><span className="brand-mark">t<span>.</span></span><span className="brand-word">tradR<span>.</span></span></a><span className="footer-note">GOOD FINDS TRAVEL FAST.</span><span className="footer-copy">© 2026 tradR. Made for campus life.</span><button onClick={() => setToast('For safety concerns, please contact the tradR admin team.')}>Safety & support ↗</button></footer>
    <nav className="mobile-bottom-nav"><button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}><span>⌂</span>Home</button><button onClick={() => document.getElementById('marketplace')?.scrollIntoView({ behavior: 'smooth' })}><Icon name="search"/>Explore</button><button onClick={() => setToast(favorites.length ? favorites.length + ' saved finds.' : 'Tap a heart to save a find.')}><Icon name="heart"/>Saved</button><button onClick={() => user ? setListingOpen(true) : setAuthOpen(true)}><Icon name="plus"/>Sell</button></nav>

    {selected && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setSelected(null) }}><section className="detail-modal" role="dialog" aria-modal="true" aria-label="Listing details"><button className="modal-close" onClick={() => setSelected(null)} aria-label="Close"><Icon name="close"/></button><img className="detail-image" src={img(selected)} alt={selected.title}/><div className="detail-content"><span className="detail-category">{selected.category}</span><h2>{selected.title}</h2><strong className="detail-price">{money(Number(selected.price_ngn))}</strong><p>{selected.description}</p><div className="detail-seller"><span className="vendor-avatar large">{(selected.vendor?.shop_name?.[0] ?? 'L').toUpperCase()}</span><span><b>{selected.vendor?.shop_name ?? 'LCU seller'}</b><small>Lead City University · Ibadan</small></span></div><button className="whatsapp-button" onClick={() => { const phone = selected.vendor?.whatsapp_number; if (!phone) { setToast('Seller contact is not available yet.'); return } window.open('https://wa.me/' + phone + '?text=' + encodeURIComponent('Hi! I found "' + selected.title + '" on tradR. Is it still available?'), '_blank', 'noopener,noreferrer') }}><Icon name="message"/> Chat with seller on WhatsApp <Icon name="arrow"/></button><small className="direct-note">You’ll connect directly with the seller. Always meet safely on campus.</small></div></section></div>}

    {authOpen && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) closeModal() }}><section className="form-modal" role="dialog" aria-modal="true" aria-labelledby="auth-heading"><button className="modal-close" onClick={closeModal} aria-label="Close"><Icon name="close"/></button><div className="modal-brand-mark">t<span>.</span></div><span className="eyebrow">COME ON IN</span><h2 id="auth-heading">{authMode === 'signup' ? 'Your people are here.' : 'Good to have you back.'}</h2><p>{authMode === 'signup' ? 'Make an account and get closer to the good stuff.' : 'Sign in to pick up where you left off.'}</p><form onSubmit={authSubmit}>{authMode === 'signup' && <label>Your name<input value={name} onChange={e => setName(e.target.value)} required minLength={2} placeholder="What should we call you?"/></label>}<label>Email address<input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="you@example.com" autoComplete="email"/></label><label>Password<input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} placeholder="At least 8 characters" autoComplete={authMode === 'signup' ? 'new-password' : 'current-password'}/></label><button className="modal-primary" disabled={busy}>{busy ? 'One sec…' : authMode === 'signup' ? 'Create my account' : 'Log in'} <Icon name="arrow"/></button></form><div className="modal-switch">{authMode === 'signup' ? 'Already part of the crew?' : 'New around here?'} <button onClick={() => setAuthMode(authMode === 'signup' ? 'signin' : 'signup')}>{authMode === 'signup' ? 'Log in' : 'Create an account'}</button></div><small className="form-footnote">Use tradR responsibly and treat fellow students with respect.</small></section></div>}

    {listingOpen && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setListingOpen(false) }}><section className="form-modal listing-form-modal" role="dialog" aria-modal="true" aria-labelledby="listing-heading"><button className="modal-close" onClick={closeModal} aria-label="Close"><Icon name="close"/></button><div className="modal-brand-mark">t<span>.</span></div><span className="eyebrow">PUT IT OUT THERE</span><h2 id="listing-heading">List something good.</h2><p>Your listing will be saved as a draft for review.</p><form onSubmit={createListing}><label>What are you offering?<input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} required minLength={3} maxLength={120} placeholder="e.g. Freshly baked brownies"/></label><label>Category<select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} required><option value="">Choose a category</option>{categories.slice(1).map(([c]) => <option key={c} value={c}>{c}</option>)}</select></label><label>Price in naira<input type="number" min="0" value={form.price_ngn} onChange={e => setForm({ ...form, price_ngn: e.target.value })} required placeholder="e.g. 5000"/></label><label>Tell us a little more<textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} required minLength={10} maxLength={3000} rows={3} placeholder="What should a buyer know?"/></label><button className="modal-primary" disabled={busy}>{busy ? 'Saving…' : 'Save draft'} <Icon name="arrow"/></button></form><small className="form-footnote">Listings go live after moderation and the ₦500 / 30-day subscription is activated.</small></section></div>}
    {toast && <div className="toast-message" role="status"><span><Icon name="check" size={17}/></span>{toast}<button onClick={() => setToast('')} aria-label="Dismiss"><Icon name="close" size={16}/></button></div>}
  </div>
}
