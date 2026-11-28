import { useCallback, useEffect, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'

type AdminPanelProps = { db: SupabaseClient; onClose: () => void; standalone?: boolean }
type VendorRow = { id: string; shop_name: string; bio: string; verification_status: string; created_at: string }
type ReportRow = { id: string; reason: string; details: string; status: string; created_at: string; vendor_id: string; listing_id: string | null; evidence_paths: string[]; evidence_urls?: string[]; vendors?: { shop_name: string }[] | null; listings?: { title: string } | null }
type ActiveListingRow = { id: string; title: string; description: string; category: string; price_ngn: number; image_urls: string[]; status: string; moderation_status: string; created_at: string; visible_until: string; vendors?: { shop_name: string; verification_status: string } | null }
type DailyPushMessage = { weekday: number; title: string; body: string; enabled: boolean }
type SupportCaseRow = { id: string; details: string; status: string; created_at: string; reporter_id: string; vendor_id: string; order_id: string; vendors?: { shop_name: string } | null }
type PayoutAccountRow = { vendor_id: string; bank_name: string; account_name: string; account_last4: string; status: string; verified_at: string }
type SupportChatData = { support_case: { id: string; status: string; order_id: string }; order: { public_order_number: string; buyer_id: string; buyer_contact_snapshot: { name?: string } | null; vendor: { shop_name?: string; profile_id?: string } | null }; messages: Array<{ id: string; sender_id: string; body: string; created_at: string }>; events: Array<{ id: string; event_type: string; public_message: string | null; created_at: string; actor_type: string }> }
type DeliveryAgentRow = { id: string; display_name: string; phone: string; status: string; created_at: string; government_id_path: string | null; selfie_path: string | null; government_id_url?: string | null; selfie_url?: string | null }
type DeliveryIncidentRow = { id: string; delivery_id: string; order_id: string; reason: string; details: string; status: string; created_at: string; admin_notes: string | null; pickup_completed: boolean }
type PayoutRow = { id: string; order_id: string | null; vendor_id?: string; agent_id?: string; amount_kobo: number; status: string; requested_at: string; eligible_at?: string | null; payout_reference?: string | null; failure_reason?: string | null; payout_account?: PayoutAccountRow }
type AdminRecipient = { id: string; user_id: string; phone_e164: string; label: string; withdrawal_alerts_enabled: boolean }
type WithdrawalRow = { id: string; vendor_id: string; amount_kobo: number; status: string; requested_at: string; bank_name: string; account_name: string; account_last4: string; transfer_reference: string | null; admin_note: string | null; reminder_count: number; vendors?: { shop_name: string }[] | null }
type Queue = { vendors: VendorRow[]; reports: ReportRow[]; supportCases: SupportCaseRow[]; payoutAccounts: PayoutAccountRow[]; activeListings: ActiveListingRow[]; dailyMessages: DailyPushMessage[]; deliveryAgents: DeliveryAgentRow[]; incidents: DeliveryIncidentRow[]; sellerPayouts: PayoutRow[]; agentPayouts: PayoutRow[] }
type Tab = 'shops' | 'active' | 'reports' | 'support' | 'push' | 'delivery' | 'finance'

const emptyQueue: Queue = { vendors: [], reports: [], supportCases: [], payoutAccounts: [], activeListings: [], dailyMessages: [], deliveryAgents: [], incidents: [], sellerPayouts: [], agentPayouts: [] }
const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const dateLabel = (value: string) => new Date(value).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' })
const naira = (value: number) => new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(value)

export default function AdminPanel({ db, onClose, standalone = false }: AdminPanelProps) {
  const [tab, setTab] = useState<Tab>('active')
  const [queue, setQueue] = useState<Queue>(emptyQueue)
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState('')
  const [notice, setNotice] = useState('')
  const [failure, setFailure] = useState('')
  const [supportChat, setSupportChat] = useState<SupportChatData | null>(null)
  const [supportChatBusy, setSupportChatBusy] = useState(false)
  const [withdrawals, setWithdrawals] = useState<WithdrawalRow[]>([])
  const [adminRecipients, setAdminRecipients] = useState<AdminRecipient[]>([])
  const [recipientPhone, setRecipientPhone] = useState('')
  const [recipientLabel, setRecipientLabel] = useState('')

  const loadQueue = useCallback(async () => {
    setLoading(true)
    setFailure('')
    const { data, error } = await db.functions.invoke('admin-moderation', { body: { action: 'load' } })
    if (error || data?.error) {
      setFailure(data?.error || error?.message || 'Could not load the moderation queue.')
      setLoading(false)
      return
    }
    const [agentResult, incidentResult, sellerPayoutResult, agentPayoutResult, withdrawalResult, recipientResult] = await Promise.all([
      db.from('delivery_agents').select('id,display_name,phone,status,created_at,government_id_path,selfie_path').order('created_at', { ascending: false }),
      db.from('delivery_incidents').select('id,delivery_id,order_id,reason,details,status,created_at,admin_notes,pickup_completed').order('created_at', { ascending: false }),
      db.from('seller_payouts').select('id,order_id,vendor_id,amount_kobo,status,requested_at,eligible_at,provider_reference,failure_reason').order('requested_at', { ascending: false }),
      db.from('delivery_agent_payouts').select('id,order_id,agent_id,amount_kobo,status,requested_at,payout_reference,failure_reason').order('requested_at', { ascending: false }),
      db.from('seller_withdrawal_requests').select('id,vendor_id,amount_kobo,status,requested_at,bank_name,account_name,account_last4,transfer_reference,admin_note,reminder_count,vendors(shop_name)').order('requested_at', { ascending: false }),
      db.from('admin_notification_recipients').select('id,user_id,phone_e164,label,withdrawal_alerts_enabled').order('created_at', { ascending: true }),
    ])
    const failedResult = [agentResult, incidentResult, sellerPayoutResult, agentPayoutResult, withdrawalResult, recipientResult].find(result => result.error)
    if (failedResult?.error) {
      setFailure(failedResult.error.message || 'Could not load delivery operations.')
      setLoading(false)
      return
    }
    const deliveryAgents = await Promise.all((agentResult.data ?? []).map(async agent => {
      const [idSigned, selfieSigned] = await Promise.all([
        agent.government_id_path ? db.storage.from('delivery-agent-verification').createSignedUrl(agent.government_id_path, 600) : Promise.resolve({ data: null, error: null }),
        agent.selfie_path ? db.storage.from('delivery-agent-verification').createSignedUrl(agent.selfie_path, 600) : Promise.resolve({ data: null, error: null }),
      ])
      return { ...agent, government_id_url: idSigned.data?.signedUrl ?? null, selfie_url: selfieSigned.data?.signedUrl ?? null }
    })) as DeliveryAgentRow[]
    setWithdrawals((withdrawalResult.data ?? []) as WithdrawalRow[])
    setAdminRecipients((recipientResult.data ?? []) as AdminRecipient[])
    setQueue({
      vendors: Array.isArray(data?.vendors) ? data.vendors : [],
      reports: Array.isArray(data?.reports) ? data.reports : [],
      supportCases: Array.isArray(data?.support_cases) ? data.support_cases : [],
      payoutAccounts: Array.isArray(data?.payout_accounts) ? data.payout_accounts : [],
      activeListings: Array.isArray(data?.active_listings) ? data.active_listings : [],
      dailyMessages: Array.isArray(data?.daily_push_messages) ? data.daily_push_messages : [],
      deliveryAgents,
      incidents: (incidentResult.data ?? []) as DeliveryIncidentRow[],
      sellerPayouts: ((sellerPayoutResult.data ?? []) as PayoutRow[]).map(payout => ({ ...payout, payout_account: (data?.payout_accounts ?? []).find((account: PayoutAccountRow) => account.vendor_id === payout.vendor_id) })),
      agentPayouts: (agentPayoutResult.data ?? []) as PayoutRow[],
    })
    setLoading(false)
  }, [db])

  useEffect(() => { void loadQueue() }, [loadQueue])
  useEffect(() => {
    const channel = db.channel('tradr-admin-withdrawal-queue')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'seller_withdrawal_requests' }, () => { void loadQueue() })
      .subscribe()
    return () => { void db.removeChannel(channel) }
  }, [db, loadQueue])

  async function act(action: 'review_vendor' | 'review_report' | 'remove_listing', id: string, status: string) {
    setBusyId(id)
    setNotice('')
    setFailure('')
    const { data, error } = await db.functions.invoke('admin-moderation', { body: { action, id, status } })
    if (error || data?.error) {
      setFailure(data?.error || error?.message || 'That action did not complete.')
      setBusyId('')
      return
    }
    setNotice(action === 'remove_listing' ? 'Listing removed from the marketplace. The record is retained for moderation history.' : action === 'review_vendor' ? 'Shop approval decision saved.' : 'Safety report updated.')
    await loadQueue()
    setBusyId('')
  }

  async function reviewAgent(agentId: string, status: 'approved' | 'suspended') {
    setBusyId(agentId); setNotice(''); setFailure('')
    const { data, error } = await db.rpc('admin_review_delivery_agent', { p_agent_id: agentId, p_status: status })
    if (error || data?.error) setFailure(data?.error || error?.message || 'Could not update this agent.')
    else setNotice(status === 'approved' ? 'Delivery agent approved.' : 'Delivery agent suspended.')
    await loadQueue(); setBusyId('')
  }

  async function resolveIncident(incidentId: string, resolution: 'reopen_delivery' | 'refund_required' | 'resolved') {
    const returnConfirmed = resolution === 'reopen_delivery'
      ? window.confirm('Confirm the parcel is back with the seller, or was never picked up. If it is still with the agent, choose Cancel and investigate first.')
      : false
    if (resolution === 'reopen_delivery' && !returnConfirmed) return
    const notes = window.prompt('Add an internal investigation note (optional):') || ''
    setBusyId(incidentId); setNotice(''); setFailure('')
    const { error } = await db.rpc('admin_resolve_delivery_incident', {
      p_incident_id: incidentId, p_resolution: resolution, p_admin_notes: notes, p_return_confirmed: returnConfirmed,
    })
    if (error) setFailure(error.message)
    else setNotice(resolution === 'reopen_delivery' ? 'Delivery reopened for another approved agent.' : resolution === 'refund_required' ? 'Order moved to refund-pending. Process the refund in Paystack and record the result separately.' : 'Incident marked resolved.')
    await loadQueue(); setBusyId('')
  }

  async function recordRefund(orderId: string) {
    const reference = window.prompt('After completing the full refund in Paystack, enter its refund reference:')
    if (!reference || reference.trim().length < 3) return
    setBusyId(orderId); setNotice(''); setFailure('')
    const { error } = await db.rpc('admin_record_order_refund', { p_order_id: orderId, p_provider_reference: reference.trim() })
    if (error) setFailure(error.message)
    else setNotice('Refund recorded. Seller proceeds and payout eligibility were reversed.')
    await loadQueue(); setBusyId('')
  }

  async function recordPayout(kind: 'seller' | 'agent', payoutId: string, status: 'processing' | 'succeeded' | 'failed') {
    const reference = status === 'succeeded' ? window.prompt('Enter the completed bank transfer reference:') : null
    if (status === 'succeeded' && (!reference || reference.trim().length < 3)) return
    const failureReason = status === 'failed' ? window.prompt('Why did this transfer fail?') : null
    setBusyId(payoutId); setNotice(''); setFailure('')
    const { error } = await db.rpc(kind === 'seller' ? 'admin_record_seller_payout' : 'admin_record_agent_payout', {
      p_payout_id: payoutId, p_status: status, p_reference: reference, p_failure_reason: failureReason,
    })
    if (error) setFailure(error.message)
    else setNotice(status === 'succeeded' ? 'Payout marked paid and its ledger entry recorded.' : 'Payout status updated.')
    await loadQueue(); setBusyId('')
  }

  async function addAdminRecipient() {
    const phone = recipientPhone.trim()
    if (!/^\+[1-9][0-9]{7,14}$/.test(phone)) { setFailure('Enter the admin WhatsApp number in international format, e.g. +234…'); return }
    setBusyId('recipient'); setFailure(''); setNotice('')
    const { data: authData } = await db.auth.getUser()
    if (!authData.user) { setFailure('Could not identify the signed-in admin.'); setBusyId(''); return }
    const { error } = await db.from('admin_notification_recipients').insert({ user_id: authData.user.id, phone_e164: phone, label: recipientLabel.trim() || 'Admin', withdrawal_alerts_enabled: true })
    if (error) setFailure(error.message)
    else { setNotice('Admin WhatsApp recipient added. New withdrawal alerts will include this number.'); setRecipientPhone(''); setRecipientLabel('') }
    await loadQueue(); setBusyId('')
  }

  async function removeAdminRecipient(id: string) {
    if (!window.confirm('Stop sending withdrawal WhatsApp alerts to this number?')) return
    setBusyId(id); setFailure(''); setNotice('')
    const { error } = await db.from('admin_notification_recipients').delete().eq('id', id)
    if (error) setFailure(error.message); else setNotice('Admin notification recipient removed.')
    await loadQueue(); setBusyId('')
  }

  async function reviewWithdrawal(item: WithdrawalRow, status: 'approved' | 'paid' | 'rejected') {
    const reference = status === 'paid' ? window.prompt('Enter the bank transfer reference after completing the manual bank transfer:') : null
    if (status === 'paid' && (!reference || reference.trim().length < 3)) return
    const note = status === 'rejected' ? window.prompt('Why is this withdrawal being rejected?') : null
    setBusyId(item.id); setNotice(''); setFailure('')
    const { error } = await db.rpc('admin_review_seller_withdrawal', { p_request_id: item.id, p_status: status, p_transfer_reference: reference, p_admin_note: note })
    if (error) setFailure(error.message)
    else setNotice(status === 'paid' ? 'Withdrawal marked paid. Linked payout records and seller ledger have been updated.' : status === 'approved' ? 'Withdrawal approved. Complete the manual bank transfer, then record it as paid.' : 'Withdrawal rejected and reserved payouts released.')
    await loadQueue(); setBusyId('')
  }

  async function viewSupportChat(reportId: string) {
    setSupportChatBusy(true); setFailure(''); setSupportChat(null)
    const { data, error } = await db.functions.invoke('admin-moderation', { body: { action: 'read_support_chat', report_id: reportId } })
    if (error || data?.error) setFailure(data?.error || error?.message || 'Could not open this order conversation.')
    else setSupportChat(data as SupportChatData)
    setSupportChatBusy(false)
  }

  async function saveDailyMessage(message: DailyPushMessage) {
    setBusyId('push-' + message.weekday)
    setNotice('')
    setFailure('')
    const { data, error } = await db.functions.invoke('admin-moderation', { body: { action: 'update_daily_push_message', ...message } })
    if (error || data?.error) {
      setFailure(data?.error || error?.message || 'Could not save this daily message.')
      setBusyId('')
      return
    }
    setNotice(`${weekdays[message.weekday]}’s featured notification saved.`)
    await loadQueue()
    setBusyId('')
  }

  function editDailyMessage(weekday: number, field: 'title' | 'body' | 'enabled', value: string | boolean) {
    setQueue(current => ({ ...current, dailyMessages: current.dailyMessages.map(message => message.weekday === weekday ? { ...message, [field]: value } : message) }))
  }

  const counts = { shops: queue.vendors.length, active: queue.activeListings.length, reports: queue.reports.length, support: queue.supportCases.filter(item => item.status === 'pending' || item.status === 'reviewing').length, push: queue.dailyMessages.length, delivery: queue.deliveryAgents.filter(agent => agent.status === 'pending').length, finance: withdrawals.filter(item => ['requested','approved'].includes(item.status)).length }
  const activeByShop = queue.activeListings.reduce<Record<string, ActiveListingRow[]>>((groups, listing) => { const shop = listing.vendors?.shop_name || 'Unknown shop'; (groups[shop] ??= []).push(listing); return groups }, {})

  return <div className={`modal-backdrop admin-backdrop${standalone ? ' admin-route-backdrop' : ''}`} onMouseDown={event => { if (event.target === event.currentTarget && !busyId) onClose() }}>
    <section className="admin-workspace" role="dialog" aria-modal="true" aria-labelledby="admin-heading">
      <aside className="admin-sidebar">
        <div className="admin-brand"><div className="admin-brand-mark">t<span>.</span></div><b>tradR.</b></div>
        <span className="admin-sidebar-label">ADMIN WORKSPACE</span>
        <nav className="admin-tabs" role="tablist" aria-label="Moderation queues">
          {(['active', 'shops', 'reports', 'support', 'delivery', 'finance', 'push'] as const).map(item => <button key={item} role="tab" aria-selected={tab === item} className={tab === item ? 'active' : ''} onClick={() => { setTab(item); if (item !== 'support') setSupportChat(null) }}><span className="admin-nav-icon">{item === 'active' ? '▤' : item === 'shops' ? '▣' : item === 'reports' ? '⚑' : item === 'support' ? '◉' : item === 'delivery' ? '⇢' : item === 'finance' ? '₦' : '◌'}</span><span className="admin-nav-label">{item === 'active' ? 'Listings' : item === 'shops' ? 'Shops' : item === 'reports' ? 'Reports' : item === 'support' ? 'Order support' : item === 'delivery' ? 'Delivery agents' : item === 'finance' ? 'Withdrawals' : 'Notifications'}</span><span className="admin-nav-count">{counts[item]}</span></button>)}
        </nav>
        <div className="admin-sidebar-footer">tradR. · Lead City<br/>Marketplace operations</div>
      </aside>
      <main className="admin-main">
        <header className="admin-main-header">
          <div><span className="eyebrow">TRADR OPERATIONS</span><h2 id="admin-heading">Marketplace overview</h2><p>Keep an eye on listings, shops and campus activity.</p></div>
          <div className="admin-header-actions"><div className="admin-user-pill">Admin account <span>▾</span></div><button className="admin-close" onClick={onClose} aria-label="Close admin moderation">×</button></div>
        </header>
        <div className="admin-metrics">
          <article><span>Active listings</span><b>{queue.activeListings.length.toLocaleString('en-NG')}</b><small>Currently live on tradR.</small></article>
          <article><span>Live shops</span><b>{Object.keys(activeByShop).length.toLocaleString('en-NG')}</b><small>With published listings</small></article>
          <article><span>Open reports</span><b>{(queue.reports.length + counts.support).toLocaleString('en-NG')}</b><small>Safety and order support</small></article>
          <article><span>Pending agents</span><b>{counts.delivery.toLocaleString('en-NG')}</b><small>Awaiting admin review</small></article>
        </div>
        {notice && <div className="admin-notice">{notice}</div>}
        {failure && <div className="admin-error" role="alert">{failure}{failure.includes('Admin access') ? ' Ask the project owner to grant your account the admin app_metadata role.' : ''}</div>}
        <div className="admin-queue">
        {loading ? <div className="dashboard-empty"><b>Loading review queue…</b><span>Checking your admin permissions and latest records.</span></div> : tab === 'finance' ? <><div className="dashboard-empty"><b>Seller withdrawal requests</b><span>Bank details are verified through Paystack. The full account number is retrieved securely by the notification service; this dashboard displays only the account name, bank and last four digits.</span></div><section className="admin-item"><div className="admin-item-heading"><div><b>Admin WhatsApp recipients</b><small>Each recipient receives the automated-service introduction before the first withdrawal alert.</small></div></div>{adminRecipients.map(recipient => <div className="admin-recipient-row" key={recipient.id}><span><b>{recipient.label}</b><small>{recipient.phone_e164}</small></span><button className="danger-link" disabled={!!busyId} onClick={() => void removeAdminRecipient(recipient.id)}>Remove</button></div>)}<div className="admin-recipient-form"><label>Admin label<input value={recipientLabel} onChange={event => setRecipientLabel(event.target.value)} maxLength={60} placeholder="e.g. Finance admin"/></label><label>WhatsApp number<input type="tel" value={recipientPhone} onChange={event => setRecipientPhone(event.target.value)} placeholder="+234…"/></label><button className="approve" disabled={!!busyId || !recipientPhone.trim()} onClick={() => void addAdminRecipient()}>Add this admin</button></div></section>{withdrawals.filter(item => !['paid','rejected','cancelled'].includes(item.status)).length ? withdrawals.filter(item => !['paid','rejected','cancelled'].includes(item.status)).map(item => <article className="admin-item" key={item.id}><div className="admin-item-heading"><div><b>{naira(item.amount_kobo / 100)}</b><small>{item.vendors?.[0]?.shop_name || 'Seller'} · Requested {dateLabel(item.requested_at)}</small><small>Request {item.id.slice(0,8).toUpperCase()} · {item.reminder_count} reminders sent</small></div><span className="dashboard-status pending">{item.status.toUpperCase()}</span></div><small className="admin-payout-destination">Transfer to: {item.account_name} · {item.bank_name} · •••• {item.account_last4}</small>{item.admin_note && <small>Admin note: {item.admin_note}</small>}<div className="admin-actions">{item.status === 'requested' && <button className="approve" disabled={!!busyId} onClick={() => void reviewWithdrawal(item,'approved')}>Approve request</button>}<button className="approve" disabled={!!busyId} onClick={() => void reviewWithdrawal(item,'paid')}>Record bank transfer paid</button><button className="danger-link" disabled={!!busyId} onClick={() => void reviewWithdrawal(item,'rejected')}>Reject</button></div></article>) : <div className="dashboard-empty"><b>No unpaid withdrawal requests.</b><span>New seller requests will appear here. Each outstanding request is also added to the five-minute admin reminder queue.</span></div>}{withdrawals.filter(item => ['paid','rejected','cancelled'].includes(item.status)).length > 0 && <div className="dashboard-empty"><b>Recent completed requests</b><span>{withdrawals.filter(item => ['paid','rejected','cancelled'].includes(item.status)).slice(0,5).map(item => `${item.vendors?.[0]?.shop_name || 'Seller'} · ${naira(item.amount_kobo/100)} · ${item.status}`).join('  |  ')}</span></div>}</> : tab === 'push' ? <><div className="dashboard-empty"><b>One featured message per day.</b><span>Only that day’s message is sent, at each subscriber’s random daytime slot. Keep it useful, short and campus-relevant.</span></div>{queue.dailyMessages.map(message => <article className="admin-item admin-push-item" key={message.weekday}><div className="admin-item-heading"><div><b>{weekdays[message.weekday]}</b><small>Daily campus pick · {message.enabled ? 'Enabled' : 'Paused'}</small></div></div><label>Notification title<input value={message.title} maxLength={120} onChange={event => editDailyMessage(message.weekday, 'title', event.target.value)}/></label><label>Notification message<textarea value={message.body} maxLength={240} rows={3} onChange={event => editDailyMessage(message.weekday, 'body', event.target.value)}/></label><label className="admin-push-toggle"><input type="checkbox" checked={message.enabled} onChange={event => editDailyMessage(message.weekday, 'enabled', event.target.checked)}/> Send this message on {weekdays[message.weekday]}</label><div className="admin-actions"><button className="approve" disabled={!!busyId || !message.title.trim() || !message.body.trim()} onClick={() => void saveDailyMessage(message)}>{busyId === 'push-' + message.weekday ? 'Saving…' : 'Save message'}</button></div></article>)}</> : tab === 'support' ? <><div className="admin-support-intro"><b>Support-triggered conversation reviews</b><span>Only conversations attached to an order-support case appear here, including closed cases for audit follow-up. Opening a chat is read-only and is recorded in the access audit.</span></div>{supportChat ? <section className="admin-support-chat"><header><div><span className="eyebrow">READ-ONLY INVESTIGATION</span><b>Order {supportChat.order.public_order_number}</b><small>Case {supportChat.support_case.id.slice(0,8).toUpperCase()} · {supportChat.support_case.status.toUpperCase()}</small></div><button type="button" onClick={()=>setSupportChat(null)}>Back to cases</button></header><div className="admin-support-participants"><span>Buyer: {supportChat.order.buyer_contact_snapshot?.name || 'Buyer'}</span><span>Seller: {supportChat.order.vendor?.shop_name || 'Seller'}</span></div><div className="admin-support-messages">{supportChat.messages.length ? supportChat.messages.map(message=><article key={message.id}><div><b>{message.sender_id===supportChat.order.buyer_id?'Buyer':'Seller'}</b><small>{dateLabel(message.created_at)}</small></div><p>{message.body}</p></article>) : <div className="dashboard-empty"><b>No chat messages</b><span>This order has no messages yet.</span></div>}{supportChat.events.map(event=><div className="admin-support-event" key={event.id}>{event.public_message || event.event_type.replaceAll('_',' ')} · {dateLabel(event.created_at)}</div>)}</div><small className="admin-support-audit-note">Your access to this conversation has been recorded. Messages cannot be edited or sent from the admin dashboard.</small></section> : <>{supportChatBusy && <div className="dashboard-empty">Opening protected conversation…</div>}{queue.supportCases.length ? queue.supportCases.map(item=><article className="admin-item admin-support-case" key={item.id}><div className="admin-item-heading"><div><b>Order {item.order_id.slice(0,8).toUpperCase()}</b><small>{item.vendors?.shop_name || 'Seller'} · Opened {dateLabel(item.created_at)}</small></div><span className="dashboard-status pending">{item.status.toUpperCase()}</span></div><p>{item.details}</p><div className="admin-actions"><button disabled={!!busyId || supportChatBusy} onClick={()=>void viewSupportChat(item.id)}>Review conversation</button>{(item.status === 'pending' || item.status === 'reviewing') && <><button disabled={!!busyId} onClick={()=>void act('review_report',item.id,'dismissed')}>Dismiss case</button><button className="approve" disabled={!!busyId} onClick={()=>void act('review_report',item.id,'resolved')}>Resolve & release hold</button></>}</div></article>) : <div className="dashboard-empty"><b>No open order-support cases.</b><span>When a buyer or seller contacts tradR. Support from an order chat, the case and its conversation will appear here.</span></div>}</>}</> : tab === 'shops' ? queue.vendors.length ? queue.vendors.map(vendor => <article className="admin-item" key={vendor.id}>
          <div className="admin-item-heading"><div><b>{vendor.shop_name}</b><small>Submitted {dateLabel(vendor.created_at)}</small></div><span className="dashboard-status pending">LEGACY PENDING</span></div>
          <p>{vendor.bio || 'No shop description provided.'}</p>
          <div className="admin-actions"><button disabled={!!busyId} onClick={() => void act('review_vendor', vendor.id, 'rejected')}>Reject shop</button><button className="approve" disabled={!!busyId} onClick={() => void act('review_vendor', vendor.id, 'approved')}>{busyId === vendor.id ? 'Saving…' : 'Approve shop'}</button></div>
        </article>) : <div className="dashboard-empty"><b>No legacy shops awaiting review.</b><span>New shops are approved automatically. This queue is only for older accounts that were pending before the change.</span></div> : tab === 'active' ? queue.activeListings.length ? Object.entries(activeByShop).map(([shopName, items]) => <section className="admin-shop-group" key={shopName}><div className="admin-shop-group-heading"><b>{shopName}</b><span>{items.length} active listing{items.length === 1 ? '' : 's'}</span></div>{items.map(listing => <article className="admin-item" key={listing.id}><div className="admin-item-heading"><div><b>{listing.title}</b><small>{naira(Number(listing.price_ngn))} · {listing.category}</small><small>Published {dateLabel(listing.created_at)} · Expires {dateLabel(listing.visible_until)}</small></div><span className="dashboard-status">ACTIVE</span></div><div className="admin-listing-preview">{listing.image_urls?.[0] && <img src={listing.image_urls[0]} alt="" loading="lazy" />}<div><p>{listing.description}</p></div></div><div className="admin-actions"><button className="danger-link" disabled={!!busyId} onClick={() => { if (window.confirm(`Remove “${listing.title}” from ${shopName}? It will immediately disappear from the marketplace. The record will be retained for moderation history.`)) void act('remove_listing', listing.id, '') }}>{busyId === listing.id ? 'Removing…' : 'Remove listing'}</button></div></article>)}</section>) : <div className="dashboard-empty"><b>No active listings.</b><span>Approved, currently published products will appear here, grouped by shop.</span></div> : tab === 'delivery' ? <>
          <div className="dashboard-empty"><b>Delivery-agent applications</b><span>Approve trusted agents before they can accept buyer-paid tradR deliveries.</span></div>
          {queue.deliveryAgents.length ? queue.deliveryAgents.map(agent => <article className="admin-item" key={agent.id}>
            <div className="admin-item-heading"><div><b>{agent.display_name}</b><small>{agent.phone} · Applied {dateLabel(agent.created_at)}</small></div><span className="dashboard-status pending">{agent.status.toUpperCase()}</span></div>
            <div className="admin-evidence-links">{agent.government_id_url ? <a href={agent.government_id_url} target="_blank" rel="noreferrer">Review LCU student proof ↗</a> : <small>LCU student proof not uploaded</small>}{agent.selfie_url ? <a href={agent.selfie_url} target="_blank" rel="noreferrer">Review selfie ↗</a> : <small>Selfie not uploaded</small>}</div>
            {agent.status === 'pending' && <div className="admin-actions"><button disabled={!!busyId} onClick={() => void reviewAgent(agent.id, 'suspended')}>Reject application</button><button className="approve" disabled={!!busyId || !agent.government_id_url || !agent.selfie_url} onClick={() => void reviewAgent(agent.id, 'approved')}>{busyId === agent.id ? 'Saving…' : 'Approve verified agent'}</button></div>}
            {agent.status === 'approved' && <div className="admin-actions"><button disabled={!!busyId} onClick={() => void reviewAgent(agent.id, 'suspended')}>Suspend agent</button></div>}
          </article>) : <div className="dashboard-empty"><b>No delivery-agent applications yet.</b><span>Applications submitted from the Delivery work portal will appear here.</span></div>}
          <div className="dashboard-empty"><b>Automatic first-acceptance dispatch</b><span>When a seller marks a tradR delivery ready, every approved agent is alerted. The first agent to accept it gets the job automatically. Admins no longer assign individual deliveries.</span></div>
          <div className="dashboard-empty"><b>Delivery incidents</b><span>Reported failures pause the order and hold payouts until an admin investigates.</span></div>
          {queue.incidents.filter(item => ['pending','reviewing','refund_required'].includes(item.status)).map(incident => <article className="admin-item" key={incident.id}>
            <div className="admin-item-heading"><div><b>{incident.reason.replaceAll('_',' ')}</b><small>Order {incident.order_id.slice(0,8)} · {dateLabel(incident.created_at)}</small></div><span className="dashboard-status pending">{incident.status.toUpperCase()}</span></div>
            <p>{incident.details}</p>
            <small>{incident.pickup_completed ? 'The parcel was collected. Confirm it has been returned to the seller before reopening this delivery.' : 'The parcel was not yet picked up when the issue was reported.'}</small>
            {incident.status !== 'refund_required' && <div className="admin-actions"><button disabled={!!busyId} onClick={() => void resolveIncident(incident.id,'reopen_delivery')}>Reopen delivery</button><button className="danger-link" disabled={!!busyId} onClick={() => void resolveIncident(incident.id,'refund_required')}>Require refund</button></div>}
            {incident.status === 'refund_required' && <><small>Complete the full refund in Paystack before recording it here.</small><div className="admin-actions"><button className="approve" disabled={!!busyId} onClick={() => void recordRefund(incident.order_id)}>{busyId === incident.order_id ? 'Recording…' : 'Record completed refund'}</button></div></>}
          </article>)}
          <div className="dashboard-empty"><b>Seller payouts</b><span>Seller proceeds are 95% of item subtotal. Payout becomes eligible after buyer confirmation or 48 hours after verified delivery, unless the order is disputed.</span></div>
          {queue.sellerPayouts.filter(item => item.status !== 'succeeded' && item.status !== 'cancelled').map(payout => <article className="admin-item" key={payout.id}>
            <div className="admin-item-heading"><div><b>{naira(payout.amount_kobo / 100)}</b><small>Order {payout.order_id?.slice(0,8) || 'Legacy payout'} · {dateLabel(payout.requested_at)}</small></div><span className="dashboard-status pending">{payout.status.toUpperCase()}</span></div>
            {payout.eligible_at && new Date(payout.eligible_at) > new Date() && <small>Eligible {dateLabel(payout.eligible_at)}</small>}
            {payout.payout_account && <small className="admin-payout-destination">Pay to: {payout.payout_account.account_name} · {payout.payout_account.bank_name} · •••• {payout.payout_account.account_last4}</small>}
            {!payout.payout_account && <small className="admin-payout-destination missing">No verified seller bank account is on file.</small>}
            <div className="admin-actions"><button disabled={!!busyId} onClick={() => void recordPayout('seller',payout.id,'processing')}>Mark processing</button><button className="approve" disabled={!!busyId || (!!payout.eligible_at && new Date(payout.eligible_at) > new Date())} onClick={() => void recordPayout('seller',payout.id,'succeeded')}>Record paid</button><button disabled={!!busyId} onClick={() => void recordPayout('seller',payout.id,'failed')}>Failed</button></div>
          </article>)}
          <div className="dashboard-empty"><b>Delivery-agent payouts</b><span>₦1,000 is allocated to the agent after verified handover. Record manual transfers within 24 hours.</span></div>
          {queue.agentPayouts.filter(item => item.status !== 'succeeded' && item.status !== 'cancelled').map(payout => <article className="admin-item" key={payout.id}>
            <div className="admin-item-heading"><div><b>{naira(payout.amount_kobo / 100)}</b><small>Order {payout.order_id?.slice(0,8) || '—'} · {dateLabel(payout.requested_at)}</small></div><span className="dashboard-status pending">{payout.status.toUpperCase()}</span></div>
            <div className="admin-actions"><button disabled={!!busyId} onClick={() => void recordPayout('agent',payout.id,'processing')}>Mark processing</button><button className="approve" disabled={!!busyId} onClick={() => void recordPayout('agent',payout.id,'succeeded')}>Record paid</button><button disabled={!!busyId} onClick={() => void recordPayout('agent',payout.id,'failed')}>Failed</button></div>
          </article>)}
        </> : queue.reports.length ? queue.reports.map(report => <article className="admin-item" key={report.id}>
          <div className="admin-item-heading"><div><b>{report.reason.replaceAll('_', ' ')}</b><small>{report.vendors?.[0]?.shop_name || 'Unknown shop'}{report.listings?.title ? ' · ' + report.listings.title : ''}</small><small>Submitted {dateLabel(report.created_at)}</small></div><span className="dashboard-status pending">{report.status.toUpperCase()}</span></div>
          <p className="admin-report-details">{report.details}</p>
          <small className="admin-contact">{report.evidence_paths.length} evidence file(s) attached. Secure preview links expire after 10 minutes.</small>
          {!!report.evidence_urls?.length && <div className="admin-evidence-links">{report.evidence_urls.map((url, index) => <a key={url} href={url} target="_blank" rel="noreferrer">Open evidence {index + 1} ↗</a>)}</div>}
          <div className="admin-actions">{report.status === 'pending' && <button disabled={!!busyId} onClick={() => void act('review_report', report.id, 'reviewing')}>Mark reviewing</button>}<button disabled={!!busyId} onClick={() => void act('review_report', report.id, 'dismissed')}>Dismiss</button><button className="approve" disabled={!!busyId} onClick={() => void act('review_report', report.id, 'resolved')}>{busyId === report.id ? 'Saving…' : 'Resolve report'}</button></div>
        </article>) : <div className="dashboard-empty"><b>No open safety reports.</b><span>New buyer reports will appear here.</span></div>}
      </div>
        <div className="admin-footer"><small>Actions are checked on the server. A decision is applied only when the record is still in the expected review state.</small><button className="confirmation-secondary" disabled={loading || !!busyId} onClick={() => void loadQueue()}>Refresh queue</button></div>
      </main>
    </section>
  </div>
}
