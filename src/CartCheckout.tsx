import { useCallback, useEffect, useMemo, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'

type CartListing = {
  id: string
  title: string
  price_ngn: number
  stock_quantity?: number | null
  image_urls?: string[] | null
  vendor?: { id?: string; profile_id?: string; shop_name?: string } | null
}
type CartLine = {
  id: string
  listing_id: string
  quantity: number
  listing: CartListing | null
}
type CartUser = { id: string; email?: string }
type Props = {
  db: SupabaseClient
  user: CartUser | null
  onRequireSignIn: () => void
  onToast: (message: string) => void
  onOrderPaid: (orderId: string) => void
}

const money = (amount: number) => new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(amount)

export default function CartCheckout({ db, user, onRequireSignIn, onToast, onOrderPaid }: Props) {
  const [cartId, setCartId] = useState('')
  const [lines, setLines] = useState<CartLine[]>([])
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [buyerName, setBuyerName] = useState('')
  const [buyerPhone, setBuyerPhone] = useState('')
  const [buyerNote, setBuyerNote] = useState('')
  const [paymentChecking, setPaymentChecking] = useState(false)

  const subtotal = useMemo(() => lines.reduce((sum, line) => sum + Number(line.listing?.price_ngn ?? 0) * line.quantity, 0), [lines])
  const shopCount = new Set(lines.map(line => line.listing?.vendor?.id).filter((id): id is string => Boolean(id))).size
  const total = subtotal
  const itemCount = lines.reduce((sum, line) => sum + line.quantity, 0)

  const loadCart = useCallback(async () => {
    if (!user) {
      setCartId('')
      setLines([])
      return
    }
    const { data: cart, error: cartError } = await db.from('carts')
      .select('id')
      .eq('buyer_id', user.id)
      .eq('status', 'active')
      .maybeSingle()
    if (cartError) throw cartError
    if (!cart) {
      setCartId('')
      setLines([])
      return
    }
    const { data, error } = await db.from('cart_items')
      .select('id,listing_id,quantity,listing:listings(id,title,price_ngn,stock_quantity,image_urls,vendor:vendors(id,profile_id,shop_name))')
      .eq('cart_id', cart.id)
      .order('created_at', { ascending: true })
    if (error) throw error
    setCartId(cart.id)
    setLines((data ?? []) as unknown as CartLine[])
  }, [db, user?.id])

  useEffect(() => {
    if (!user) {
      setCartId('')
      setLines([])
      setBuyerName('')
      setBuyerPhone('')
      setBuyerNote('')
      return
    }
    setBuyerName('')
    setBuyerPhone('')
    setBuyerNote('')
    void loadCart().catch(error => console.warn('Could not load cart:', error instanceof Error ? error.message : error))
    void db.from('profiles').select('display_name').eq('id', user.id).maybeSingle().then(({ data }) => {
      if (data?.display_name) setBuyerName(current => current || data.display_name)
    })
  }, [db, loadCart, user?.id])

  const addToCart = useCallback(async (listing: CartListing) => {
    if (!user) {
      onRequireSignIn()
      return
    }
    if (!listing.id || listing.id.startsWith('demo-') || !listing.vendor?.id) {
      onToast('Only live approved listings can be added to your cart.')
      return
    }
    if (listing.vendor.profile_id === user.id) {
      onToast('You cannot buy from your own shop.')
      return
    }
    if (listing.stock_quantity === 0) { onToast('This product is sold out.'); return }
    setBusy(true)
    try {
      const { data: activeCart, error: cartError } = await db.from('carts')
        .select('id,shop_id')
        .eq('buyer_id', user.id)
        .eq('status', 'active')
        .maybeSingle()
      if (cartError) throw cartError

      let targetCartId = activeCart?.id ?? ''
      if (!targetCartId) {
        const { data: created, error } = await db.from('carts')
          .insert({ buyer_id: user.id, shop_id: listing.vendor.id })
          .select('id')
          .single()
        if (error) throw error
        targetCartId = created.id
      }

      const { data: existing, error: existingError } = await db.from('cart_items')
        .select('id,quantity')
        .eq('cart_id', targetCartId)
        .eq('listing_id', listing.id)
        .maybeSingle()
      if (existingError) throw existingError
      if (existing) {
        if (listing.stock_quantity !== null && listing.stock_quantity !== undefined && existing.quantity + 1 > listing.stock_quantity) { onToast(`Only ${listing.stock_quantity} available. Your cart already has ${existing.quantity}.`); return }
        const { error } = await db.from('cart_items').update({ quantity: existing.quantity + 1 }).eq('id', existing.id)
        if (error) throw error
      } else {
        const { error } = await db.from('cart_items').insert({ cart_id: targetCartId, listing_id: listing.id, quantity: 1 })
        if (error) throw error
      }
      await loadCart()
      setOpen(true)
      onToast('Added to your cart.')
    } catch (error) {
      onToast(error instanceof Error ? error.message : 'Could not add this item to your cart.')
    } finally {
      setBusy(false)
    }
  }, [db, loadCart, onRequireSignIn, onToast, user])

  useEffect(() => {
    const handleAdd = (event: Event) => {
      const listing = (event as CustomEvent<CartListing>).detail
      if (listing) void addToCart(listing)
    }
    window.addEventListener('tradr:add-to-cart', handleAdd)
    return () => window.removeEventListener('tradr:add-to-cart', handleAdd)
  }, [addToCart])

  useEffect(() => {
    const handleOpen = () => {
      if (!user) { onRequireSignIn(); return }
      void loadCart().then(() => setOpen(true)).catch(error => onToast(error instanceof Error ? error.message : 'Could not open your cart.'))
    }
    window.addEventListener('tradr:open-cart', handleOpen)
    return () => window.removeEventListener('tradr:open-cart', handleOpen)
  }, [loadCart, onRequireSignIn, onToast, user])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const reference = params.get('reference')
    if (!user || !reference || params.get('order_payment') !== '1' || paymentChecking) return
    setPaymentChecking(true)
    void db.functions.invoke('order-payment-status', { body: { provider_reference: reference } })
      .then(async ({ data, error }) => {
        if (error) throw error
        const result = data as { payment?: { status?: string }; order?: { id?: string; public_order_number?: string; order_status?: string } }
        if (result.payment?.status === 'succeeded') {
          let orderId = result.order?.id
          if (!orderId && result.order?.public_order_number) {
            const { data: paidOrder } = await db.from('orders').select('id').eq('buyer_id', user.id).eq('public_order_number', result.order.public_order_number).maybeSingle()
            orderId = paidOrder?.id
          }
          if (orderId) {
            const { data: paidEvent } = await db.from('order_events').select('id').eq('order_id', orderId).eq('event_type', 'payment_succeeded').order('created_at', { ascending: false }).limit(1).maybeSingle()
            if (paidEvent?.id) {
              const { error: pushError } = await db.functions.invoke('notify-order-chat', { body: { event_id: paidEvent.id } })
              if (pushError) console.warn('Order is paid, but the seller push alert could not be sent:', pushError.message)
            }
            onOrderPaid(orderId)
          } else {
            onToast('Payment confirmed. Your order is available in Orders and Inbox.')
          }
        } else {
          onToast(`Payment status: ${result.payment?.status ?? 'pending'}. Check your order again shortly. Please do not pay twice.`)
        }
      })
      .catch(error => onToast(error instanceof Error ? error.message : 'We could not verify that payment yet. Please check again shortly.'))
      .finally(() => {
        params.delete('reference')
        params.delete('order_payment')
        const nextUrl = window.location.pathname + (params.toString() ? `?${params}` : '') + window.location.hash
        window.history.replaceState({}, '', nextUrl)
        setPaymentChecking(false)
        void loadCart()
      })
  }, [db, loadCart, onOrderPaid, onToast, paymentChecking, user?.id])

  async function updateQuantity(line: CartLine, quantity: number) {
    if (line.listing?.stock_quantity !== null && line.listing?.stock_quantity !== undefined && quantity > line.listing.stock_quantity) { onToast(`Only ${line.listing.stock_quantity} available for this product.`); return }
    if (quantity < 1) {
      const { error } = await db.from('cart_items').delete().eq('id', line.id)
      if (error) onToast(error.message)
    } else {
      const { error } = await db.from('cart_items').update({ quantity }).eq('id', line.id)
      if (error) onToast(error.message)
    }
    await loadCart()
  }

  async function checkout() {
    if (!user) { onRequireSignIn(); return }
    if (!cartId || !lines.length || busy) return
    if (buyerName.trim().length < 2 || buyerPhone.replace(/\D/g, '').length < 10) {
      onToast('Enter your name and a valid phone number to continue.')
      return
    }
    setBusy(true)
    try {
      const storageKey = `tradr.checkout-key.${user.id}.${cartId}`
      let idempotencyKey = window.localStorage.getItem(storageKey) ?? ''
      if (idempotencyKey.length < 16) {
        idempotencyKey = crypto.randomUUID()
        window.localStorage.setItem(storageKey, idempotencyKey)
      }
      const { data, error } = await db.functions.invoke('create-order-checkout', {
        body: {
          cart_id: cartId,
          delivery_method: 'seller',
          buyer_contact: { name: buyerName.trim(), phone: buyerPhone.trim(), email: user.email ?? '' },
          delivery_address: null,
          buyer_note: buyerNote.trim(),
          idempotency_key: idempotencyKey,
        },
      })
      if (error) throw error
      const result = data as { authorization_url?: string; already_paid?: boolean; order_number?: string; error?: string }
      if (result.already_paid) {
        onToast(`Order ${result.order_number ?? ''} is already paid.`)
        setOpen(false)
        await loadCart()
        return
      }
      if (!result.authorization_url) throw new Error(result.error || 'Paystack could not start this payment. Try again shortly.')
      window.location.assign(result.authorization_url)
    } catch (error) {
      onToast(error instanceof Error ? error.message : 'Checkout could not be started. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return <>
    <button type="button" className="cart-fab" onClick={() => {
      if (!user) { onRequireSignIn(); return }
      void loadCart().then(() => setOpen(true)).catch(error => onToast(error instanceof Error ? error.message : 'Could not open your cart.'))
    }} aria-label={`Open cart, ${itemCount} items`}>
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 3h2l2.2 11.2a2 2 0 0 0 2 1.6h8.9a2 2 0 0 0 1.9-1.4L22 8H6"/><circle cx="10" cy="20" r="1"/><circle cx="18" cy="20" r="1"/></svg>
      <span>Cart</span>{itemCount > 0 && <b>{itemCount > 99 ? '99+' : itemCount}</b>}
    </button>

    {open && <div className="modal-backdrop cart-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false) }}>
      <section className="form-modal cart-modal" role="dialog" aria-modal="true" aria-labelledby="cart-heading">
        <button type="button" className="modal-close modal-back-button" onClick={() => setOpen(false)} aria-label="Close cart">×</button>
        <div className="modal-brand-mark">t<span>.</span></div>
        <span className="eyebrow">SHOPPING CART</span>
        <h2 id="cart-heading">Your cart.</h2>
        {lines.length ? <>
          <div className="cart-lines">{lines.map(line => <article className="cart-line" key={line.id}>
            <img src={line.listing?.image_urls?.[0] || '/favicon.ico'} alt=""/>
            <div className="cart-line-copy"><small className="cart-shop-label">{line.listing?.vendor?.shop_name ?? 'LCU shop'}</small><b>{line.listing?.title ?? 'Unavailable listing'}</b><strong>{money(Number(line.listing?.price_ngn ?? 0))}</strong><div className="cart-quantity"><button type="button" onClick={() => void updateQuantity(line, line.quantity - 1)} aria-label="Decrease quantity">−</button><span>{line.quantity}</span><button type="button" disabled={line.listing?.stock_quantity !== null && line.listing?.stock_quantity !== undefined && line.quantity >= line.listing.stock_quantity} onClick={() => void updateQuantity(line, line.quantity + 1)} aria-label="Increase quantity">+</button><button type="button" className="cart-remove" onClick={() => void updateQuantity(line, 0)}>Remove</button></div></div>
          </article>)}</div>
          <div className="cart-summary"><span>Items subtotal</span><b>{money(subtotal)}</b></div>
          {shopCount > 1 && <p className="cart-multishop-note">Your cart has items from {shopCount} shops. Each shop will receive its own order after your single payment.</p>}
          <div className="cart-contact-fields">
            <label>Your name<input value={buyerName} onChange={event => setBuyerName(event.target.value)} placeholder="Full name" autoComplete="name"/></label>
            <label>Phone number<input value={buyerPhone} onChange={event => setBuyerPhone(event.target.value)} placeholder="08012345678" inputMode="tel" autoComplete="tel"/></label>
            <label>Note for the shop (optional)<textarea value={buyerNote} onChange={event => setBuyerNote(event.target.value)} rows={2} maxLength={1000} placeholder="Anything the seller should know?"/></label>
          </div>
          <div className="cart-total"><span>Total to pay</span><b>{money(total)}</b></div>
          <button type="button" className="modal-primary cart-checkout-button" disabled={busy || !lines.length} onClick={() => void checkout()}>{busy ? 'Preparing secure checkout…' : 'Continue to secure payment'} <span>↗</span></button>
          <small className="form-footnote">Your order is created using current shop prices. Payment is confirmed securely by Paystack before the shop receives your order.</small>
        </> : <div className="cart-empty"><b>Your cart is taking a little break.</b><p>Add something from a shop to get started.</p><button type="button" className="modal-primary" onClick={() => setOpen(false)}>Keep exploring <span>↗</span></button></div>}
      </section>
    </div>}
  </>
}
