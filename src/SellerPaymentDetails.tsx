import { useEffect, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'

type Bank = { code: string; name: string }
type Account = { bank_code: string; bank_name: string; account_name: string; account_last4: string; status: string; verified_at: string }
export default function SellerPaymentDetails({ db, onVerified, required = false }: { db: SupabaseClient; onVerified: () => void; required?: boolean }) {
  const [banks, setBanks] = useState<Bank[]>([])
  const [bankCode, setBankCode] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [account, setAccount] = useState<Account | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true); setError('')
      const [bankResult, accountResult] = await Promise.all([
        db.functions.invoke('seller-payout-setup', { body: { action: 'banks' } }),
        db.functions.invoke('seller-payout-setup', { body: { action: 'get' } }),
      ])
      if (!active) return
      if (bankResult.error || bankResult.data?.error) setError(bankResult.data?.error || bankResult.error?.message || 'Could not load banks.')
      else setBanks(bankResult.data?.banks ?? [])
      if (accountResult.error || accountResult.data?.error) setError(current => current || accountResult.data?.error || accountResult.error?.message || 'Could not load payment details.')
      else if (accountResult.data?.account?.status === 'verified') {
        setAccount(accountResult.data.account as Account)
        setBankCode(accountResult.data.account.bank_code)
        onVerified()
      }
      setLoading(false)
    }
    void load()
    return () => { active = false }
  }, [db])

  async function save() {
    if (!/^\d{10}$/.test(accountNumber.replace(/\s/g, '')) || !bankCode) { setError('Enter a 10-digit account number and choose your bank.'); return }
    setSaving(true); setError(''); setNotice('')
    const selectedBank = banks.find(bank => bank.code === bankCode)
    const { data, error: invokeError } = await db.functions.invoke('seller-payout-setup', {
      body: { action: 'save', bank_code: bankCode, bank_name: selectedBank?.name, account_number: accountNumber.replace(/\s/g, '') },
    })
    if (invokeError || data?.error) setError(data?.error || invokeError?.message || 'Could not verify this account.')
    else {
      setAccount(data.account as Account)
      setAccountNumber('')
      setNotice('Your bank account has been verified and saved.')
      onVerified()
    }
    setSaving(false)
  }

  return <section className="seller-payment-settings">
    <div className="seller-payment-heading"><span className="eyebrow">SELLER PAYOUTS</span><span className={account?.status === 'verified' ? 'seller-payment-status verified' : 'seller-payment-status'}>{account?.status === 'verified' ? 'VERIFIED' : 'SETUP REQUIRED'}</span></div>
    <h3>{required ? 'Where should we send your earnings?' : 'Payment details.'}</h3>
    <p>{required ? 'Add the bank account you want to receive seller payouts into. Paystack will verify the account name before your shop is created.' : 'Your bank account is used only for seller payouts. Update it here if your details change.'}</p>
    {account && <div className="seller-payment-saved"><b>{account.account_name}</b><span>{account.bank_name} · •••• {account.account_last4}</span><small>Account verified {new Date(account.verified_at).toLocaleDateString('en-NG')}</small></div>}
    {loading ? <div className="seller-payment-loading">Loading secure bank options…</div> : <>
      <label>Bank<select value={bankCode} onChange={event => setBankCode(event.target.value)}><option value="">Choose your bank</option>{banks.map(bank => <option key={bank.code} value={bank.code}>{bank.name}</option>)}</select></label>
      <label>Account number<input value={accountNumber} onChange={event => setAccountNumber(event.target.value.replace(/[^0-9\s]/g, '').slice(0, 12))} inputMode="numeric" autoComplete="off" maxLength={12} placeholder="10-digit account number"/></label>
      <button type="button" className="seller-payment-save" onClick={() => void save()} disabled={saving || !bankCode || accountNumber.replace(/\s/g, '').length !== 10}>{saving ? 'Verifying account…' : account ? 'Verify new bank account' : 'Verify & save bank account'} <span>↗</span></button>
    </>}
    {error && <small className="seller-payment-error" role="alert">{error}</small>}
    {notice && <small className="seller-payment-notice" role="status">{notice}</small>}
    <small className="seller-payment-footnote">Your full account number is sent securely to Paystack for verification and is not stored in tradR. We keep only the verified recipient reference and last four digits. Saving bank details does not trigger an immediate payout.</small>
  </section>
}
