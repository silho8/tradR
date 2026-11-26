import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'

type ChatUser = { id: string }
type OrderSummary = {
  id: string; public_order_number: string; order_status: string; payment_status: string
  buyer_id: string; vendor_id: string; created_at: string
  buyer_contact_snapshot: { name?: string } | null
  vendor: { shop_name?: string; profile_id?: string } | null
}
type ChatMessage = { id: string; order_id: string; sender_id: string; body: string; recipient_read_at: string | null; created_at: string }
type OrderEvent = { id: string; order_id: string; actor_user_id: string | null; actor_type: string; event_type: string; from_status: string | null; to_status: string | null; public_message: string | null; created_at: string }
const statusLabels: Record<string,string> = { awaiting_payment:'Awaiting payment', pending_seller_confirmation:'Awaiting seller', accepted:'Accepted', preparing:'Being prepared', ready_for_handover:'Ready for handover', dispatched:'Dispatched', delivered:'Delivered', completed:'Completed', cancelled:'Cancelled', refund_pending:'Refund pending', refunded:'Refunded', disputed:'Under review' }
const eventText = (event: OrderEvent) => {
  if (event.public_message) return event.public_message
  if (event.event_type === 'payment_succeeded') return 'Payment confirmed. The seller has been notified.'
  if (event.event_type === 'seller_order_status_updated') return event.to_status === 'accepted' ? 'Seller accepted the order.' : event.to_status === 'preparing' ? 'Seller is preparing your order.' : event.to_status === 'ready_for_handover' ? 'Your order is ready for handover.' : event.to_status === 'delivered' ? 'Seller marked the order as delivered.' : 'Order updated: ' + (statusLabels[event.to_status || ''] || event.to_status || '')
  if (event.event_type === 'buyer_confirmed_receipt') return 'Buyer confirmed receipt. This order is complete.'
  return event.event_type.replaceAll('_',' ')
}
const formatTime = (value:string) => new Date(value).toLocaleString('en-NG',{day:'numeric',month:'short',hour:'numeric',minute:'2-digit'})

