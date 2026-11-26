import { useCallback, useEffect, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'

type OrderEvent = { id: string; event_type: string; from_status: string | null; to_status: string | null; public_message: string | null; created_at: string }
type OrderItem = { id: string; title_snapshot: string; image_snapshot: string | null; quantity: number; unit_price_kobo: number; line_subtotal_kobo: number }
type BuyerOrder = {
  id: string
  public_order_number: string
  order_status: string
  payment_status: string
  delivery_method: 'seller' | 'tradr'
  items_subtotal_kobo: number
  delivery_fee_kobo: number
  buyer_total_kobo: number
  created_at: string
  buyer_contact_snapshot: { name?: string; phone?: string }
  delivery_address_snapshot: { address?: string } | null
  buyer_note: string | null
  order_items: OrderItem[]
  order_events: OrderEvent[]
  delivery: { id: string; status: string; dispatch_at: string | null; delivered_at: string | null; proof_reference: string | null } | null
}

const money = (amount: number) => new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(amount / 100)
const orderLabels: Record<string, string> = {
  awaiting_payment: 'Awaiting payment', pending_seller_confirmation: 'Paid · awaiting shop', accepted: 'Accepted by shop',
  preparing: 'Being prepared', ready_for_handover: 'Ready for handover', dispatched: 'On the way',
  delivered: 'Delivered', completed: 'Completed', cancelled: 'Cancelled', refund_pending: 'Refund pending',
  refunded: 'Refunded', disputed: 'Under review',
}
const paymentLabels: Record<string, string> = { pending: 'Payment pending', processing: 'Payment processing', succeeded: 'Paid', failed: 'Payment failed', abandoned: 'Payment not completed', refund_pending: 'Refund pending', partially_refunded: 'Partially refunded', refunded: 'Refunded', disputed: 'Payment under review' }
function eventLabel(event: OrderEvent) {
  if (event.public_message) return event.public_message
  if (event.event_type === 'order_created') return 'Order placed'
  if (event.event_type === 'payment_succeeded') return 'Payment confirmed securely'
  if (event.event_type === 'payment_failed') return 'Payment failed. Reserved stock was released.'
  if (event.event_type === 'seller_order_status_updated') return `Shop updated your order: ${orderLabels[event.to_status ?? ''] ?? event.to_status}`
  if (event.event_type === 'buyer_confirmed_receipt') return 'You confirmed that the order was received'
  if (event.event_type === 'agent_assigned') return 'A tradR delivery agent was assigned'
  if (event.event_type === 'delivery_dispatched') return 'Your order was dispatched'
  if (event.event_type === 'delivery_completed') return 'Delivery marked complete'
  return event.event_type.replaceAll('_', ' ')
}

export default function BuyerOrders({ db, user, open, onOpenChange, onToast, onOpenChat }: {
  db: SupabaseClient
  user: { id: string } | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onToast: (message: string) => void
  onOpenChat: (orderId: string) => void
}) {
  const [orders, setOrders] = useState<BuyerOrder[]>([])
  const [loading, setLoading] = useState(false)
  const [busyId, setBusyId] = useState('')
  const [deliveryCodes, setDeliveryCodes] = useState<Record<string, string>>({})
  const [filter, setFilter] = useState<'all' | 'active' | 'completed'>('all')

  const loadOrders = useCallback(async () => {
    if (!user) { setOrders([]); return }
    setLoading(true)
    try {
      const { data, error } = await db.from('orders')
        .select('id,public_order_number,order_status,payment_status,delivery_method,items_subtotal_kobo,delivery_fee_kobo,buyer_total_kobo,created_at,buyer_contact_snapshot,delivery_address_snapshot,buyer_note,order_items(id,title_snapshot,image_snapshot,quantity,unit_price_kobo,line_subtotal_kobo),order_events(id,event_type,from_status,to_status,public_message,created_at),delivery:deliveries(status,dispatch_at,delivered_at,proof_reference)')
        .eq('buyer_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) throw error
      setOrders((data ?? []) as unknown as BuyerOrder[])
    } catch (error) {
      onToast(error instanceof Error ? error.message : 'Could not load your orders.')
    } finally { setLoading(false) }
  }, [db, onToast, user?.id])

  useEffect(() => { if (open && user) void loadOrders() }, [open, user?.id, loadOrders])

  async function generateDeliveryCode(order: BuyerOrder, deliveryId: string) {
    if (busyId) return
    setBusyId(order.id)
    try {
      const { data, error } = await db.rpc('buyer_generate_delivery_code', { p_delivery_id: deliveryId })
      if (error) throw error
      if (!data?.code) throw new Error('Could not generate a handover code.')
      setDeliveryCodes(current => ({ ...current, [deliveryId]: data.code as string }))
      onToast('Share this one-time code with your delivery agent only when they are with you.')
    } catch (error) {
      onToast(error instanceof Error ? error.message : 'Could not generate a delivery code.')
    } finally { setBusyId('') }
  }

  async function confirmReceived(order: BuyerOrder) {
    if (busyId) return
    if (!window.confirm(`Confirm that you have received order ${order.public_order_number}? Only confirm after you have the items.`)) return
    setBusyId(order.id)
    try {
      const { error } = await db.rpc('buyer_confirm_order_received', { p_order_id: order.id })
      if (error) throw error
      const { data: statusEvent } = await db.from('order_events').select('id').eq('order_id', order.id).eq('event_type', 'buyer_confirmed_receipt').order('created_at', { ascending: false }).limit(1).maybeSingle()
      if (statusEvent?.id) {
        const { error: pushError } = await db.functions.invoke('notify-order-chat', { body: { event_id: statusEvent.id } })
        if (pushError) console.warn('Receipt was confirmed, but seller push alert could not be sent:', pushError.message)
      }
      onToast('Receipt confirmed. Thank you for completing your order.')
      await loadOrders()
    } catch (error) {
      onToast(error instanceof Error ? error.message : 'Could not confirm receipt. Please try again.')
    } finally { setBusyId('') }
  }

  const isActive = (order: BuyerOrder) => !['completed', 'cancelled', 'refunded'].includes(order.order_status) && !['failed', 'abandoned', 'refunded'].includes(order.payment_status)
  const visible = orders.filter(order => filter === 'all' || (filter === 'active' ? isActive(order) : !isActive(order)))
  const activeCount = orders.filter(isActive).length

  return <>
    {user && <button type="button" className="buyer-orders-fab" onClick={() => onOpenChange(true)} aria-label="Open my orders">▤ <span>My orders</span>{activeCount > 0 && <b>{activeCount}</b>}</button>}
    {open && <div className="modal-backdrop buyer-orders-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onOpenChange(false) }}>
      <section className="form-modal buyer-orders-modal" role="dialog" aria-modal="true" aria-labelledby="buyer-orders-heading">
        <button type="button" className="modal-close modal-back-button" onClick={() => onOpenChange(false)} aria-label="Close orders">←</button>
        <div className="modal-brand-mark">t<span>.</span></div>
        <span className="eyebrow">YOUR TRADR. PURCHASES</span>
        <div className="buyer-orders-title-row"><h2 id="buyer-orders-heading">My orders.</h2><button type="button" onClick={() => void loadOrders()} disabled={loading}>↻ Refresh</button></div>
        <p>Follow each order from payment through handover. Your order history is private to your account.</p>
        <div className="buyer-orders-filters">{(['all', 'active', 'completed'] as const).map(value => <button type="button" key={value} className={filter === value ? 'active' : ''} onClick={() => setFilter(value)}>{value === 'all' ? `All · ${orders.length}` : value === 'active' ? `In progress · ${activeCount}` : 'Past orders'}</button>)}</div>
        {loading ? <div className="buyer-orders-empty">Loading your orders…</div> : visible.length ? <div className="buyer-orders-list">{visible.map(order => {
          const events = [...(order.order_events ?? [])].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
          const delivery = Array.isArray(order.delivery) ? order.delivery[0] : order.delivery
          return <article className="buyer-order-card" key={order.id}>
            <header className="buyer-order-card-head"><div><b>{order.public_order_number}</b><small>{new Date(order.created_at).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' })}</small></div><span className={'buyer-order-status buyer-status-' + order.order_status}>{orderLabels[order.order_status] ?? order.order_status}</span></header>
            <button type="button" className="buyer-order-chat-button" onClick={() => onOpenChat(order.id)}>Message seller <span>↗</span></button>
            <div className="buyer-order-payment"><span>Payment</span><b className={'payment-' + order.payment_status}>{paymentLabels[order.payment_status] ?? order.payment_status}</b></div>
            <div className="buyer-order-items">{(order.order_items ?? []).map(item => <div className="buyer-order-item" key={item.id}>{item.image_snapshot ? <img src={item.image_snapshot} alt=""/> : <span className="buyer-order-placeholder">t.</span>}<span><b>{item.title_snapshot}</b><small>Qty {item.quantity} · {money(Number(item.unit_price_kobo))} each</small></span><strong>{money(Number(item.line_subtotal_kobo))}</strong></div>)}</div>
            <div className="buyer-order-delivery"><b>{order.delivery_method === 'tradr' ? 'tradR agent delivery' : 'Seller-arranged handover'}</b>{order.delivery_method === 'tradr' ? <><span>{order.delivery_address_snapshot?.address || 'Delivery address saved with your order'}</span><small>{delivery?.status ? `Delivery: ${delivery.status.replaceAll('_', ' ')}` : order.order_status === 'ready_for_handover' ? 'Waiting for a delivery agent to be assigned' : 'Delivery updates will appear here'}</small>{delivery?.dispatch_at && <small>Dispatched {new Date(delivery.dispatch_at).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' })}</small>}{delivery?.id && ['assigned', 'picked_up'].includes(delivery.status) && order.order_status !== 'delivered' && <><button type="button" className="buyer-order-code-button" disabled={busyId === order.id} onClick={() => void generateDeliveryCode(order, delivery.id)}>{busyId === order.id ? 'Generating…' : deliveryCodes[delivery.id] ? 'Generate a new code' : 'Generate handover code'}</button>{deliveryCodes[delivery.id] && <div className="buyer-delivery-code"><span>SHOW THIS TO YOUR AGENT</span><b>{deliveryCodes[delivery.id]}</b><small>One-time code · valid for 24 hours. Do not share it before the agent is physically with you.</small></div>}</>}</> : <span>Coordinate the agreed collection or delivery directly with the shop.</span>}</div>
            {order.buyer_note && <p className="buyer-order-note"><b>Your note:</b> {order.buyer_note}</p>}
            <div className="buyer-order-totals"><span>Items subtotal <b>{money(Number(order.items_subtotal_kobo))}</b></span><span>Delivery <b>{money(Number(order.delivery_fee_kobo))}</b></span><strong>Total paid <b>{money(Number(order.buyer_total_kobo))}</b></strong></div>
            <div className="buyer-order-timeline"><b>Order updates</b>{events.length ? events.slice(-6).map(event => <div className="buyer-order-event" key={event.id}><i/><span>{eventLabel(event)}<small>{new Date(event.created_at).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' })}</small></span></div>) : <small>No updates yet.</small>}</div>
            {order.order_status === 'delivered' && order.payment_status === 'succeeded' && <button type="button" className="buyer-order-confirm" disabled={busyId === order.id} onClick={() => void confirmReceived(order)}>{busyId === order.id ? 'Confirming…' : 'I’ve received my order'} <span>↗</span></button>}
            {order.order_status === 'completed' && <div className="buyer-order-complete">✓ You confirmed receipt of this order.</div>}
            {order.payment_status === 'failed' && <small className="buyer-order-warning">This payment did not go through. Reserved stock has been returned to the shop. You can start a new checkout from the product listing.</small>}
          </article>
        })}</div> : <div className="buyer-orders-empty"><b>{filter === 'completed' ? 'No past orders yet.' : 'No orders here yet.'}</b><p>When you check out and complete payment, your order will appear here with live progress updates.</p><button type="button" className="modal-primary" onClick={() => onOpenChange(false)}>Explore the marketplace <span>↗</span></button></div>}
        <small className="form-footnote">Only confirm receipt after you have received the products. tradR agent pickup and verified handover updates will appear here.</small>
      </section>
    </div>}
  </>
}
