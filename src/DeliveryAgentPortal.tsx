import { useCallback, useEffect, useState, type FormEvent } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'

type Agent = { id: string; status: 'pending' | 'approved' | 'suspended'; display_name: string; phone: string }

function normalizeNigerianPhone(value: string): string | null {
  const compact = value.trim().replace(/[\s()-]/g, '')
  let national = ''
  if (/^0[789]\d{9}$/.test(compact)) national = compact.slice(1)
  else if (/^\+234[789]\d{9}$/.test(compact)) national = compact.slice(4)
  else if (/^234[789]\d{9}$/.test(compact)) national = compact.slice(3)
  else return null
  return '+234' + national
}
type DeliveryTask = {
  delivery_id: string
  order_id: string
  order_number: string
  delivery_status: string
  order_status: string
  is_available: boolean
  destination: { address?: string; instructions?: string } | null
  buyer_name: string | null
  buyer_phone: string | null
  seller_name: string
  assigned_at: string
  dispatch_at: string | null
  created_at: string
  items: Array<{ title: string; quantity: number }>
}

export default function DeliveryAgentPortal({ db, user, open, onOpenChange, onToast, standalone = false, vapidPublicKey }: {
  db: SupabaseClient
  user: { id: string } | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onToast: (message: string) => void
  standalone?: boolean
  vapidPublicKey?: string
}) {
  const [agent, setAgent] = useState<Agent | null>(null)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [governmentId, setGovernmentId] = useState<File | null>(null)
  const [selfie, setSelfie] = useState<File | null>(null)
  const [issueReasons, setIssueReasons] = useState<Record<string, string>>({})
  const [issueDetails, setIssueDetails] = useState<Record<string, string>>({})
  const [tasks, setTasks] = useState<DeliveryTask[]>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState('')
  const [codeInputs, setCodeInputs] = useState<Record<string, string>>({})
  const [applicationEmailState, setApplicationEmailState] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle')
  const [applicationSubmitted, setApplicationSubmitted] = useState(false)

  async function sendApplicationEmail() {
    setApplicationEmailState('sending')
    const { data, error } = await db.functions.invoke('delivery-agent-notifications', { body: { action: 'application_submitted' } })
    if (error || data?.error || !data?.applicant_email_sent) {
      setApplicationEmailState('failed')
      return
    }
    setApplicationEmailState('sent')
  }

  const load = useCallback(async () => {
    if (!user) { setAgent(null); setTasks([]); return }
    setLoading(true)
    try {
      const { data, error } = await db.from('delivery_agents')
        .select('id,status,display_name,phone').eq('user_id', user.id).maybeSingle()
      if (error) throw error
      setAgent(data as Agent | null)
      if (data?.status === 'approved') {
        const { data: taskData, error: taskError } = await db.rpc('agent_list_my_deliveries')
        if (taskError) throw taskError
        setTasks(Array.isArray(taskData) ? taskData as DeliveryTask[] : [])
      } else setTasks([])
    } catch (error) {
      onToast(error instanceof Error ? error.message : 'Could not load delivery work.')
    } finally { setLoading(false) }
  }, [db, onToast, user?.id])

  useEffect(() => { if (open && user) void load() }, [open, user?.id, load])

  useEffect(() => {
    if (!open || !user) return
    const channel = db.channel('tradr-agent-jobs-' + user.id)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: 'user_id=eq.' + user.id }, () => { void load() })
      .subscribe()
    return () => { void db.removeChannel(channel) }
  }, [db, load, open, user?.id])

  async function apply(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    const normalizedPhone = normalizeNigerianPhone(phone)
    if (!normalizedPhone) { onToast('Enter a valid Nigerian mobile number, e.g. 09012345678 or +2349012345678.'); return }
    if (!governmentId || !selfie) { onToast('Upload your Lead City University ID card or a student-portal screenshot, plus a clear selfie.'); return }
    if (!vapidPublicKey || !('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) { onToast('Push notifications are required for Errand agents, but this browser does not support the required setup.'); return }
    if (Notification.permission !== 'granted') {
      const permission = Notification.permission === 'denied' ? 'denied' : await Notification.requestPermission()
      if (permission !== 'granted') { onToast('Allow notifications to continue with your Errand application. You can enable them in your browser site settings.'); return }
    }
    if (!['image/jpeg', 'image/png', 'application/pdf'].includes(governmentId.type) || !['image/jpeg', 'image/png'].includes(selfie.type)) {
      onToast('Use JPG, PNG or PDF for your LCU ID card or portal proof, and JPG or PNG for your selfie.'); return
    }
    if (governmentId.size > 5 * 1024 * 1024 || selfie.size > 5 * 1024 * 1024) {
      onToast('Each verification file must be 5 MB or smaller.'); return
    }
    setBusy('apply')
    try {
      const idExt = governmentId.type === 'application/pdf' ? 'pdf' : governmentId.type === 'image/png' ? 'png' : 'jpg'
      const selfieExt = selfie.type === 'image/png' ? 'png' : 'jpg'
      const idPath = user!.id + '/lcu-student-proof-' + crypto.randomUUID() + '.' + idExt
      const selfiePath = user!.id + '/selfie-' + crypto.randomUUID() + '.' + selfieExt
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.getSubscription() ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: Uint8Array.from(atob(vapidPublicKey.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - vapidPublicKey.length % 4) % 4)), char => char.charCodeAt(0)) })
      const pushJson = subscription.toJSON()
      if (!pushJson.endpoint || !pushJson.keys?.p256dh || !pushJson.keys?.auth) throw new Error('Could not complete secure push-notification setup.')
      const { error: pushError } = await db.from('push_subscriptions').upsert({ user_id: user!.id, endpoint: pushJson.endpoint, p256dh: pushJson.keys.p256dh, auth: pushJson.keys.auth, updated_at: new Date().toISOString() }, { onConflict: 'endpoint' })
      if (pushError) throw pushError
      const { error: idError } = await db.storage.from('delivery-agent-verification').upload(idPath, governmentId, { contentType: governmentId.type, upsert: false })
      if (idError) throw idError
      const { error: selfieError } = await db.storage.from('delivery-agent-verification').upload(selfiePath, selfie, { contentType: selfie.type, upsert: false })
      if (selfieError) throw selfieError
      const { error } = await db.rpc('apply_as_delivery_agent', {
        p_display_name: name, p_phone: normalizedPhone,
        p_government_id_path: idPath, p_selfie_path: selfiePath,
      })
      if (error) throw error
      setApplicationSubmitted(true)
      setGovernmentId(null); setSelfie(null)
      await load()
      await sendApplicationEmail()
      onToast('Your delivery-agent application has been received and is awaiting review.')
    } catch (error) {
      onToast(error instanceof Error ? error.message : 'Could not submit your application.')
    } finally { setBusy('') }
  }

  async function accept(task: DeliveryTask) {
    if (busy) return
    setBusy(task.delivery_id)
    const { data, error } = await db.rpc('agent_accept_delivery', { p_delivery_id: task.delivery_id })
    if (error) onToast(error.message.includes('already accepted') ? 'Another agent got there first. The job is no longer available.' : error.message)
    else { onToast(`You got order ${data?.order_number || task.order_number}. The pickup and drop-off details are now available.`); await load() }
    setBusy('')
  }

  async function markPickedUp(task: DeliveryTask) {
    if (busy) return
    if (!window.confirm(`Confirm that you have collected order ${task.order_number} from ${task.seller_name}?`)) return
    setBusy(task.delivery_id)
    const { error } = await db.rpc('agent_mark_delivery_picked_up', { p_delivery_id: task.delivery_id })
    if (error) onToast(error.message)
    else { onToast('Pickup recorded. The buyer can now share their one-time handover code.'); await load() }
    setBusy('')
  }

  async function reportIssue(task: DeliveryTask) {
    if (busy) return
    const reason = issueReasons[task.delivery_id] || 'other'
    const details = (issueDetails[task.delivery_id] || '').trim()
    if (details.length < 10) { onToast('Describe the delivery issue in at least 10 characters.'); return }
    if (!window.confirm('Report this delivery issue to tradR. support? The order will be paused for investigation.')) return
    setBusy('issue-' + task.delivery_id)
    const { error } = await db.rpc('agent_report_delivery_issue', {
      p_delivery_id: task.delivery_id, p_reason: reason, p_details: details,
    })
    if (error) onToast(error.message)
    else {
      onToast('Issue reported. The order is paused while tradR. investigates.')
      setIssueDetails(current => ({ ...current, [task.delivery_id]: '' }))
      await load()
    }
    setBusy('')
  }

  async function verify(task: DeliveryTask) {
    if (busy) return
    setBusy(task.delivery_id)
    const { data, error } = await db.rpc('agent_verify_delivery_code', {
      p_delivery_id: task.delivery_id,
      p_code: codeInputs[task.delivery_id] ?? '',
    })
    if (error) onToast(error.message)
    else if (data?.success) { onToast(data.message || 'Delivery verified.'); setCodeInputs(current => ({ ...current, [task.delivery_id]: '' })); await load() }
    else onToast(data?.message || 'Could not verify that code.')
    setBusy('')
  }

  if (!open) return null
  const availableTasks = tasks.filter(task => task.is_available)
  const assignedTasks = tasks.filter(task => !task.is_available)

  return <div className={standalone ? 'delivery-agent-standalone' : 'modal-backdrop delivery-agent-backdrop'} onMouseDown={event => { if (!standalone && event.target === event.currentTarget && !busy) onOpenChange(false) }}>
    <section className={standalone ? 'delivery-agent-modal delivery-agent-page' : 'form-modal delivery-agent-modal'} role="dialog" aria-modal="true" aria-labelledby="delivery-agent-heading">
      <button type="button" className="modal-close modal-back-button" onClick={() => onOpenChange(false)} aria-label={standalone ? 'Return to marketplace' : 'Close delivery portal'}>←</button>
      <div className="modal-brand-mark">t<span>.</span></div>
      <span className="eyebrow">TRADR. ERRAND · DELIVERY NETWORK</span>
      <h2 id="delivery-agent-heading">Your next delivery starts here.</h2>
      <p>Apply to become a delivery agent, manage your approval, and accept nearby campus deliveries. The first approved agent to accept an open job secures it.</p>
      {!user ? <div className="dashboard-empty"><b>Sign in to continue.</b><span>Sign in or create an account to submit your separate Errand agent application. Marketplace seller approval does not grant delivery-agent access.</span></div> : loading ? <div className="dashboard-empty">Loading your delivery account…</div> : agent?.status === 'suspended' ? <div className="dashboard-empty"><b>Account suspended.</b><span>Contact the tradR. team if you believe this is a mistake.</span></div> : agent?.status === 'pending' ? <div className="delivery-agent-confirmation" role="status" aria-live="polite"><div className="delivery-agent-confirmation-icon">✓</div><span className="eyebrow">APPLICATION SUBMITTED</span><h3>{applicationSubmitted ? 'You’re officially in the review queue.' : 'Your application is with us.'}</h3><p>Thanks, {agent.display_name}. We’ve securely received your LCU student proof and selfie. The tradR. team will review your details. You’ll receive an email when your application is submitted and when a decision is made.</p><div className="delivery-agent-confirmation-details"><span>Applicant</span><b>{agent.display_name}</b><span>Phone number</span><b>{agent.phone}</b><span>Current status</span><b className="delivery-agent-pending-status">Pending review</b></div><div className="delivery-agent-email-status">{applicationEmailState === 'sending' ? 'Sending your confirmation email…' : applicationEmailState === 'sent' ? '✓ Confirmation email sent. Check your inbox.' : applicationEmailState === 'failed' ? 'Your application is saved, but the email could not be sent yet.' : 'Your application is saved securely.'}</div>{applicationEmailState !== 'sent' && <button type="button" className="confirmation-secondary" disabled={applicationEmailState === 'sending'} onClick={() => void sendApplicationEmail()}>{applicationEmailState === 'sending' ? 'Sending…' : 'Send confirmation email'}</button>}<button type="button" className="confirmation-secondary" onClick={() => void load()}>Refresh application status</button></div> : agent?.status === 'approved' ? <>
        <div className="seller-orders-summary"><article><span>OPEN JOBS</span><b>{availableTasks.length}</b></article><article><span>YOUR ACTIVE TASKS</span><b>{assignedTasks.filter(task => !['delivered', 'failed', 'cancelled'].includes(task.delivery_status)).length}</b></article></div>
        <section className="delivery-agent-jobs">
          <div className="section-topline"><span>AVAILABLE NOW</span><span>FIRST ACCEPTANCE WINS</span></div>
          {availableTasks.length ? <div className="delivery-agent-task-list">{availableTasks.map(task => <article className="seller-order-card delivery-open-job" key={task.delivery_id}>
            <div className="seller-order-top"><div><span className="seller-order-number">{task.order_number}</span><small>{task.seller_name} · {new Date(task.created_at).toLocaleDateString('en-NG')}</small></div><span className="seller-order-status">OPEN JOB</span></div>
            <div className="seller-order-items">{task.items.map((item, index) => <div className="seller-order-item" key={task.delivery_id + '-' + index}><span className="seller-order-item-placeholder">t.</span><span><b>{item.title}</b><small>Quantity {item.quantity}</small></span></div>)}</div>
            <p className="seller-order-agent-note">Accept this job to reveal the pickup and buyer drop-off details. Another agent may accept it first.</p>
            <button type="button" className="seller-order-action" disabled={!!busy} onClick={() => void accept(task)}>{busy === task.delivery_id ? 'Claiming job…' : 'Accept delivery'} <span>↗</span></button>
          </article>)}</div> : <div className="dashboard-empty"><b>No open delivery jobs right now.</b><span>Keep notifications on. New paid orders will appear here as soon as sellers mark them ready.</span></div>}
        </section>
        <section className="delivery-agent-jobs">
          <div className="section-topline"><span>YOUR ACCEPTED JOBS</span><button type="button" onClick={() => void load()} disabled={loading}>Refresh</button></div>
          {assignedTasks.length ? <div className="delivery-agent-task-list">{assignedTasks.map(task => <article className="seller-order-card" key={task.delivery_id}>
            <div className="seller-order-top"><div><span className="seller-order-number">{task.order_number}</span><small>{task.seller_name} · {new Date(task.created_at).toLocaleDateString('en-NG')}</small></div><span className="seller-order-status">{task.delivery_status.replaceAll('_', ' ')}</span></div>
            <div className="seller-order-delivery"><b>Drop-off address</b><span>{task.destination?.address || 'Address not supplied'}</span>{task.destination?.instructions && <small>Instructions: {task.destination.instructions}</small>}</div>
            <div className="seller-order-buyer"><b>{task.buyer_name || 'Buyer'}</b>{task.buyer_phone && <a href={`tel:${task.buyer_phone}`}>{task.buyer_phone}</a>}</div>
            {task.delivery_status === 'assigned' && <button type="button" className="seller-order-action" disabled={!!busy} onClick={() => void markPickedUp(task)}>{busy === task.delivery_id ? 'Updating…' : 'Confirm pickup'} <span>↗</span></button>}
            {task.delivery_status === 'picked_up' && <div className="delivery-agent-verify"><label>Buyer’s 8-character handover code<input value={codeInputs[task.delivery_id] ?? ''} onChange={event => setCodeInputs(current => ({ ...current, [task.delivery_id]: event.target.value.toUpperCase().slice(0, 8) }))} autoComplete="off" maxLength={8} placeholder="Enter code"/></label><button type="button" className="seller-order-action" disabled={!!busy || (codeInputs[task.delivery_id] ?? '').length !== 8} onClick={() => void verify(task)}>{busy === task.delivery_id ? 'Verifying…' : 'Verify handover'} <span>↗</span></button></div>}
            {task.delivery_status === 'delivered' && <div className="buyer-order-complete">✓ Handover verified</div>}
            {['assigned', 'picked_up'].includes(task.delivery_status) && <details className="delivery-agent-issue">
              <summary>Report a delivery problem</summary>
              <label>Issue type<select value={issueReasons[task.delivery_id] || 'other'} onChange={event => setIssueReasons(current => ({ ...current, [task.delivery_id]: event.target.value }))}>
                <option value="buyer_unavailable">Buyer unavailable</option><option value="address_issue">Address issue</option><option value="item_issue">Item or package issue</option><option value="safety_concern">Safety concern</option><option value="vehicle_issue">Vehicle issue</option><option value="other">Other</option>
              </select></label>
              <label>What happened?<textarea value={issueDetails[task.delivery_id] || ''} onChange={event => setIssueDetails(current => ({ ...current, [task.delivery_id]: event.target.value.slice(0, 2000) }))} rows={3} maxLength={2000} placeholder="Explain the issue so the team can investigate." /></label>
              <button type="button" className="seller-order-action" disabled={!!busy || (issueDetails[task.delivery_id] || '').trim().length < 10} onClick={() => void reportIssue(task)}>{busy === 'issue-' + task.delivery_id ? 'Reporting…' : 'Submit issue report'}</button>
            </details>}
          </article>)}</div> : <div className="dashboard-empty"><b>No accepted jobs yet.</b><span>Accept an open job above when you are ready to handle it.</span></div>}
        </section>
      </> : <form onSubmit={apply} className="delivery-agent-application">
        <div className="dashboard-empty"><b>Become a tradR delivery agent.</b><span>Submit your name, active phone number, Lead City University ID card or a screenshot of your student portal, and a clear selfie. Your documents are stored privately and reviewed by the tradR. team before you can accept jobs.</span></div>
        <label>Full name<input value={name} onChange={event => setName(event.target.value)} minLength={2} maxLength={100} required placeholder="Your name as shown on your LCU profile"/></label>
        <label>Phone number (Nigeria only)<input type="tel" value={phone} onChange={event => setPhone(event.target.value)} onBlur={() => { const normalized = normalizeNigerianPhone(phone); if (normalized) setPhone(normalized) }} inputMode="tel" autoComplete="tel" maxLength={18} required placeholder="09012345678 or +2349012345678"/><small>Use an 11-digit Nigerian mobile number or its +234 international format. We’ll save it in +234 format.</small></label>
        <label>Lead City University student proof <small>Upload your LCU ID card or a screenshot of your student portal · JPG, PNG or PDF · max 5 MB</small><input type="file" accept="image/jpeg,image/png,application/pdf" required onChange={event => setGovernmentId(event.target.files?.[0] || null)}/></label>
        <label>Clear selfie <small>JPG or PNG · max 5 MB</small><input type="file" accept="image/jpeg,image/png" required onChange={event => setSelfie(event.target.files?.[0] || null)}/></label>
        <button className="modal-primary" disabled={busy === 'apply'}>{busy === 'apply' ? 'Submitting…' : 'Submit application'} <span>↗</span></button>
        <small className="form-footnote">Only current Lead City University students should apply. Your LCU student proof and selfie are reviewed privately before agent approval.</small>
      </form>}
    </section>
  </div>
}