function OrderChat({db,user,orderId,onBack,onToast}:{db:SupabaseClient;user:ChatUser;orderId:string;onBack:()=>void;onToast:(message:string)=>void}) {
  const [order,setOrder] = useState<OrderSummary|null>(null)
  const [messages,setMessages] = useState<ChatMessage[]>([])
  const [events,setEvents] = useState<OrderEvent[]>([])
  const [draft,setDraft] = useState('')
  const [loading,setLoading] = useState(true)
  const [sending,setSending] = useState(false)
  const load = useCallback(async () => {
    const results = await Promise.all([
      db.from('orders').select('id,public_order_number,order_status,payment_status,buyer_id,vendor_id,created_at,buyer_contact_snapshot,vendor:vendors(shop_name,profile_id)').eq('id',orderId).maybeSingle(),
      db.from('order_chat_messages').select('id,order_id,sender_id,body,recipient_read_at,created_at').eq('order_id',orderId).order('created_at',{ascending:true}).limit(200),
      db.from('order_events').select('id,order_id,actor_user_id,actor_type,event_type,from_status,to_status,public_message,created_at').eq('order_id',orderId).order('created_at',{ascending:true}).limit(100)
    ])
    const [o,m,e] = results
    if (o.error) throw o.error
    if (m.error) throw m.error
    if (e.error) throw e.error
    if (!o.data) throw new Error('This order chat is not available to your account.')
    setOrder(o.data as unknown as OrderSummary)
    setMessages((m.data||[]) as ChatMessage[])
    setEvents((e.data||[]) as OrderEvent[])
    const readAt = new Date().toISOString()
    await Promise.all([
      db.from('order_chat_messages').update({recipient_read_at:readAt}).eq('order_id',orderId).neq('sender_id',user.id).is('recipient_read_at',null),
      db.from('notifications').update({read_at:readAt}).eq('user_id',user.id).eq('entity_type','order').eq('entity_id',orderId).is('read_at',null)
    ])
  },[db,orderId,user.id])
  useEffect(()=>{
    let active=true
    setLoading(true)
    void load().catch(err=>onToast(err instanceof Error?err.message:'Could not open this chat.')).finally(()=>{if(active)setLoading(false)})
    const channel=db.channel('order-chat-'+orderId)
      .on('postgres_changes',{event:'*',schema:'public',table:'order_chat_messages',filter:'order_id=eq.'+orderId},()=>{void load().catch(console.warn)})
      .on('postgres_changes',{event:'INSERT',schema:'public',table:'order_events',filter:'order_id=eq.'+orderId},()=>{void load().catch(console.warn)})
      .subscribe()
    return ()=>{active=false;void db.removeChannel(channel)}
  },[db,orderId,load,onToast])
  const timeline=useMemo(()=>[
    ...messages.map(item=>({kind:'message' as const,at:item.created_at,item})),
    ...events.map(item=>({kind:'event' as const,at:item.created_at,item}))
  ].sort((a,b)=>Date.parse(a.at)-Date.parse(b.at)),[messages,events])
  async function sendMessage(event:FormEvent){
    event.preventDefault()
    const body=draft.trim()
    if(!body||sending||!order)return
    setSending(true)
    try{
      const {data,error}=await db.from('order_chat_messages').insert({order_id:order.id,sender_id:user.id,body}).select('id').single()
      if(error)throw error
      setDraft('')
      const {error:pushError}=await db.functions.invoke('notify-order-chat',{body:{message_id:data.id}})
      if(pushError)console.warn('Message saved, but push notification could not be sent:',pushError.message)
      await load()
    }catch(err){onToast(err instanceof Error?err.message:'Your message could not be sent.')}
    finally{setSending(false)}
  }
  const isBuyer=order?.buyer_id===user.id
  const otherName=isBuyer?(order?.vendor?.shop_name||'Seller'):(order?.buyer_contact_snapshot?.name||'Buyer')
  return <section className="order-chat-view" aria-label="Order chat">
    <header className="order-chat-header"><button type="button" className="order-chat-back" onClick={onBack} aria-label="Back to inbox">←</button><div><span className="eyebrow">ORDER CONVERSATION</span><b>{otherName}</b><small>{order?.public_order_number||'Loading order…'} · {statusLabels[order?.order_status||'']||order?.order_status}</small></div></header>
    {loading?<div className="order-chat-empty">Opening your conversation…</div>:<div className="order-chat-timeline"><div className="order-chat-intro"><b>Keep everything about this order here.</b><span>Messages are private to the buyer and this shop.</span></div>
      {timeline.length?timeline.map(entry=>entry.kind==='event'
        ?<div className="order-chat-system" key={'event-'+entry.item.id}><span>{eventText(entry.item)}</span><small>{formatTime(entry.at)}</small></div>
        :<article className={entry.item.sender_id===user.id?'order-chat-message mine':'order-chat-message'} key={'message-'+entry.item.id}><span>{entry.item.sender_id===user.id?'You':otherName}</span><p>{entry.item.body}</p><small>{formatTime(entry.at)}{entry.item.sender_id===user.id&&entry.item.recipient_read_at?' · Seen':''}</small></article>
      ):<div className="order-chat-empty">No messages yet. Say hello to the seller.</div>}</div>}
    <form className="order-chat-compose" onSubmit={sendMessage}><textarea value={draft} onChange={e=>setDraft(e.target.value)} maxLength={2000} rows={2} placeholder="Write a message…" aria-label="Write a message" disabled={!order||sending}/><button type="submit" disabled={!draft.trim()||sending||!order}>{sending?'Sending…':'Send'} <span>↗</span></button></form>
  </section>
}

