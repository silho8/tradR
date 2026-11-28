import { useCallback, useEffect, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'

type Withdrawal = { id: string; amount_kobo: number; status: string; requested_at: string; transfer_reference: string | null; admin_note: string | null }
type Summary = { available_kobo: number; requests: Withdrawal[] }
const naira = (kobo: number) => new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(kobo / 100)

export default function SellerWithdrawals({ db, onToast }: { db: SupabaseClient; onToast: (message: string) => void }) {
  const [summary, setSummary] = useState<Summary>({ available_kobo: 0, requests: [] })
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await db.rpc('seller_list_my_withdrawals')
    if (error) onToast(error.message)
    else setSummary({ available_kobo: Number(data?.available_kobo ?? 0), requests: Array.isArray(data?.requests) ? data.requests : [] })
    setLoading(false)
  }, [db, onToast])
  useEffect(() => { void load() }, [load])
  async function request() {
    if (busy || summary.available_kobo <= 0) return
    setBusy(true)
    const { data, error } = await db.rpc('seller_request_withdrawal')
    if (error) onToast(error.message)
    else {
      onToast('Withdrawal request submitted. tradR. admins have been notified.')
      const requestId = data?.id as string | undefined
      if (requestId) {
        const { error: notifyError } = await db.functions.invoke('notify-withdrawal-admins', { body: { request_id: requestId } })
        if (notifyError || data?.failed) onToast('Withdrawal saved and admins have an in-app alert. WhatsApp delivery is waiting on Meta template approval or messaging configuration.')
      }
      await load()
    }
    setBusy(false)
  }
  async function cancel(id: string) {
    if (busy) return
    setBusy(true)
    const { error } = await db.rpc('seller_cancel_withdrawal', { p_request_id: id })
    if (error) onToast(error.message)
    else { onToast('Withdrawal request cancelled. Eligible payouts are available again.'); await load() }
    setBusy(false)
  }
  return <section className="seller-withdrawals">
    <div className="section-topline"><span>SELLER WITHDRAWALS</span><span>MANUAL BANK TRANSFER</span></div>
    <div className="seller-withdrawal-balance"><span>AVAILABLE TO REQUEST</span><b>{loading ? '…' : naira(summary.available_kobo)}</b><small>Eligible seller proceeds only. The 5% marketplace commission has already been deducted; no extra withdrawal commission applies.</small></div>
    <button type="button" className="seller-guide-primary" disabled={busy || loading || summary.available_kobo <= 0 || summary.requests.some(item => ['requested','approved'].includes(item.status))} onClick={() => void request()}>{busy ? 'Please wait…' : 'Request withdrawal'} <span>↗</span></button>
    <small className="seller-analytics-footnote">Requests are reviewed by tradR. admins and paid manually to your verified bank account. Keep your Payment Details up to date.</small>
    <div className="seller-withdrawal-history"><div className="section-topline"><span>WITHDRAWAL HISTORY</span><button type="button" onClick={() => void load()} disabled={loading}>Refresh</button></div>
      {loading ? <div className="dashboard-empty">Loading withdrawal history…</div> : summary.requests.length ? summary.requests.map(item => <article className="seller-withdrawal-row" key={item.id}><div><b>{naira(item.amount_kobo)}</b><small>{new Date(item.requested_at).toLocaleString('en-NG',{dateStyle:'medium',timeStyle:'short'})} · Ref {item.id.slice(0,8).toUpperCase()}</small>{item.transfer_reference && <small>Transfer reference: {item.transfer_reference}</small>}{item.admin_note && <small>Admin note: {item.admin_note}</small>}</div><span className={'dashboard-status ' + (item.status === 'paid' ? '' : 'pending')}>{item.status.toUpperCase()}</span>{item.status === 'requested' && <button type="button" className="danger-link" disabled={busy} onClick={() => void cancel(item.id)}>Cancel request</button>}</article>) : <div className="dashboard-empty"><b>No withdrawal requests yet.</b><span>When eligible seller payouts are available, you can request them here.</span></div>}
    </div>
  </section>
}
