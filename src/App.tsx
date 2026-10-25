import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import AdminPanel from './AdminPanel'

const categories = [
  ['All finds', '✳'], ['Food & Drinks', '🥘'], ['Fashion & Thrift', '🧥'], ['Electronics', '🎧'],
  ['Beauty & Hair', '💅'], ['Books & Study Materials', '📚'], ['Tech Services', '💻'],
  ['Laundry & Cleaning', '🫧'], ['Accommodation', '🏡'], ['Other Services', '✦']
]
type Listing = { id: string; title: string; description: string; category: string; price_ngn: number; image_urls: string[]; created_at: string; vendor?: { id?: string; shop_name: string; whatsapp_number: string; logo_url?: string | null } | null }
type VendorProfile = { id: string; shop_name: string; bio: string; whatsapp_number: string; logo_url: string | null }
type ReportReason = 'non_delivery' | 'suspected_scam' | 'misleading_listing' | 'harassment' | 'other'
const allowedImageTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/avif']
const maxImageBytes = 5 * 1024 * 1024
function imageExtension(file: File) { return ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif' } as Record<string, string>)[file.type] || 'jpg' }
const images = [
  'photo-1595476108010-b4d1f102b1b1','photo-1543076447-215ad9ba6923','photo-1505740420928-5e560c06d30e',
  'photo-1473093295043-cdd812d0e601','photo-1455390582262-044cdead277a','photo-1542291026-7eec264c27ff',
  'photo-1534528741775-53994a69daeb','photo-1496181133206-80ce9b88a853'
]
const demoListings: Listing[] = ([
  ['Clean girl knotless braids','Beauty & Hair',12000,'Tomi Hair Studio','Neat, lightweight braids with a clean finish. Book your slot before the weekend.'],
  ['Vintage denim jacket','Fashion & Thrift',8500,'Second Story','A really good thrift find. Size M, great condition, ready for pickup on campus.'],
  ['Your new everyday headphones','Electronics',18500,'Plug Point LCU','Wireless headphones with a full sound and long battery life. Test before you buy.'],
  ['Late-night pasta bowl','Food & Drinks',4500,'The Hungry Student','Creamy pasta, grilled chicken and a little heat. Made fresh and delivered around campus.'],
  ['BIO 201 study pack','Books & Study Materials',2500,'Study Plug','Well-organised study notes and practice questions for revision season.'],
  ['Clean sneakers, no stress','Laundry & Cleaning',3000,'FreshStep Care','Deep clean for your favourite kicks. Drop off in the morning, collect same day.'],
  ['Portraits that feel like you','Other Services',10000,'Frame by Feyi','Natural-light portraits for birthdays, graduation shoots and your next profile picture.'],
  ['Laptop setup & quick fixes','Tech Services',5000,'Byte Buddy','Windows setup, software installs and laptop troubleshooting without the runaround.']
] as const).map((item, i) => ({ id: 'demo-' + i, title: item[0], category: item[1], price_ngn: item[2], vendor: { shop_name: item[3], whatsapp_number: '' }, description: item[4], image_urls: ['https://images.unsplash.com/' + images[i] + '?auto=format&fit=crop&w=900&q=80'], created_at: new Date(Date.now() - i * 100000).toISOString() }))

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined
const db = url && key ? createClient(url, key) : null
const schema = z.object({ title: z.string().trim().min(3).max(120), description: z.string().trim().min(10).max(3000), category: z.string().min(1), price_ngn: z.coerce.number().int().min(0).max(100000000000) })
const money = (n: number) => new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(n)
type Confirmation = { kind: 'success' | 'info' | 'error'; eyebrow: string; title: string; message: string; detail?: string; primaryLabel: string; action: 'dismiss' | 'shop'; secondaryLabel?: string }
type PaymentReturn = { txRef: string; state: 'checking' | 'pending' | 'succeeded' | 'failed' | 'cancelled' | 'error'; listingTitle?: string; expiresAt?: string; message?: string; checkoutCancelled?: boolean }

function Icon({ name, size = 19 }: { name: string; size?: number }) {
  const paths: Record<string, string> = {
    search: 'm20 20-4.4-4.4M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z',
    heart: 'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z',
    arrow: 'M5 12h14m-7-7 7 7-7 7', plus: 'M12 5v14m-7-7h14',
    pin: 'M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Zm-5 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
    close: 'M18 6 6 18M6 6l12 12', check: 'm5 12 4 4L19 6',
    message: 'M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z',
    sliders: 'M4 21v-7m0-4V3m8 18v-9m0-4V3m8 18v-5m0-4V3M2 14h4m4-6h4m4 8h4'
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name] ?? paths.arrow} /></svg>
}