export default function OrderInbox({db,user,open,openOrderId,onOpenChange,onOpenOrderHandled,onToast}:{db:SupabaseClient;user:ChatUser|null;open:boolean;openOrderId:string|null;onOpenChange:(open:boolean)=>void;onOpenOrderHandled:()=>void;onToast:(message:string)=>void}) {
  const [orders,setOrders]=useState<OrderSummary[]>([])
  const [messages,setMessages]=useState<ChatMessage[]>([])
  const [selectedOrderId,setSelectedOrderId]=useState<string|null>(null)
  const [loading,setLoading]=useState(false)
  const loadInbox=useCallback(async()=>{
    if(!user)return
    setLoading(true)
    try{
      const {data:vendor}=await db.from('vendors').select('id').eq('profile_id',user.id).maybeSingle()
      let query=db.from('orders').select('id,public_order_number,order_status,payment_status,buyer_id,vendor_id,created_at,buyer_contact_snapshot,vendor:vendors(shop_name,profile_id)').in('payment_status',['succeeded','refund_pending','partially_refunded','refunded','disputed']).order('created_at',{ascending:false}).limit(50)
      query=vendor?.id?query.or('buyer_id.eq.'+user.id+',vendor_id.eq.'+vendor.id):query.eq('buyer_id',user.id)
      const {data,error}=await query
      if(error)throw error
      const rows=(data||[]) as unknown as OrderSummary[]
      setOrders(rows)
      if(rows.length){
        const {data:messageData,error:messageError}=await db.from('order_chat_messages').select('id,order_id,sender_id,body,recipient_read_at,created_at').in('order_id',rows.map(item=>item.id)).order('created_at',{ascending:false}).limit(300)
        if(messageError)throw messageError
        setMessages((messageData||[]) as ChatMessage[])
      }else setMessages([])
    }catch(err){onToast(err instanceof Error?err.message:'Could not load your inbox.')}
    finally{setLoading(false)}
  },[db,user?.id,onToast])
  useEffect(()=>{if(open&&user)void loadInbox();if(!open)setSelectedOrderId(null)},[open,user?.id,loadInbox])
  useEffect(()=>{if(openOrderId)setSelectedOrderId(openOrderId)},[openOrderId])
  useEffect(()=>{
    if(!open||!user)return
    const channel=db.channel('order-inbox-'+user.id)
      .on('postgres_changes',{event:'INSERT',schema:'public',table:'order_chat_messages'},()=>{void loadInbox()})
      .on('postgres_changes',{event:'INSERT',schema:'public',table:'order_events'},()=>{void loadInbox()})
      .subscribe()
    return ()=>{void db.removeChannel(channel)}
  },[db,open,user?.id,loadInbox])
  if(!open||!user)return null
  if(selectedOrderId)return <div className="modal-backdrop order-inbox-backdrop"><div className="order-inbox-modal"><OrderChat db={db} user={user} orderId={selectedOrderId} onBack={()=>{setSelectedOrderId(null);onOpenOrderHandled();void loadInbox()}} onToast={onToast}/></div></div>
  const latestByOrder=new Map<string,ChatMessage>(),unreadByOrder=new Map<string,number>()
  for(const message of messages){if(!latestByOrder.has(message.order_id))latestByOrder.set(message.order_id,message);if(message.sender_id!==user.id&&!message.recipient_read_at)unreadByOrder.set(message.order_id,(unreadByOrder.get(message.order_id)||0)+1)}
  return <div className="modal-backdrop order-inbox-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onOpenChange(false)}}>
    <section className="form-modal order-inbox-modal" role="dialog" aria-modal="true" aria-labelledby="order-inbox-heading">
      <button type="button" className="modal-close modal-back-button" onClick={()=>onOpenChange(false)} aria-label="Close inbox">←</button><div className="modal-brand-mark">t<span>.</span></div><span className="eyebrow">BUYER & SELLER MESSAGES</span>
      <div className="order-inbox-title"><h2 id="order-inbox-heading">Your inbox.</h2><button type="button" onClick={()=>void loadInbox()} disabled={loading}>↻ Refresh</button></div>
      <p>Every conversation stays attached to its order, so details never get mixed up.</p>
      {loading?<div className="order-chat-empty">Loading conversations…</div>:orders.length?<div className="order-inbox-list">{orders.map(order=>{
        const isBuyer=order.buyer_id===user.id,peer=isBuyer?(order.vendor?.shop_name||'Shop'):(order.buyer_contact_snapshot?.name||'Buyer'),latest=latestByOrder.get(order.id)
        return <button type="button" className="order-inbox-item" key={order.id} onClick={()=>{setSelectedOrderId(order.id);onOpenOrderHandled()}}>
          <span className="order-inbox-avatar">{peer.slice(0,1).toUpperCase()}</span><span className="order-inbox-copy"><b>{peer}</b><small>{order.public_order_number} · {statusLabels[order.order_status]||order.order_status}</small><span>{latest?(latest.sender_id===user.id?'You: ':'')+latest.body:'Start a conversation about this order'}</span></span>
          <span className="order-inbox-meta">{unreadByOrder.get(order.id)?<b>{unreadByOrder.get(order.id)}</b>:null}<small>{formatTime(latest?.created_at||order.created_at)}</small>↗</span>
        </button>
      })}</div>:<div className="order-chat-empty"><b>No order conversations yet.</b><span>Once you place or receive a paid order, its chat will appear here.</span></div>}
    </section>
  </div>
}
