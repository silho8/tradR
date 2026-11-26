import { useCallback, useEffect, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'

type OrderItem = {
  id: string
  title_snapshot: string
  image_snapshot: string | null
  quantity: number
  unit_price_kobo: number
  line_subtotal_kobo: number
}
type SellerOrder = {
  id: string
  public_order_number: string
  order_status: string
  payment_status: string
  delivery_method: 'seller' | 'tradr'
  items_subtotal_kobo: number
  delivery_fee_kobo: number
  marketplace_commission_kobo: number
  seller_net_kobo: number
  buyer_contact_snapshot: { name?: string; phone?: string; email?: string }
  delivery_address_snapshot: { address?: string } | null
  buyer_note: string | null
  created_at: string
  order_items: OrderItem[]
}

const money = (amount: number) => new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(amount / 100)
const statusLabels: Record<string, string> = {
  pending_seller_confirmation: 'New order', accepted: 'Accepted', preparing: 'Preparing',
  ready_for_handover: 'Ready for handover', dispatched: 'With delivery agent',
  delivered: 'Delivered', completed: 'Completed', cancelled: 'Cancelled',
  refund_pending: 'Refund pending', refunded: 'Refunded', disputed: 'Under review',
}

function nextAction(order: SellerOrder) {
  if (order.order_status === 'pending_seller_confirmation') return { status: 'accepted', label: 'Accept order' }
  if (order.order_status === 'accepted') return { status: 'preparing', label: 'Start preparing' }
  if (order.order_status === 'preparing') return { status: 'ready_for_handover', label: 'Mark ready' }
  if (order.order_status === 'ready_for_handover' && order.delivery_method === 'seller') return { status: 'delivered', label: 'Confirm delivered' }
  return null
}

export default function SellerOrders({ db, vendorId, onToast }: { db: SupabaseClient; vendorId: string; onToast: (message: string) => void }) {
  const [orders, setOrders] = useState<SellerOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState('')
  const [filter, setFilter] = useState<'all' | 'new' | 'active' | 'done'>('all')

  const loadOrders = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await db.from('orders')
        .select('id,public_order_number,order_status,payment_status,delivery_method,items_subtotal_kobo,delivery_fee_kobo,marketplace_commission_kobo,seller_net_kobo,buyer_contact_snapshot,delivery_address_snapshot,buyer_note,created_at,order_items(id,title_snapshot,image_snapshot,quantity,unit_price_kobo,line_subtotal_kobo)')
        .eq('vendor_id', vendorId)
        .in('payment_status', ['succeeded', 'refund_pending', 'partially_refunded', 'refunded', 'disputed'])
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) throw error
      setOrders((data ?? []) as unknown as SellerOrder[])
    } catch (error) {
      onToast(error instanceof Error ? error.message : 'Could not load your orders.')
    } finally {
      setLoading(false)
    }
  }, [db, onToast, vendorId])

  useEffect(() => { void loadOrders() }, [loadOrders])

  async function resendAgentAlert(order: SellerOrder) {
    if (order.delivery_method !== 'tradr' || order.order_status !== 'ready_for_handover' || busyId) return
    setBusyId(order.id)
    try {
      const { data, error } = await db.functions.invoke('notify-delivery-agents', { body: { order_id: order.id } })
      if (error || data?.error) throw new Error(error?.message || data?.error || 'Could not resend the delivery alert.')
      onToast(data?.sent
        ? 'Delivery alert resent to ' + data.sent + ' agent device(s). First to accept gets it.'
        : 'The delivery queue is open, but no agent devices received a push alert. In-app alerts remain available.')
    } catch (error) {
      onToast(error instanceof Error ? error.message : 'Could not resend the delivery alert.')
    } finally {
      setBusyId('')
    }
  }

  async function updateStatus(order: SellerOrder) {
    const action = nextAction(order)
    if (!action || busyId) return
    const confirmText = action.status === 'delivered'
      ? 'Confirm that this order has been handed to the buyer. Only do this after the buyer has received it.'
      : action.status === 'accepted'
        ? 'Accept this paid order and confirm that you can fulfil it?'
        : action.status === 'preparing'
          ? 'Mark this order as being prepared?'
          : 'Mark this order as ready for handover?'
    if (!window.confirm(confirmText)) return
    setBusyId(order.id)
    try {
      const { error } = await db.rpc('seller_update_order_status', {
        p_order_id: order.id,
        p_next_status: action.status,
        p_public_message: null,
      })
      if (error) throw error
      if (action.status === 'ready_for_handover' && order.delivery_method === 'tradr') {
        const { data: pushResult, error: pushError } = await db.functions.invoke('notify-delivery-agents', { body: { order_id: order.id } })
        if (pushError || pushResult?.error) {
          console.warn('Delivery job was opened, but the push alert could not be sent:', pushError?.message || pushResult?.error)
          onToast(`Order ${order.public_order_number} is open to agents. Their in-app alerts are saved, but push delivery needs attention.`)
        } else {
          onToast(`Order ${order.public_order_number} is open. ${pushResult?.sent ?? 0} agent device(s) notified. First to accept gets it.`)
        }
      } else onToast(`Order ${order.public_order_number} updated.`)
      await loadOrders()
    } catch (error) {
      onToast(error instanceof Error ? error.message : 'Could not update this order.')
    } finally {
      setBusyId('')
    }
  }

  const visibleOrders = orders.filter(order => {
    if (filter === 'new') return order.order_status === 'pending_seller_confirmation'
    if (filter === 'active') return ['accepted', 'preparing', 'ready_for_handover', 'dispatched'].includes(order.order_status)
    if (filter === 'done') return ['delivered', 'completed', 'cancelled', 'refunded'].includes(order.order_status)
    return true
  })
  const newCount = orders.filter(order => order.order_status === 'pending_seller_confirmation').length

  return <section className="seller-orders-section">
    <div className="seller-orders-heading"><div><span className="eyebrow">PAID ORDERS</span><h3>Orders from your shop.</h3><p>Only successfully paid orders appear here.</p></div><button type="button" className="seller-orders-refresh" onClick={() => void loadOrders()} disabled={loading}>↻ Refresh</button></div>
    <div className="seller-orders-summary"><article><span>ALL ORDERS</span><b>{orders.length}</b></article><article><span>NEED YOUR ATTENTION</span><b>{newCount}</b></article><article><span>SELLER PROCEEDS</span><b>{money(orders.filter(order => !['cancelled', 'refunded'].includes(order.order_status)).reduce((sum, order) => sum + Number(order.seller_net_kobo), 0))}</b></article></div>
    <div className="seller-orders-filters" aria-label="Filter orders">{(['all', 'new', 'active', 'done'] as const).map(value => <button type="button" key={value} className={filter === value ? 'active' : ''} onClick={() => setFilter(value)}>{value === 'all' ? 'All' : value === 'new' ? `New${newCount ? ` · ${newCount}` : ''}` : value === 'active' ? 'In progress' : 'Completed'}</button>)}</div>
    {loading ? <div className="seller-orders-empty">Loading your paid orders…</div> : visibleOrders.length ? <div className="seller-orders-list">{visibleOrders.map(order => {
      const action = nextAction(order)
      const buyer = order.buyer_contact_snapshot ?? {}
      return <article className="seller-order-card" key={order.id}>
        <div className="seller-order-top"><div><span className="seller-order-number">{order.public_order_number}</span><small>{new Date(order.created_at).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' })}</small></div><span className={'seller-order-status status-' + order.order_status}>{statusLabels[order.order_status] ?? order.order_status}</span></div>
        <div className="seller-order-items">{order.order_items.map(item => <div className="seller-order-item" key={item.id}>{item.image_snapshot ? <img src={item.image_snapshot} alt=""/> : <span className="seller-order-item-placeholder">t.</span>}<span><b>{item.title_snapshot}</b><small>Qty {item.quantity} · {money(Number(item.unit_price_kobo))} each</small></span><strong>{money(Number(item.line_subtotal_kobo))}</strong></div>)}</div>
        <div className="seller-order-buyer"><b>{buyer.name || 'Buyer'}</b>{buyer.phone && <a href={`tel:${buyer.phone}`}>{buyer.phone}</a>}{buyer.email && <small>{buyer.email}</small>}</div>
        {order.delivery_method === 'tradr' ? <div className="seller-order-delivery"><b>tradR agent delivery · ₦1,000 paid by buyer</b><span>{order.delivery_address_snapshot?.address || 'Delivery address saved with order'}</span>{order.order_status === 'ready_for_handover' && <small>Open to approved delivery agents. The first one to accept gets the job.</small>}</div> : <div className="seller-order-delivery"><b>Seller-arranged handover</b><span>No tradR delivery fee was charged.</span></div>}
        {order.buyer_note && <div className="seller-order-note"><b>Buyer’s note</b><span>{order.buyer_note}</span></div>}
        <div className="seller-order-finance"><span>Items total <b>{money(Number(order.items_subtotal_kobo))}</b></span><span>tradR commission (5%) <b>−{money(Number(order.marketplace_commission_kobo))}</b></span><span className="seller-order-net">Your sale proceeds <b>{money(Number(order.seller_net_kobo))}</b></span></div>
        {action && <button type="button" className="seller-order-action" disabled={busyId === order.id} onClick={() => void updateStatus(order)}>{busyId === order.id ? 'Updating…' : action.label} <span>↗</span></button>}
        {order.delivery_method === 'tradr' && order.order_status === 'ready_for_handover' && <><p className="seller-order-agent-note">Your part is done. The delivery is open to approved agents. The first one to accept gets it.</p><button type="button" className="seller-order-action seller-order-alert-retry" disabled={!!busyId} onClick={() => void resendAgentAlert(order)}>{busyId === order.id ? 'Sending alert…' : 'Resend agent alert'} <span>↗</span></button></>}
      </article>
    })}</div> : <div className="seller-orders-empty"><b>{filter === 'new' ? 'No new orders.' : filter === 'active' ? 'Nothing being processed.' : filter === 'done' ? 'No completed orders yet.' : 'Your first order will appear here.'}</b><p>When a buyer completes payment, their order and the items they purchased will show up here.</p></div>}
    <small className="seller-orders-footnote">Sale proceeds are recorded in your tradR. seller balance. They are not automatically transferred to your bank yet. The ₦1,000 tradR agent delivery fee is paid by the buyer and is not deducted from your sale proceeds.</small>
  </section>
}
