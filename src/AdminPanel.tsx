import { useCallback, useEffect, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'

type AdminPanelProps = { db: SupabaseClient; onClose: () => void }
type VendorRow = { id: string; shop_name: string; bio: string; whatsapp_number: string; verification_status: string; created_at: string }
type ReportRow = { id: string; reason: string; details: string; status: string; created_at: string; vendor_id: string; listing_id: string | null; evidence_paths: string[]; evidence_urls?: string[]; vendors?: { shop_name: string } | null; listings?: { title: string } | null }
type ActiveListingRow = { id: string; title: string; description: string; category: string; price_ngn: number; image_urls: string[]; status: string; moderation_status: string; created_at: string; visible_until: string; vendors?: { shop_name: string; verification_status: string } | null }
type DailyPushMessage = { weekday: number; title: string; body: string; enabled: boolean }
type Queue = { vendors: VendorRow[]; reports: ReportRow[]; activeListings: ActiveListingRow[]; dailyMessages: DailyPushMessage[] }
type Tab = 'shops' | 'active' | 'reports' | 'push'

const emptyQueue: Queue = { vendors: [], reports: [], activeListings: [], dailyMessages: [] }
const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const dateLabel = (value: string) => new Date(value).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' })
const naira = (value: number) => new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(value)

export default function AdminPanel({ db, onClose }: AdminPanelProps) {
  const [tab, setTab] = useState<Tab>('shops')
  const [queue, setQueue] = useState<Queue>(emptyQueue)
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState('')
  const [notice, setNotice] = useState('')
  const [failure, setFailure] = useState('')

  const loadQueue = useCallback(async () => {
    setLoading(true)
    setFailure('')
    const { data, error } = await db.functions.invoke('admin-moderation', { body: { action: 'load' } })
    if (error || data?.error) {
      setFailure(data?.error || error?.message || 'Could not load the moderation queue.')
      setLoading(false)
      return
    }
    setQueue({
      vendors: Array.isArray(data?.vendors) ? data.vendors : [],
      reports: Array.isArray(data?.reports) ? data.reports : [],
      activeListings: Array.isArray(data?.active_listings) ? data.active_listings : [],
      dailyMessages: Array.isArray(data?.daily_push_messages) ? data.daily_push_messages : [],
    })
    setLoading(false)
  }, [db])

  useEffect(() => { void loadQueue() }, [loadQueue])

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

  const counts = { shops: queue.vendors.length, active: queue.activeListings.length, reports: queue.reports.length, push: queue.dailyMessages.length }
  const activeByShop = queue.activeListings.reduce<Record<string, ActiveListingRow[]>>((groups, listing) => { const shop = listing.vendors?.shop_name || 'Unknown shop'; (groups[shop] ??= []).push(listing); return groups }, {})

  return <div className="modal-backdrop admin-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !busyId) onClose() }}>
    <section className="form-modal admin-modal" role="dialog" aria-modal="true" aria-labelledby="admin-heading">
      <button className="modal-close" onClick={onClose} aria-label="Close admin moderation"><span aria-hidden="true">×</span></button>
      <div className="modal-brand-mark">t<span>.</span></div>
      <span className="eyebrow">TRADR OPERATIONS</span>
      <h2 id="admin-heading">Moderation desk.</h2>
      <p>Approve shops before they can sell, monitor live listings, follow up on buyer safety reports, and manage the daily campus pick.</p>
      <div className="admin-tabs" role="tablist" aria-label="Moderation queues">
        {(['shops', 'active', 'reports', 'push'] as const).map(item => <button key={item} role="tab" aria-selected={tab === item} className={tab === item ? 'active' : ''} onClick={() => setTab(item)}>{item === 'shops' ? 'Shops' : item === 'active' ? 'Live by shop' : item === 'reports' ? 'Safety reports' : 'Daily push'} <span>{counts[item]}</span></button>)}
      </div>
      {notice && <div className="admin-notice">{notice}</div>}
      {failure && <div className="admin-error" role="alert">{failure}{failure.includes('Admin access') ? ' Ask the project owner to grant your account the admin app_metadata role.' : ''}</div>}
      <div className="admin-queue">
        {loading ? <div className="dashboard-empty"><b>Loading review queue…</b><span>Checking your admin permissions and latest records.</span></div> : tab === 'push' ? <><div className="dashboard-empty"><b>One featured message per day.</b><span>Only that day’s message is sent, at each subscriber’s random daytime slot. Keep it useful, short and campus-relevant.</span></div>{queue.dailyMessages.map(message => <article className="admin-item admin-push-item" key={message.weekday}><div className="admin-item-heading"><div><b>{weekdays[message.weekday]}</b><small>Daily campus pick · {message.enabled ? 'Enabled' : 'Paused'}</small></div></div><label>Notification title<input value={message.title} maxLength={120} onChange={event => editDailyMessage(message.weekday, 'title', event.target.value)}/></label><label>Notification message<textarea value={message.body} maxLength={240} rows={3} onChange={event => editDailyMessage(message.weekday, 'body', event.target.value)}/></label><label className="admin-push-toggle"><input type="checkbox" checked={message.enabled} onChange={event => editDailyMessage(message.weekday, 'enabled', event.target.checked)}/> Send this message on {weekdays[message.weekday]}</label><div className="admin-actions"><button className="approve" disabled={!!busyId || !message.title.trim() || !message.body.trim()} onClick={() => void saveDailyMessage(message)}>{busyId === 'push-' + message.weekday ? 'Saving…' : 'Save message'}</button></div></article>)}</> : tab === 'shops' ? queue.vendors.length ? queue.vendors.map(vendor => <article className="admin-item" key={vendor.id}>
          <div className="admin-item-heading"><div><b>{vendor.shop_name}</b><small>Submitted {dateLabel(vendor.created_at)}</small></div><span className="dashboard-status pending">PENDING</span></div>
          <p>{vendor.bio || 'No shop description provided.'}</p><small className="admin-contact">WhatsApp: {vendor.whatsapp_number}</small>
          <div className="admin-actions"><button disabled={!!busyId} onClick={() => void act('review_vendor', vendor.id, 'rejected')}>Reject shop</button><button className="approve" disabled={!!busyId} onClick={() => void act('review_vendor', vendor.id, 'approved')}>{busyId === vendor.id ? 'Saving…' : 'Approve shop'}</button></div>
        </article>) : <div className="dashboard-empty"><b>All clear on shops.</b><span>There are no shops waiting for approval.</span></div> : tab === 'active' ? queue.activeListings.length ? Object.entries(activeByShop).map(([shopName, items]) => <section className="admin-shop-group" key={shopName}><div className="admin-shop-group-heading"><b>{shopName}</b><span>{items.length} active listing{items.length === 1 ? '' : 's'}</span></div>{items.map(listing => <article className="admin-item" key={listing.id}><div className="admin-item-heading"><div><b>{listing.title}</b><small>{naira(Number(listing.price_ngn))} · {listing.category}</small><small>Published {dateLabel(listing.created_at)} · Expires {dateLabel(listing.visible_until)}</small></div><span className="dashboard-status">ACTIVE</span></div><div className="admin-listing-preview">{listing.image_urls?.[0] && <img src={listing.image_urls[0]} alt="" loading="lazy" />}<div><p>{listing.description}</p></div></div><div className="admin-actions"><button className="danger-link" disabled={!!busyId} onClick={() => { if (window.confirm(`Remove “${listing.title}” from ${shopName}? It will immediately disappear from the marketplace. The record will be retained for moderation history.`)) void act('remove_listing', listing.id, '') }}>{busyId === listing.id ? 'Removing…' : 'Remove listing'}</button></div></article>)}</section>) : <div className="dashboard-empty"><b>No active listings.</b><span>Approved, currently published products will appear here, grouped by shop.</span></div> : queue.reports.length ? queue.reports.map(report => <article className="admin-item" key={report.id}>
          <div className="admin-item-heading"><div><b>{report.reason.replaceAll('_', ' ')}</b><small>{report.vendors?.shop_name || 'Unknown shop'}{report.listings?.title ? ' · ' + report.listings.title : ''}</small><small>Submitted {dateLabel(report.created_at)}</small></div><span className="dashboard-status pending">{report.status.toUpperCase()}</span></div>
          <p className="admin-report-details">{report.details}</p>
          <small className="admin-contact">{report.evidence_paths.length} evidence file(s) attached. Secure preview links expire after 10 minutes.</small>
          {!!report.evidence_urls?.length && <div className="admin-evidence-links">{report.evidence_urls.map((url, index) => <a key={url} href={url} target="_blank" rel="noreferrer">Open evidence {index + 1} ↗</a>)}</div>}
          <div className="admin-actions">{report.status === 'pending' && <button disabled={!!busyId} onClick={() => void act('review_report', report.id, 'reviewing')}>Mark reviewing</button>}<button disabled={!!busyId} onClick={() => void act('review_report', report.id, 'dismissed')}>Dismiss</button><button className="approve" disabled={!!busyId} onClick={() => void act('review_report', report.id, 'resolved')}>{busyId === report.id ? 'Saving…' : 'Resolve report'}</button></div>
        </article>) : <div className="dashboard-empty"><b>No open safety reports.</b><span>New buyer reports will appear here.</span></div>}
      </div>
      <div className="admin-footer"><small>Actions are checked on the server. A decision is applied only when the record is still in the expected review state.</small><button className="confirmation-secondary" disabled={loading || !!busyId} onClick={() => void loadQueue()}>Refresh queue</button></div>
    </section>
  </div>
}
