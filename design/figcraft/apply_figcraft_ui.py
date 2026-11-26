from pathlib import Path
p=Path('/home/okikiola/Projects/tradR/src/App.tsx')
s=p.read_text()
# The mobile FigCraft home starts with search and categories, not a second oversized hero headline.
s=s.replace('        <h1 className="mobile-home-heading">Good finds, close by.</h1>\n','')
# Replace the mobile destinations with the FigCraft Explore / Cart / Saved / Orders / My shop navigation.
old='''      <button className={mobileTab === 'explore' ? 'active' : ''} onClick={() => { setMobileTab('explore'); setSearchOpen(false); setSavedOnly(false); setCategory('All finds'); setSearch(''); document.getElementById('marketplace')?.scrollIntoView({ behavior: 'smooth' }) }}><Icon name="search" size={20}/>Explore</button>
      <button className={mobileTab === 'sell' ? 'mobile-nav-sell active' : 'mobile-nav-sell'} onClick={() => { setMobileTab('sell'); void requireShopBeforeListing() }}><span className="mobile-nav-sell-icon"><Icon name="plus" size={21}/></span>Sell</button>
      <button className={mobileTab === 'saved' ? 'active' : ''} onClick={() => { setMobileTab('saved'); setSavedOnly(true); document.getElementById('marketplace')?.scrollIntoView({ behavior: 'smooth' }); if (!favorites.length) setToast('Save a find with the heart button and it will appear here.') }}><Icon name="heart" size={20}/>Saved{favorites.length > 0 && <sup>{favorites.length}</sup>}</button>
      <button className={mobileTab === 'orders' ? 'active' : ''} onClick={() => { setMobileTab('orders'); if (user) setBuyerOrdersOpen(true); else { setAuthMode('signin'); setAuthOpen(true) } }}><Icon name="orders" size={20}/>Orders</button>
      <button className={mobileTab === 'shop' ? 'active' : ''} onClick={() => { setMobileTab('shop'); if (user) void openDashboard(); else { setAuthMode('signin'); setAuthOpen(true) } }}><Icon name="shop" size={20}/>My shop</button>'''
new='''      <button className={mobileTab === 'explore' ? 'active' : ''} onClick={() => { setMobileTab('explore'); setSearchOpen(false); setSavedOnly(false); setCategory('All finds'); setSearch(''); document.getElementById('marketplace')?.scrollIntoView({ behavior: 'smooth' }) }}><Icon name="search" size={20}/>Explore</button>
      <button className="mobile-nav-cart" onClick={() => { window.dispatchEvent(new Event('tradr:open-cart')); }}><Icon name="cart" size={20}/>Cart</button>
      <button className={mobileTab === 'saved' ? 'active' : ''} onClick={() => { setMobileTab('saved'); setSavedOnly(true); document.getElementById('marketplace')?.scrollIntoView({ behavior: 'smooth' }); if (!favorites.length) setToast('Save a find with the heart button and it will appear here.') }}><Icon name="heart" size={20}/>Saved{favorites.length > 0 && <sup>{favorites.length}</sup>}</button>
      <button className={mobileTab === 'orders' ? 'active' : ''} onClick={() => { setMobileTab('orders'); if (user) setBuyerOrdersOpen(true); else { setAuthMode('signin'); setAuthOpen(true) } }}><Icon name="orders" size={20}/>Orders</button>
      <button className={mobileTab === 'shop' ? 'active' : ''} onClick={() => { setMobileTab('shop'); if (user) void openDashboard(); else { setAuthMode('signin'); setAuthOpen(true) } }}><Icon name="shop" size={20}/>My shop</button>'''
if old not in s: raise SystemExit('mobile nav block not found')
s=s.replace(old,new)
# Icon path for cart.
s=s.replace("    search: 'm20 20-4.4-4.4M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z',","    search: 'm20 20-4.4-4.4M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z',\n    cart: 'M3 3h2l2.2 11.2a2 2 0 0 0 2 1.6h8.9a2 2 0 0 0 1.9-1.4L22 8H6m4 12h.01M18 20h.01',")
p.write_text(s)

p=Path('/home/okikiola/Projects/tradR/src/CartCheckout.tsx')
s=p.read_text()
needle="""  useEffect(() => {
    const handleAdd = (event: Event) => {
      const listing = (event as CustomEvent<CartListing>).detail
      if (listing) void addToCart(listing)
    }
    window.addEventListener('tradr:add-to-cart', handleAdd)
    return () => window.removeEventListener('tradr:add-to-cart', handleAdd)
  }, [addToCart])
"""
insert=needle+"""
  useEffect(() => {
    const handleOpen = () => {
      if (!user) { onRequireSignIn(); return }
      void loadCart().then(() => setOpen(true)).catch(error => onToast(error instanceof Error ? error.message : 'Could not open your cart.'))
    }
    window.addEventListener('tradr:open-cart', handleOpen)
    return () => window.removeEventListener('tradr:open-cart', handleOpen)
  }, [loadCart, onRequireSignIn, onToast, user])
"""
if needle not in s: raise SystemExit('cart event hook not found')
s=s.replace(needle,insert)
p.write_text(s)