export default function App() {
  const [category, setCategory] = useState('All finds')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('latest')
  const [favorites, setFavorites] = useState<string[]>([])
  const [authOpen, setAuthOpen] = useState(false)
  const [listingOpen, setListingOpen] = useState(false)
  const [vendorOnboardingOpen, setVendorOnboardingOpen] = useState(false)
  const [dashboardOpen, setDashboardOpen] = useState(false)
  const [adminOpen, setAdminOpen] = useState(false)
  const [myListings, setMyListings] = useState<Array<{ id: string; title: string; status: string; moderation_status: string; visible_until: string | null }>>([])
  const [vendorStatus, setVendorStatus] = useState<string | null>(null)
  const [vendorProfile, setVendorProfile] = useState<VendorProfile | null>(null)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreviewUrl, setLogoPreviewUrl] = useState('')
  const [logoBusy, setLogoBusy] = useState(false)
  const [listingFiles, setListingFiles] = useState<File[]>([])
  const [listingPreviewUrls, setListingPreviewUrls] = useState<string[]>([])
  const [reportTarget, setReportTarget] = useState<{ vendorId: string; vendorName: string; listingId?: string; listingTitle?: string } | null>(null)
  const [reportReason, setReportReason] = useState<ReportReason>('non_delivery')
  const [reportDetails, setReportDetails] = useState('')
  const [reportFiles, setReportFiles] = useState<File[]>([])
  const [reportPreviewUrls, setReportPreviewUrls] = useState<string[]>([])
  const [reportBusy, setReportBusy] = useState(false)
  const [paymentBusyId, setPaymentBusyId] = useState('')
  const [shopName, setShopName] = useState('')
  const [shopBio, setShopBio] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [selected, setSelected] = useState<Listing | null>(null)
  const [selectedImageIndex, setSelectedImageIndex] = useState(0)
  const [toast, setToast] = useState('')
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
  const [paymentReturn, setPaymentReturn] = useState<PaymentReturn | null>(null)
  const [paymentRetry, setPaymentRetry] = useState(0)
  const [authReady, setAuthReady] = useState(false)
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null)
  const [authMode, setAuthMode] = useState<'signup' | 'signin'>('signup')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authNotice, setAuthNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ title: '', description: '', category: '', price_ngn: '' })

  const query = useQuery({
    queryKey: ['listings'],
    queryFn: async () => {
      if (!db) return demoListings
      const { data, error } = await db.from('listings').select('id,title,description,category,price_ngn,image_urls,created_at,vendor:vendors(id,shop_name,whatsapp_number,logo_url)').eq('status', 'published').eq('moderation_status', 'approved').gt('visible_until', new Date().toISOString()).order('created_at', { ascending: false }).limit(24)
      if (error) throw error
      if (!data?.length && import.meta.env.DEV) return demoListings
      return (data ?? []) as unknown as Listing[]
    }
  })

  useEffect(() => {
    if (!db) { setAuthReady(true); return }
    db.auth.getSession().then(({ data }) => {
      const u = data.session?.user
      if (u) setUser({ id: u.id, email: u.email })
      setAuthReady(true)
    }).catch(() => setAuthReady(true))
    const { data } = db.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ? { id: session.user.id, email: session.user.email } : null)
      setAuthReady(true)
    })
    return () => data.subscription.unsubscribe()
  }, [])
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(''), 3200); return () => window.clearTimeout(timer) }, [toast])
  useEffect(() => {
    const urls = listingFiles.map(file => URL.createObjectURL(file))
    setListingPreviewUrls(urls)
    return () => urls.forEach(url => URL.revokeObjectURL(url))
  }, [listingFiles])
  useEffect(() => { setSelectedImageIndex(0) }, [selected?.id])
  useEffect(() => {
    if (!logoFile) { setLogoPreviewUrl(''); return }
    const preview = URL.createObjectURL(logoFile)
    setLogoPreviewUrl(preview)
    return () => URL.revokeObjectURL(preview)
  }, [logoFile])
  useEffect(() => {
    const urls = reportFiles.map(file => URL.createObjectURL(file))
    setReportPreviewUrls(urls)
    return () => urls.forEach(url => URL.revokeObjectURL(url))
  }, [reportFiles])
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('payment') !== 'return') return
    const txRef = params.get('tx_ref') ?? ''
    const providerStatus = (params.get('status') ?? '').toLowerCase()
    const cancelled = providerStatus === 'cancelled' || providerStatus === 'failed'
    setPaymentReturn({
      txRef,
      state: txRef ? 'checking' : 'error',
      checkoutCancelled: cancelled,
      message: !txRef ? 'We could not find a payment reference in the checkout return.' : cancelled ? 'Checkout returned as cancelled. We are still checking the server record in case a payment was completed.' : undefined,
    })
    window.history.replaceState({}, '', window.location.pathname + window.location.hash)
  }, [])
  useEffect(() => {
    if (!paymentReturn || !authReady || !paymentReturn.txRef) return
    let cancelled = false
    const txRef = paymentReturn.txRef
    const wait = (ms: number) => new Promise(resolve => window.setTimeout(resolve, ms))
    async function checkPayment() {
      if (!user) {
        setPaymentReturn(current => current ? { ...current, state: 'error', message: 'Sign in with the same account you used to start checkout, then check this payment again.' } : current)
        return
      }
      if (!db) {
        setPaymentReturn(current => current ? { ...current, state: 'error', message: 'Payment status is unavailable because the marketplace is not connected.' } : current)
        return
      }
      setPaymentReturn(current => current ? { ...current, state: 'checking', message: undefined } : current)
      for (let attempt = 0; attempt < 6; attempt++) {
        const { data, error } = await db.functions.invoke('payment-status', { body: { tx_ref: txRef } })
        if (cancelled) return
        if (error || data?.error) {
          setPaymentReturn(current => current ? { ...current, state: 'error', message: data?.error || 'We could not check payment status. Please try again.' } : current)
          return
        }
        if (data?.status === 'succeeded') {
          setPaymentReturn(current => current ? { ...current, state: 'succeeded', listingTitle: data.listing_title, expiresAt: data.expires_at, message: undefined } : current)
          return
        }
        if (data?.status === 'failed') {
          setPaymentReturn(current => current ? { ...current, state: 'failed', listingTitle: data.listing_title, message: 'The payment was not completed successfully. You can return to My shop and try again.' } : current)
          return
        }
        setPaymentReturn(current => current ? { ...current, state: 'pending', listingTitle: data?.listing_title, message: 'We have not received final confirmation yet. We are checking again automatically.' } : current)
        if (attempt < 5) await wait(1800)
      }
      if (!cancelled) setPaymentReturn(current => current ? { ...current, state: current.checkoutCancelled ? 'cancelled' : 'pending', message: current.checkoutCancelled ? 'We have not verified a payment for this checkout. If you completed payment despite the cancellation message, check again before trying to pay again.' : 'Your payment is still being confirmed by the payment provider. You do not need to pay again yet. Check again shortly or open My shop to review the status.' } : current)
    }
    void checkPayment()
    return () => { cancelled = true }
  }, [paymentReturn?.txRef, authReady, user?.id, paymentRetry])

  const listings = useMemo(() => {
    const term = search.toLowerCase().trim()
    return [...(query.data ?? [])].filter((l) => (category === 'All finds' || l.category === category) && (!term || [l.title, l.description, l.category, l.vendor?.shop_name ?? ''].some((v) => v.toLowerCase().includes(term))))
      .sort((a, b) => sort === 'price-low' ? a.price_ngn - b.price_ngn : sort === 'price-high' ? b.price_ngn - a.price_ngn : Date.parse(b.created_at) - Date.parse(a.created_at))
  }, [query.data, search, category, sort])

  async function authSubmit(e: FormEvent) {
    e.preventDefault()
    if (!db) { setToast('Supabase is not configured yet.'); return }
    setBusy(true)
    try {
      if (authMode === 'signup') {
        const { data, error } = await db.auth.signUp({ email, password, options: { data: { display_name: name.trim() } } })
        if (error) throw error
        if (data.session) {
          setAuthOpen(false)
          setConfirmation({ kind: 'success', eyebrow: 'ACCOUNT READY', title: 'You’re in.', message: 'Your tradR account has been created. You can explore the marketplace or start setting up your shop.', primaryLabel: 'Explore tradR', action: 'dismiss' })
        } else {
          setAuthOpen(false)
          setPassword('')
          setConfirmation({ kind: 'info', eyebrow: 'CHECK YOUR INBOX', title: 'One last step.', message: 'Your signup was received. Open the confirmation email we sent you, then come back and log in. If it does not arrive, check your spam folder.', primaryLabel: 'Back to tradR', action: 'dismiss' })
        }
      } else {
        const { error } = await db.auth.signInWithPassword({ email, password })
        if (error) throw error
        setAuthOpen(false)
        setConfirmation({ kind: 'success', eyebrow: 'SIGNED IN', title: 'Welcome back.', message: 'You’re signed in and ready to continue where you left off.', primaryLabel: 'Continue to tradR', action: 'dismiss' })
      }
    } catch (err) { setAuthNotice(err instanceof Error ? err.message : 'Could not complete authentication. Please try again.') } finally { setBusy(false) }
  }

  async function uploadPublicImage(file: File, folder: string) {
    if (!db || !user) throw new Error('Sign in before uploading images.')
    const path = `${user.id}/${folder}/${crypto.randomUUID()}.${imageExtension(file)}`
    const { error } = await db.storage.from('listing-images').upload(path, file, { cacheControl: '3600', upsert: false, contentType: file.type })
    if (error) throw error
    return { path, url: db.storage.from('listing-images').getPublicUrl(path).data.publicUrl }
  }

  function validateImageFiles(files: File[], maxCount: number, label: string) {
    if (files.length > maxCount) { setToast(`Choose up to ${maxCount} ${label}.`); return false }
    const invalid = files.find(file => !allowedImageTypes.includes(file.type) || file.size > maxImageBytes)
    if (invalid) { setToast('Use JPG, PNG, WEBP or AVIF images up to 5 MB each.'); return false }
    return true
  }

  function beginReport(listing: Listing) {
    setSelected(null)
    if (!user) {
      setAuthMode('signin')
      setAuthOpen(true)
      setToast('Sign in to report a seller and attach evidence.')
      return
    }
    if (!listing.vendor?.id || listing.id.startsWith('demo-')) {
      setToast('Reports are available for live seller listings only.')
      return
    }
    setReportTarget({ vendorId: listing.vendor.id, vendorName: listing.vendor.shop_name, listingId: listing.id, listingTitle: listing.title })
    setReportReason('non_delivery')
    setReportDetails('')
    setReportFiles([])
  }

  async function submitSellerReport(e: FormEvent) {
    e.preventDefault()
    if (!db || !user || !reportTarget) { setToast('Sign in to submit a report.'); return }
    if (reportDetails.trim().length < 20) { setToast('Please explain what happened in at least 20 characters.'); return }
    if (!validateImageFiles(reportFiles, 5, 'evidence images')) return
    setReportBusy(true)
    const uploadedPaths: string[] = []
    try {
      const evidencePaths: string[] = []
      for (const file of reportFiles) {
        const path = `${user.id}/${crypto.randomUUID()}.${imageExtension(file)}`
        const { error } = await db.storage.from('report-evidence').upload(path, file, { cacheControl: '3600', upsert: false, contentType: file.type })
        if (error) throw error
        uploadedPaths.push(path)
        evidencePaths.push(path)
      }
      const { data, error } = await db.from('seller_reports').insert({
        reporter_id: user.id,
        vendor_id: reportTarget.vendorId,
        listing_id: reportTarget.listingId ?? null,
        reason: reportReason,
        details: reportDetails.trim(),
        evidence_paths: evidencePaths,
      }).select('id').single()
      if (error) throw error
      setReportTarget(null)
      setReportFiles([])
      setReportDetails('')
      setConfirmation({ kind: 'success', eyebrow: 'REPORT RECEIVED', title: 'Thanks for speaking up.', message: 'Your report has been recorded for review. Keep any original chats, receipts and delivery details in case more information is needed.', detail: `Report reference ${data.id.slice(0, 8).toUpperCase()}`, primaryLabel: 'Back to marketplace', action: 'dismiss' })
    } catch (err) {
      if (uploadedPaths.length) await db.storage.from('report-evidence').remove(uploadedPaths)
      setToast(err instanceof Error ? err.message : 'Could not submit your report. Please try again.')
    } finally { setReportBusy(false) }
  }

  async function saveVendorLogo() {
    if (!db || !user || !vendorProfile || !logoFile) return
    if (!validateImageFiles([logoFile], 1, 'shop logo')) return
    setLogoBusy(true)
    let uploadedPath = ''
    try {
      const uploaded = await uploadPublicImage(logoFile, 'shop-logo')
      uploadedPath = uploaded.path
      const { error } = await db.from('vendors').update({ logo_url: uploaded.url }).eq('id', vendorProfile.id)
      if (error) throw error
      setVendorProfile({ ...vendorProfile, logo_url: uploaded.url })
      setLogoFile(null)
      setToast('Shop picture or logo updated.')
      await query.refetch()
    } catch (err) {
      if (uploadedPath) await db.storage.from('listing-images').remove([uploadedPath])
      setToast(err instanceof Error ? err.message : 'Could not update shop logo.')
    } finally { setLogoBusy(false) }
  }

  async function createListing(e: FormEvent) {
    e.preventDefault()
    const parsed = schema.safeParse({ ...form, price_ngn: form.price_ngn })
    if (!parsed.success) { setToast(parsed.error.issues[0]?.message ?? 'Check your listing details.'); return }
    if (!db || !user) { setListingOpen(false); setAuthOpen(true); setToast('Sign in first to create a listing.'); return }
    if (!validateImageFiles(listingFiles, 4, 'listing images')) return
    setBusy(true)
    const uploadedPaths: string[] = []
    try {
      const { data: vendor, error: vendorError } = await db.from('vendors').select('id').eq('profile_id', user.id).maybeSingle()
      if (vendorError) throw vendorError
      if (!vendor) { setListingOpen(false); setVendorOnboardingOpen(true); return }
      const { count: existingListingCount, error: countError } = await db.from('listings').select('id', { count: 'exact', head: true }).eq('vendor_id', vendor.id)
      if (countError) throw countError
      if ((existingListingCount ?? 0) >= 5) {
        setToast('Each shop can have up to 5 listings. Please contact tradR support if you need help managing your shop.')
        return
      }
      const imageUrls: string[] = []
      for (const file of listingFiles) {
        const uploaded = await uploadPublicImage(file, 'listings')
        uploadedPaths.push(uploaded.path)
        imageUrls.push(uploaded.url)
      }
      const { error } = await db.from('listings').insert({ ...parsed.data, vendor_id: vendor.id, status: 'draft', image_urls: imageUrls })
      if (error) throw error
      setListingOpen(false)
      setForm({ title: '', description: '', category: '', price_ngn: '' })
      setListingFiles([])
      setConfirmation({ kind: 'success', eyebrow: 'DRAFT SAVED', title: 'It’s in your shop.', message: 'Your listing and photos have been saved as a draft. It stays private until your shop and listing are approved and you activate it with the ₦500 / 30-day subscription.', primaryLabel: 'Open My shop', action: 'shop' })
      await query.refetch()
    } catch (err) {
      if (uploadedPaths.length) await db.storage.from('listing-images').remove(uploadedPaths)
      setToast(err instanceof Error ? err.message : 'Could not save listing.')
    } finally { setBusy(false) }
  }

  async function openDashboard() {
    if (!db || !user) { setAuthOpen(true); return }
    setBusy(true)
    try {
      const { data: vendor, error: vendorError } = await db.from('vendors').select('id,verification_status,shop_name,bio,whatsapp_number,logo_url').eq('profile_id', user.id).maybeSingle()
      if (vendorError) throw vendorError
      if (!vendor) { setVendorOnboardingOpen(true); setToast('Set up your shop first.'); return }
      setVendorStatus(vendor.verification_status)
      setVendorProfile(vendor as VendorProfile)
      const { data, error } = await db.from('listings').select('id,title,status,moderation_status,visible_until').eq('vendor_id', vendor.id).order('created_at', { ascending: false })
      if (error) throw error
      setMyListings(data ?? [])
      setDashboardOpen(true)
    } catch (err) { setToast(err instanceof Error ? err.message : 'Could not load your shop.') } finally { setBusy(false) }
  }

  async function startListingPayment(listingId: string) {
    if (!db || !user) { setAuthOpen(true); return }
    setPaymentBusyId(listingId)
    try {
      const { data, error } = await db.functions.invoke('start-listing-payment', { body: { listing_id: listingId } })
      if (error) throw error
      if (typeof data?.checkout_url !== 'string') throw new Error(data?.error || 'Payment checkout is not available yet.')
      window.location.assign(data.checkout_url)
    } catch (err) {
      setConfirmation({ kind: 'error', eyebrow: 'CHECKOUT NOT STARTED', title: 'Payment didn’t start.', message: (err instanceof Error ? err.message : 'We could not start checkout.') + ' No successful payment has been confirmed. You can return to My shop and try again.', primaryLabel: 'Return to My shop', action: 'shop', secondaryLabel: 'Back to marketplace' })
    } finally { setPaymentBusyId('') }
  }

  const img = (l: Listing) => l.image_urls?.[0] || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=900&q=80'
  const closeModal = () => { setAuthOpen(false); setListingOpen(false); setVendorOnboardingOpen(false); setSelected(null) }

  async function createVendor(e: FormEvent) {
    e.preventDefault()
    if (!db || !user) { setVendorOnboardingOpen(false); setAuthOpen(true); return }
    const digits = whatsapp.replace(/\D/g, '')
    const normalized = digits.startsWith('234') ? digits : digits.startsWith('0') ? '234' + digits.slice(1) : '234' + digits
    if (!/^234[0-9]{10}$/.test(normalized)) { setToast('Enter a valid Nigerian number, e.g. 08012345678.'); return }
    if (shopName.trim().length < 2) { setToast('Your shop name needs at least 2 characters.'); return }
    if (logoFile && !validateImageFiles([logoFile], 1, 'shop logo')) return
    setBusy(true)
    let uploadedLogoPath = ''
    try {
      const { data: profile } = await db.from('profiles').select('id').eq('id', user.id).maybeSingle()
      if (!profile) {
        const { error: profileError } = await db.from('profiles').insert({ id: user.id, display_name: name.trim() || email.split('@')[0] || 'LCU Student' })
        if (profileError) throw profileError
      }
      const uploadedLogo = logoFile ? await uploadPublicImage(logoFile, 'shop-logo') : null
      uploadedLogoPath = uploadedLogo?.path ?? ''
      const { error } = await db.from('vendors').insert({ profile_id: user.id, shop_name: shopName.trim(), bio: shopBio.trim(), whatsapp_number: normalized, logo_url: uploadedLogo?.url ?? null })
      if (error) throw error
      setVendorOnboardingOpen(false)
      setLogoFile(null)
      setConfirmation({ kind: 'info', eyebrow: 'SHOP SUBMITTED', title: 'We’ve got your details.', message: 'Your shop profile and branding are saved and waiting for admin review. You can prepare drafts while it is being reviewed, but listings will not go live until approval and payment activation are complete.', primaryLabel: 'Open My shop', action: 'shop' })
    } catch (err) {
      if (uploadedLogoPath) await db.storage.from('listing-images').remove([uploadedLogoPath])
      setToast(err instanceof Error ? err.message : 'Could not create your shop profile.')
    } finally { setBusy(false) }
  }

  return <div className="app-shell">
    <div className="announcement"><span className="announcement-dot" /> YOUR CAMPUS, YOUR COMMUNITY. <span>Made for LCU students.</span><b>↗</b></div>
    <header className="site-header">
      <a className="brand" href="#" onClick={() => { setCategory('All finds'); setSearch('') }}><span className="brand-mark">t<span>.</span></span><span className="brand-word">tradR<span>.</span></span></a>
      <div className="header-location"><Icon name="pin" size={17}/><span><b>Lead City University</b><small>Ibadan, Nigeria</small></span><span className="chevron">⌄</span></div>
      <label className="header-search"><Icon name="search" size={18}/><input placeholder="Find anything on campus..." value={search} onChange={e => setSearch(e.target.value)} aria-label="Search marketplace"/><kbd>⌘ K</kbd></label>
      <nav className="header-actions"><button className="nav-link" onClick={() => document.getElementById('marketplace')?.scrollIntoView({ behavior: 'smooth' })}>Explore</button><button className="nav-link" onClick={() => setToast(favorites.length ? favorites.length + ' finds saved.' : 'Tap a heart to save a find.')}>Saved <sup>{favorites.length || ''}</sup></button>{user ? <><button className="nav-link" onClick={() => void openDashboard()}>My shop</button><button className="nav-link" onClick={() => setAdminOpen(true)}>Admin</button><button className="login-button" onClick={async () => { await db?.auth.signOut(); setUser(null); setToast('Signed out.') }}>{(user.email?.[0] ?? 'U').toUpperCase()} · Sign out</button></> : <button className="login-button" onClick={() => { setAuthMode('signin'); setAuthOpen(true) }}>Log in</button>}<button className="sell-button" onClick={() => user ? setListingOpen(true) : setAuthOpen(true)}><Icon name="plus" size={17}/> Sell something</button></nav>
    </header>

    <main>
      <section className="hero">
        <div className="hero-copy"><div className="eyebrow"><span>✳</span> THE LCU MARKETPLACE</div><h1>Good finds.<br/>Great <em>people.</em></h1><p className="hero-subtitle">From your next favourite fit to that person who fixes everything. Find it right here on campus.</p>
          <label className="hero-search"><Icon name="search" size={20}/><input placeholder="What are you looking for?" value={search} onChange={e => setSearch(e.target.value)} aria-label="Search listings"/><button onClick={() => document.getElementById('marketplace')?.scrollIntoView({ behavior: 'smooth' })}>Find it <Icon name="arrow" size={17}/></button></label>
          <div className="hero-footnote"><span className="avatar-stack"><i>O</i><i>T</i><i>A</i><i>+</i></span><span><b>LCU people,</b> real deals.</span><span className="footnote-divider"/><span className="trust-stars">★★★★★</span><span>Built for campus life</span></div>
        </div>
        <div className="hero-art"><div className="hero-art-bg"/><div className="hero-sticker">THE GOOD<br/>STUFF IS<br/><b>CLOSE BY.</b><span>↘</span></div><div className="hero-photo hero-photo-main"><img src="https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=1000&q=85" alt="Streetwear style inspiration"/><span className="photo-label">STYLE FINDS <b>↗</b></span></div><div className="hero-photo hero-photo-small"><img src="https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=600&q=85" alt="Coffee on a table"/></div><div className="hero-floating-card"><span>✳</span><div><b>Something good</b><small>is always nearby</small></div><strong>↗</strong></div><div className="hero-art-caption">YOUR CAMPUS. YOUR PEOPLE. YOUR MARKET.</div></div>
        <div className="hero-bottomline"><span>01 / THE CAMPUS EDIT</span><i/><span>SCROLL TO EXPLORE ↓</span></div>
      </section>

      <section className="category-section"><div className="section-topline"><span>YOUR NEXT FIND IS IN HERE</span><span>01 — 09</span></div><div className="category-row">{categories.map(([label, emoji]) => <button key={label} className={category === label ? 'category-pill active' : 'category-pill'} onClick={() => { setCategory(label); document.getElementById('marketplace')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }}><span>{emoji}</span>{label}</button>)}</div></section>

      <section className="marketplace-section" id="marketplace"><div className="marketplace-heading"><div><div className="eyebrow"><span>✳</span> THE MARKETPLACE</div><h2>Good stuff, <em>found.</em></h2><p>The things you need, from people just around the corner.</p></div><button className="outline-button" onClick={() => { setCategory('All finds'); setSearch(''); setSort('latest') }}>See everything <Icon name="arrow" size={17}/></button></div>
        <div className="market-toolbar"><div className="results-count"><span/> {query.isLoading ? 'Finding your next thing…' : listings.length + ' finds to fall for'} <i>/ at Lead City</i></div><div className="toolbar-actions"><label htmlFor="sort">Sort by</label><select id="sort" value={sort} onChange={e => setSort(e.target.value)}><option value="latest">Latest finds</option><option value="price-low">Price: low to high</option><option value="price-high">Price: high to low</option></select><button className="filter-button" onClick={() => setToast('Choose a category above to narrow your finds.')}><Icon name="sliders" size={17}/> Filters</button></div></div>
        {query.isError && <div className="inline-notice">We couldn’t reach the live marketplace. <button onClick={() => query.refetch()}>Try again</button></div>}
        {query.isLoading ? <div className="listing-grid">{[1,2,3,4].map(n => <div className="skeleton-card" key={n}><div/><span/><span/></div>)}</div> : listings.length ? <div className="listing-grid">{listings.map((l, i) => <article className="listing-card" key={l.id}><button className="listing-image-button" onClick={() => setSelected(l)} aria-label={'View ' + l.title}><img className="listing-image" src={img(l)} alt={l.title} loading={i > 3 ? 'lazy' : 'eager'}/>{i === 0 && <span className="listing-badge">{l.id.startsWith('demo-') ? 'PREVIEW SAMPLE' : 'CAMPUS FAVOURITE'}</span>}<span className="image-open"><Icon name="arrow"/></span></button><button className={favorites.includes(l.id) ? 'favorite-button is-favorite' : 'favorite-button'} onClick={() => setFavorites(old => old.includes(l.id) ? old.filter(x => x !== l.id) : [...old, l.id])} aria-label="Save listing"><Icon name="heart"/></button><div className="listing-meta"><span>{l.category}</span><b>✳</b></div><button className="listing-title" onClick={() => setSelected(l)}>{l.title}</button><div className="listing-vendor"><span className="vendor-avatar">{l.vendor?.logo_url ? <img src={l.vendor.logo_url} alt=""/> : (l.vendor?.shop_name?.[0] ?? 'L').toUpperCase()}</span><span>{l.vendor?.shop_name ?? 'LCU seller'}</span><i>·</i><span>LCU</span></div><div className="listing-bottom"><strong>{money(Number(l.price_ngn))}</strong><button onClick={() => setSelected(l)} aria-label="Listing details"><Icon name="arrow"/></button></div></article>)}</div> : <div className="empty-state"><span className="empty-icon"><Icon name="search" size={25}/></span><h3>No finds just yet.</h3><p>Try another search or category. Your next favourite thing is out there.</p><button className="outline-button" onClick={() => { setSearch(''); setCategory('All finds') }}>Clear filters</button></div>}
        <div className="marketplace-end"><span>THAT'S THE CAMPUS EDIT, FOR NOW.</span><b>✳</b><span>MORE GOOD THINGS COMING.</span></div>
      </section>

      <section className="seller-banner"><div className="seller-banner-mark">t<span>.</span></div><div className="seller-banner-copy"><span className="eyebrow">GOT SOMETHING GOOD?</span><h2>Your side hustle<br/>looks good <em>here.</em></h2><p>Put your product or service in front of the people who need it. Your next customer might be two blocks away.</p><button onClick={() => user ? setListingOpen(true) : setAuthOpen(true)}>Start selling <Icon name="arrow" size={17}/></button></div><div className="seller-banner-art"><div className="seller-circle circle-one"/><div className="seller-circle circle-two"/><div className="seller-note note-one">YOUR<br/>THING.</div><div className="seller-note note-two">YOUR<br/>PEOPLE. <span>↗</span></div><div className="seller-banner-grid"/></div><div className="seller-banner-foot"><span>MADE FOR THE MAKERS.</span><span>LCU / IBADAN / NIGERIA</span></div></section>
      <section className="trust-strip"><div><span className="trust-icon">↗</span><span><b>Real campus connections</b><small>Find people who are right here.</small></span></div><div><span className="trust-icon">♡</span><span><b>Keep it direct</b><small>Talk to sellers on WhatsApp.</small></span></div><div><span className="trust-icon trust-lcu-icon"><img src="/assets/lead-city-university-logo.png" alt="Lead City University logo" /></span><span><b>Made for LCU</b><small>Your campus community, in one place.</small></span></div></section>
    </main>

    <footer className="site-footer"><a className="brand" href="#"><span className="brand-mark">t<span>.</span></span><span className="brand-word">tradR<span>.</span></span></a><span className="footer-note">GOOD FINDS TRAVEL FAST.</span><span className="footer-copy">© 2026 tradR.</span><span className="footer-made-for"><span>Made for</span><img src="/assets/lead-city-university-logo.png" alt="Lead City University" /></span><button onClick={() => setToast('For safety concerns, please contact the tradR admin team.')}>Safety & support ↗</button></footer>
    <nav className="mobile-bottom-nav"><button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}><span>⌂</span>Home</button><button onClick={() => document.getElementById('marketplace')?.scrollIntoView({ behavior: 'smooth' })}><Icon name="search"/>Explore</button><button onClick={() => setToast(favorites.length ? favorites.length + ' saved finds.' : 'Tap a heart to save a find.')}><Icon name="heart"/>Saved</button>{user ? <button onClick={() => void openDashboard()}><Icon name="plus"/>My shop</button> : <button onClick={() => setAuthOpen(true)}><Icon name="plus"/>Sell</button>}</nav>

    {selected && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setSelected(null) }}><section className="detail-modal" role="dialog" aria-modal="true" aria-label="Listing details"><button className="modal-close" onClick={() => setSelected(null)} aria-label="Close"><Icon name="close"/></button><div className="detail-gallery"><img className="detail-image" src={selected.image_urls?.[selectedImageIndex] || img(selected)} alt={selected.title + (selected.image_urls?.length > 1 ? `, photo ${selectedImageIndex + 1}` : '')}/>{(selected.image_urls?.length ?? 0) > 1 && <div className="detail-thumbnails" aria-label="More listing photos">{selected.image_urls.map((url, index) => <button key={url} type="button" className={selectedImageIndex === index ? 'detail-thumbnail active' : 'detail-thumbnail'} onClick={() => setSelectedImageIndex(index)} aria-label={`Show photo ${index + 1}`} aria-pressed={selectedImageIndex === index}><img src={url} alt=""/></button>)}</div>}</div><div className="detail-content"><span className="detail-category">{selected.category}</span><h2>{selected.title}</h2><strong className="detail-price">{money(Number(selected.price_ngn))}</strong><p>{selected.description}</p><div className="detail-seller"><span className="vendor-avatar large">{selected.vendor?.logo_url ? <img src={selected.vendor.logo_url} alt=""/> : (selected.vendor?.shop_name?.[0] ?? 'L').toUpperCase()}</span><span><b>{selected.vendor?.shop_name ?? 'LCU seller'}</b><small>Lead City University · Ibadan</small></span></div><button className="whatsapp-button" onClick={() => { const phone = selected.vendor?.whatsapp_number; if (!phone) { setToast('Seller contact is not available yet.'); return } window.open('https://wa.me/' + phone + '?text=' + encodeURIComponent('Hi! I found "' + selected.title + '" on tradR. Is it still available?'), '_blank', 'noopener,noreferrer') }}><Icon name="message"/> Chat with seller on WhatsApp <Icon name="arrow"/></button><small className="direct-note">You’ll connect directly with the seller. Always meet safely on campus.</small><button className="report-seller-button" onClick={() => beginReport(selected)}>Report this seller <Icon name="arrow" size={15}/></button></div></section></div>}

    {authOpen && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) closeModal() }}><section className="form-modal" role="dialog" aria-modal="true" aria-labelledby="auth-heading"><button className="modal-close" onClick={closeModal} aria-label="Close"><Icon name="close"/></button><div className="modal-brand-mark">t<span>.</span></div><span className="eyebrow">COME ON IN</span><h2 id="auth-heading">{authMode === 'signup' ? 'Your people are here.' : 'Good to have you back.'}</h2><p>{authMode === 'signup' ? 'Make an account and get closer to the good stuff.' : 'Sign in to pick up where you left off.'}</p>{authNotice && <div className="auth-notice" role="status">{authNotice}</div>}<form onSubmit={authSubmit}>{authMode === 'signup' && <label>Your name<input value={name} onChange={e => setName(e.target.value)} required minLength={2} placeholder="What should we call you?"/></label>}<label>Email address<input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="you@example.com" autoComplete="email"/></label><label>Password<input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} placeholder="At least 8 characters" autoComplete={authMode === 'signup' ? 'new-password' : 'current-password'}/></label><button className="modal-primary" disabled={busy}>{busy ? 'One sec…' : authMode === 'signup' ? 'Create my account' : 'Log in'} <Icon name="arrow"/></button></form><div className="modal-switch">{authMode === 'signup' ? 'Already part of the crew?' : 'New around here?'} <button onClick={() => { setAuthMode(authMode === 'signup' ? 'signin' : 'signup'); setAuthNotice(''); setPassword('') }}>{authMode === 'signup' ? 'Log in' : 'Create an account'}</button></div><small className="form-footnote">Use tradR responsibly and treat fellow students with respect.</small></section></div>}

    {vendorOnboardingOpen && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setVendorOnboardingOpen(false) }}><section className="form-modal" role="dialog" aria-modal="true" aria-labelledby="vendor-heading"><button className="modal-close" onClick={closeModal} aria-label="Close"><Icon name="close"/></button><div className="modal-brand-mark">t<span>.</span></div><span className="eyebrow">YOUR LITTLE CORNER OF LCU</span><h2 id="vendor-heading">Set up your shop.</h2><p>Give campus buyers a name and a way to reach you. Your shop needs approval before listings go live.</p><form onSubmit={createVendor}><label>Shop or service name<input value={shopName} onChange={e => setShopName(e.target.value)} required minLength={2} maxLength={100} placeholder="e.g. Tomi Hair Studio"/></label><label>WhatsApp number<input type="tel" value={whatsapp} onChange={e => setWhatsapp(e.target.value)} required placeholder="08012345678"/><small className="field-hint">Only shared with buyers through your listing.</small></label><label>Short bio (optional)<textarea value={shopBio} onChange={e => setShopBio(e.target.value)} maxLength={600} rows={3} placeholder="What do you sell or help people with?"/></label><label>Shop picture or logo (optional)<input type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={e => { const files = Array.from(e.target.files ?? []); if (validateImageFiles(files, 1, 'shop logo')) setLogoFile(files[0] ?? null); e.currentTarget.value = '' }}/><small className="field-hint">JPG, PNG, WEBP or AVIF. Maximum 5 MB.</small>{logoPreviewUrl && <img className="upload-logo-preview" src={logoPreviewUrl} alt="Shop logo preview"/>}</label><button className="modal-primary" disabled={busy}>{busy ? 'Setting up…' : 'Create my shop'} <Icon name="arrow"/></button></form><small className="form-footnote">Your shop starts as pending review. We never fake payment or approval status.</small></section></div>}

    {dashboardOpen && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setDashboardOpen(false) }}><section className="form-modal dashboard-modal" role="dialog" aria-modal="true" aria-labelledby="dashboard-heading"><button className="modal-close" onClick={() => setDashboardOpen(false)} aria-label="Close"><Icon name="close"/></button><div className="modal-brand-mark">t<span>.</span></div><span className="eyebrow">YOUR CAMPUS BUSINESS</span><h2 id="dashboard-heading">Your shop.</h2><p>{vendorStatus === 'approved' ? 'Manage your listings and activate approved ones for ₦500 per 30 days.' : 'Your shop is waiting for admin approval. You can prepare drafts while we review it.'}</p><div className="listing-limit-notice"><b>{myListings.length} of 5 listings used</b><span>{myListings.length >= 5 ? 'You have reached your shop limit. Existing listings can still be managed.' : `${5 - myListings.length} listing slot${5 - myListings.length === 1 ? '' : 's'} remaining on your shop.`}</span>{myListings.length < 5 && <button type="button" onClick={() => { setDashboardOpen(false); setListingOpen(true) }}>Create a listing <Icon name="arrow" size={15}/></button>}</div><div className="shop-branding-editor"><div className="shop-branding-current"><span className="vendor-avatar large">{vendorProfile?.logo_url ? <img src={vendorProfile.logo_url} alt="Current shop picture"/> : (vendorProfile?.shop_name?.[0] ?? 'S').toUpperCase()}</span><div><b>{vendorProfile?.shop_name}</b><small>Shop picture or logo</small></div></div><label>Change shop picture or logo<input type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={e => { const files = Array.from(e.target.files ?? []); if (validateImageFiles(files, 1, 'shop logo')) setLogoFile(files[0] ?? null); e.currentTarget.value = '' }}/><small className="field-hint">JPG, PNG, WEBP or AVIF, maximum 5 MB.</small></label>{logoPreviewUrl && <img className="upload-logo-preview" src={logoPreviewUrl} alt="New shop picture preview"/>}{logoFile && <button className="modal-primary" type="button" disabled={logoBusy} onClick={() => void saveVendorLogo()}>{logoBusy ? 'Uploading…' : 'Save shop picture'} <Icon name="arrow"/></button>}</div>{myListings.length ? <div className="dashboard-list">{myListings.map(item => { const active = item.status === 'published' && item.visible_until && Date.parse(item.visible_until) > Date.now(); const ready = item.moderation_status === 'approved' && vendorStatus === 'approved'; return <div className="dashboard-list-item" key={item.id}><div className="dashboard-list-copy"><b>{item.title}</b><small>{active ? 'Active until ' + new Date(item.visible_until as string).toLocaleDateString('en-NG') : item.moderation_status === 'approved' ? 'Approved · ready for subscription' : 'Awaiting listing review'}</small></div>{active ? <span className="dashboard-status">ACTIVE</span> : ready ? <button className="dashboard-pay-button" disabled={paymentBusyId === item.id} onClick={() => void startListingPayment(item.id)}>{paymentBusyId === item.id ? 'Opening…' : 'Pay ₦500'} <Icon name="arrow" size={15}/></button> : <span className="dashboard-status pending">IN REVIEW</span>}</div> })}</div> : <div className="dashboard-empty"><b>No listings yet.</b><span>Start with a draft, then pay once it passes review.</span><button className="modal-primary" onClick={() => { setDashboardOpen(false); setListingOpen(true) }}>Create a listing <Icon name="arrow"/></button></div>}<small className="form-footnote">Payments are verified by Flutterwave on the server. A redirect alone never activates a listing.</small></section></div>}

    {listingOpen && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setListingOpen(false) }}><section className="form-modal listing-form-modal" role="dialog" aria-modal="true" aria-labelledby="listing-heading"><button className="modal-close" onClick={closeModal} aria-label="Close"><Icon name="close"/></button><div className="modal-brand-mark">t<span>.</span></div><span className="eyebrow">PUT IT OUT THERE</span><h2 id="listing-heading">List something good.</h2><p>Save your details first. Your listing stays private until your shop and listing are approved and you activate it for ₦500 per 30 days.</p><form onSubmit={createListing}><label>What are you offering?<input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} required minLength={3} maxLength={120} placeholder="e.g. Freshly baked brownies"/></label><label>Category<select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} required><option value="">Choose a category</option>{categories.slice(1).map(([c]) => <option key={c} value={c}>{c}</option>)}</select></label><label>Price in naira<input type="number" min="0" value={form.price_ngn} onChange={e => setForm({ ...form, price_ngn: e.target.value })} required placeholder="e.g. 5000"/></label><label>Tell us a little more<textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} required minLength={10} maxLength={3000} rows={3} placeholder="What should a buyer know?"/></label><label>Product photos (up to 4)<input type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple onChange={e => { const files = Array.from(e.target.files ?? []); if (validateImageFiles(files, 4, 'listing images')) setListingFiles(files); e.currentTarget.value = '' }}/><small className="field-hint">JPG, PNG, WEBP or AVIF. Up to 4 images, 5 MB each. Clear photos with the remove buttons before saving if you change your mind.</small></label>{listingPreviewUrls.length > 0 && <div className="upload-preview-grid">{listingPreviewUrls.map((url, index) => <div className="upload-preview-item" key={url}><img src={url} alt={`Listing photo ${index + 1} preview`}/><button type="button" onClick={() => setListingFiles(files => files.filter((_, fileIndex) => fileIndex !== index))} aria-label={`Remove photo ${index + 1}`}><Icon name="close" size={14}/></button></div>)}</div>}<button className="modal-primary" disabled={busy}>{busy ? 'Saving…' : 'Save listing'} <Icon name="arrow"/></button></form><small className="form-footnote">You can find your saved draft in My shop. It will not appear in the marketplace until approval and subscription activation are complete.</small></section></div>}
    {adminOpen && db && <AdminPanel db={db} onClose={() => setAdminOpen(false)} />}
    {reportTarget && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget && !reportBusy) setReportTarget(null) }}><section className="form-modal report-form-modal" role="dialog" aria-modal="true" aria-labelledby="report-heading"><button className="modal-close" onClick={() => !reportBusy && setReportTarget(null)} aria-label="Close"><Icon name="close"/></button><div className="modal-brand-mark">t<span>.</span></div><span className="eyebrow">BUYER SAFETY</span><h2 id="report-heading">Report a seller.</h2><p>Your report goes to the tradR review team, not the seller. Only you and authorized administrators can access your report and evidence.</p><div className="reporting-seller"><span className="vendor-avatar">{reportTarget.vendorName[0]?.toUpperCase() || 'S'}</span><div><b>{reportTarget.vendorName}</b><small>{reportTarget.listingTitle ? `Listing: ${reportTarget.listingTitle}` : 'Seller report'}</small></div></div><form onSubmit={submitSellerReport}><label>What happened?<select value={reportReason} onChange={e => setReportReason(e.target.value as ReportReason)} required><option value="non_delivery">Seller did not deliver</option><option value="suspected_scam">Suspected scam or fraud</option><option value="misleading_listing">Misleading product or listing</option><option value="harassment">Harassment or abusive behaviour</option><option value="other">Other concern</option></select></label><label>Explain the situation<textarea value={reportDetails} onChange={e => setReportDetails(e.target.value)} required minLength={20} maxLength={3000} rows={5} placeholder="Include dates, what was promised, what you paid, and any attempts to contact the seller."/><small className="field-hint">At least 20 characters. Be factual and include only information relevant to this report.</small></label><label>Evidence screenshots (up to 5)<input type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple onChange={e => { const files = Array.from(e.target.files ?? []); if (validateImageFiles(files, 5, 'evidence images')) setReportFiles(files); e.currentTarget.value = '' }}/><small className="field-hint">Optional but helpful: WhatsApp chats, receipts, transfer confirmations or other screenshots. JPG, PNG, WEBP or AVIF, up to 5 MB each. Evidence is stored privately.</small></label>{reportPreviewUrls.length > 0 && <div className="upload-preview-grid">{reportPreviewUrls.map((url, index) => <div className="upload-preview-item" key={url}><img src={url} alt={`Evidence screenshot ${index + 1} preview`}/><button type="button" onClick={() => setReportFiles(files => files.filter((_, fileIndex) => fileIndex !== index))} aria-label={`Remove evidence ${index + 1}`}><Icon name="close" size={14}/></button></div>)}</div>}<button className="modal-primary" disabled={reportBusy}>{reportBusy ? 'Submitting report…' : 'Submit report securely'} <Icon name="arrow"/></button></form><small className="form-footnote">Submitting a report does not automatically suspend a seller. Keep original messages and receipts in case the review team needs to verify details.</small></section></div>}

    {paymentReturn && !authOpen && <div className="confirmation-page" role="dialog" aria-modal="true" aria-labelledby="payment-confirmation-title">
      <div className="confirmation-brand"><span className="brand-mark">t<span>.</span></span><span className="brand-word">tradR<span>.</span></span></div>
      <div className={`confirmation-icon ${paymentReturn.state}`}>{paymentReturn.state === 'succeeded' ? <Icon name="check" size={30}/> : paymentReturn.state === 'checking' ? <span className="confirmation-spinner"/> : paymentReturn.state === 'pending' ? <span className="confirmation-wait">…</span> : <Icon name="close" size={28}/>}</div>
      <span className="eyebrow">{paymentReturn.state === 'succeeded' ? 'PAYMENT CONFIRMED' : paymentReturn.state === 'checking' ? 'SECURE CHECK IN PROGRESS' : paymentReturn.state === 'pending' ? 'AWAITING CONFIRMATION' : paymentReturn.state === 'cancelled' ? 'CHECKOUT CANCELLED' : paymentReturn.state === 'failed' ? 'PAYMENT NOT COMPLETED' : 'PAYMENT STATUS UNAVAILABLE'}</span>
      <h1 id="payment-confirmation-title">{paymentReturn.state === 'succeeded' ? 'You’re all set.' : paymentReturn.state === 'checking' ? 'Checking your payment.' : paymentReturn.state === 'pending' ? 'Almost there.' : paymentReturn.state === 'cancelled' ? 'No worries.' : paymentReturn.state === 'failed' ? 'Payment didn’t go through.' : 'We couldn’t confirm it yet.'}</h1>
      <p>{paymentReturn.message || (paymentReturn.state === 'succeeded' ? 'Your ₦500 subscription has been verified and your listing is active for 30 days.' : paymentReturn.state === 'checking' ? 'We’re checking the payment directly against our server records. Please keep this page open for a moment.' : 'We’re checking the payment status.')}</p>
      {paymentReturn.listingTitle && <div className="confirmation-detail"><span>LISTING</span><strong>{paymentReturn.listingTitle}</strong></div>}
      {paymentReturn.state === 'succeeded' && paymentReturn.expiresAt && <div className="confirmation-detail"><span>ACTIVE UNTIL</span><strong>{new Date(paymentReturn.expiresAt).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' })}</strong></div>}
      {paymentReturn.txRef && <small className="confirmation-reference">Reference ending · {paymentReturn.txRef.slice(-8)}</small>}
      <div className="confirmation-actions">
        {paymentReturn.state === 'checking' ? <button className="modal-primary" disabled>Checking securely… <span className="confirmation-spinner small"/></button> : paymentReturn.state === 'pending' || paymentReturn.state === 'cancelled' ? <button className="modal-primary" onClick={() => setPaymentRetry(value => value + 1)}>Check payment again <Icon name="arrow"/></button> : paymentReturn.state === 'error' && paymentReturn.txRef ? <button className="modal-primary" onClick={() => setPaymentRetry(value => value + 1)}>Try checking again <Icon name="arrow"/></button> : <button className="modal-primary" onClick={() => { setPaymentReturn(null); void openDashboard() }}>{paymentReturn.state === 'succeeded' ? 'Open My shop' : 'Return to My shop'} <Icon name="arrow"/></button>}
        {paymentReturn.state === 'pending' || paymentReturn.state === 'cancelled' || paymentReturn.state === 'error' ? <button className="confirmation-secondary" onClick={() => { if (!user) { setAuthMode('signin'); setAuthOpen(true) } else { setPaymentReturn(null); void openDashboard() } }}>{user ? 'Open My shop' : 'Sign in to check payment'}</button> : <button className="confirmation-secondary" onClick={() => setPaymentReturn(null)}>Back to marketplace</button>}
      </div>
      <small className="form-footnote">A checkout redirect alone does not count as payment. tradR only activates listings after server-side verification.</small>
    </div>}

    {confirmation && !paymentReturn && <div className="confirmation-page" role="dialog" aria-modal="true" aria-labelledby="general-confirmation-title">
      <div className="confirmation-brand"><span className="brand-mark">t<span>.</span></span><span className="brand-word">tradR<span>.</span></span></div>
      <div className={`confirmation-icon ${confirmation.kind}`}>{confirmation.kind === 'success' ? <Icon name="check" size={30}/> : confirmation.kind === 'info' ? <span className="confirmation-wait">i</span> : <Icon name="close" size={28}/>}</div>
      <span className="eyebrow">{confirmation.eyebrow}</span>
      <h1 id="general-confirmation-title">{confirmation.title}</h1>
      <p>{confirmation.message}</p>
      {confirmation.detail && <div className="confirmation-detail"><span>DETAILS</span><strong>{confirmation.detail}</strong></div>}
      <div className="confirmation-actions">
        <button className="modal-primary" onClick={() => { setConfirmation(null); if (confirmation.action === 'shop') void openDashboard() }}>{confirmation.primaryLabel} <Icon name="arrow"/></button>
        <button className="confirmation-secondary" onClick={() => setConfirmation(null)}>{confirmation.secondaryLabel || 'Back to marketplace'}</button>
      </div>
      <small className="form-footnote">Keep your account details safe and contact tradR support if something does not look right.</small>
    </div>}

    {toast && !paymentReturn && !confirmation && <div className="toast-message" role="status"><span><Icon name="check" size={17}/></span>{toast}<button onClick={() => setToast('')} aria-label="Dismiss"><Icon name="close" size={16}/></button></div>}
  </div>
}
