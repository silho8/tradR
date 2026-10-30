import { lazy, Suspense, useEffect, useMemo, useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@supabase/supabase-js'
import InstallGuide from './InstallGuide'

const AdminPanel = lazy(() => import('./AdminPanel'))

const categories = [
  ['All finds', '✳'], ['Food & Drinks', '🥘'], ['Fashion & Thrift', '🧥'], ['Electronics', '🎧'],
  ['Beauty & Hair', '💅'], ['Books & Study Materials', '📚'], ['Tech Services', '💻'],
  ['Laundry & Cleaning', '🫧'], ['Accommodation', '🏡'], ['Other Services', '✦']
]
type Listing = { id: string; title: string; description: string; category: string; price_ngn: number; image_urls: string[]; created_at: string; vendor?: { id?: string; profile_id?: string; shop_name: string; whatsapp_number: string; logo_url?: string | null } | null }
type VendorProfile = { id: string; shop_name: string; bio: string; whatsapp_number: string; logo_url: string | null }
type ShopSubscription = { id: string; status: string; starts_at: string | null; expires_at: string | null }
function calendarMonthAfter(value: string) { const date = new Date(value); const day = date.getDate(); date.setDate(1); date.setMonth(date.getMonth() + 1); const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate(); date.setDate(Math.min(day, lastDay)); return date }
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
const money = (n: number) => new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(n)
// Keep checkout unavailable until the payment provider is formally approved. The server has its own independent gate.
const paymentsEnabled = false
const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined
function decodeBase64Url(value: string) { const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4); return Uint8Array.from(atob(padded), char => char.charCodeAt(0)) }
type Confirmation = { kind: 'success' | 'info' | 'error'; eyebrow: string; title: string; message: string; detail?: string; primaryLabel: string; action: 'dismiss' | 'shop'; secondaryLabel?: string }
type PaymentReturn = { txRef: string; state: 'checking' | 'pending' | 'succeeded' | 'failed' | 'cancelled' | 'error'; listingTitle?: string; expiresAt?: string; subscriptionType?: 'listing' | 'shop_monthly'; message?: string; checkoutCancelled?: boolean }
type AppNotification = { id: string; kind: string; title: string; message: string; entity_type: string | null; entity_id: string | null; read_at: string | null; created_at: string }

function Icon({ name, size = 19 }: { name: string; size?: number }) {
  const paths: Record<string, string> = {
    search: 'm20 20-4.4-4.4M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z',
    home: 'm3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H11v6H5a2 2 0 0 1-2-2Z',
    user: 'M20 21a8 8 0 0 0-16 0m8-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
    shop: 'M3 10h18l-1.5-6h-15L3 10Zm2 0v10h14V10M9 20v-6h6v6M3 10a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0',
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
  const [favorites, setFavorites] = useState<string[]>(() => { try { const saved = window.localStorage.getItem('tradr.saved-listings.v1'); return saved ? JSON.parse(saved) as string[] : [] } catch { return [] } })
  const [savedOnly, setSavedOnly] = useState(false)
  const [mobileTab, setMobileTab] = useState<'home' | 'explore' | 'sell' | 'saved' | 'shop'>('home')
  const [authOpen, setAuthOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [darkMode, setDarkMode] = useState(() => { try { return window.localStorage.getItem('tradr.theme.v1') == 'dark' } catch { return false } })
  const [listingOpen, setListingOpen] = useState(false)
  const [vendorOnboardingOpen, setVendorOnboardingOpen] = useState(false)
  const [dashboardOpen, setDashboardOpen] = useState(false)
  const [activityOpen, setActivityOpen] = useState(false)
  const [adminOpen, setAdminOpen] = useState(false)
  const [myListings, setMyListings] = useState<Array<{ id: string; title: string; description: string; category: string; price_ngn: number; image_urls: string[]; status: string; moderation_status: string; visible_until: string | null }>>([])
  const [transactions, setTransactions] = useState<Array<{ id: string; listing_id: string; buyer_id: string; seller_id: string; status: string; buyer_confirmed: boolean; seller_confirmed: boolean; created_at: string; listing?: { title?: string } | null; seller?: { shop_name?: string } | null }>>([])
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [notificationBusyId, setNotificationBusyId] = useState('')
  const [pushBusy, setPushBusy] = useState(false)
  const [pushEnabled, setPushEnabled] = useState(false)
  const [reviewedTransactionIds, setReviewedTransactionIds] = useState<string[]>([])
  const [reviewTarget, setReviewTarget] = useState<string | null>(null)
  const [reviewRating, setReviewRating] = useState(5)
  const [reviewText, setReviewText] = useState('')
  const [reviewBusy, setReviewBusy] = useState(false)
  const [editingListingId, setEditingListingId] = useState<string | null>(null)
  const [existingListingImages, setExistingListingImages] = useState<string[]>([])
  const [deletingListingId, setDeletingListingId] = useState<string | null>(null)
  const [vendorStatus, setVendorStatus] = useState<string | null>(null)
  const [vendorProfile, setVendorProfile] = useState<VendorProfile | null>(null)
  const [shopSubscription, setShopSubscription] = useState<ShopSubscription | null>(null)
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
  const [emailConfirmationLanding] = useState(() => window.location.pathname.replace(/\/+$/, '') === '/auth/confirmed')
  const [user, setUser] = useState<{ id: string; email?: string; role?: string; created_at?: string } | null>(null)
  const [authMode, setAuthMode] = useState<'signup' | 'signin' | 'reset' | 'recovery'>(() => window.location.pathname.replace(/\/+$/, '') === '/auth/reset-password' ? 'recovery' : 'signup')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authNotice, setAuthNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ title: '', description: '', category: '', price_ngn: '' })
  const trialEndsAt = user?.created_at ? calendarMonthAfter(user.created_at) : null
  const shopSubscriptionActive = !!shopSubscription && shopSubscription.status === 'active' && !!shopSubscription.expires_at && Date.parse(shopSubscription.expires_at) > Date.now()
  const trialActive = !!trialEndsAt && Date.now() < trialEndsAt.getTime()
  const shopAccessActive = shopSubscriptionActive || trialActive

  const query = useQuery({
    queryKey: ['listings'],
    queryFn: async () => {
      if (!db) return demoListings
      const { data, error } = await db.from('listings').select('id,title,description,category,price_ngn,image_urls,created_at,vendor:vendors(id,profile_id,shop_name,whatsapp_number,logo_url)').eq('status', 'published').eq('moderation_status', 'approved').gt('visible_until', new Date().toISOString()).order('created_at', { ascending: false }).limit(24)
      if (error) throw error
      if (!data?.length && import.meta.env.DEV) return demoListings
      return (data ?? []) as unknown as Listing[]
    },
    staleTime: 0,
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true
  })

  useEffect(() => {
    if (!db) return
    const channel = db
      .channel('marketplace-listing-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'listings' }, () => {
        void query.refetch()
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') void query.refetch()
      })

    return () => { void db.removeChannel(channel) }
  }, [query.refetch])

  const ratingsQuery = useQuery({
    queryKey: ['seller-ratings'],
    queryFn: async () => {
      if (!db) return {} as Record<string, { average: number; count: number }>
      const { data, error } = await db.from('seller_reviews').select('vendor_id,rating')
      if (error) throw error
      const totals: Record<string, { sum: number; count: number }> = {}
      for (const review of data ?? []) {
        const entry = totals[review.vendor_id] ?? { sum: 0, count: 0 }
        entry.sum += Number(review.rating)
        entry.count += 1
        totals[review.vendor_id] = entry
      }
      return Object.fromEntries(Object.entries(totals).map(([id, value]) => [id, { average: value.sum / value.count, count: value.count }]))
    }
  })

  const reviewsQuery = useQuery({
    queryKey: ['seller-review-details', selected?.vendor?.id],
    enabled: !!db && !!selected?.vendor?.id,
    queryFn: async () => {
      const vendorId = selected?.vendor?.id
      if (!db || !vendorId) return []
      const { data, error } = await db.from('seller_reviews').select('id,rating,review_text,created_at').eq('vendor_id', vendorId).order('created_at', { ascending: false }).limit(5)
      if (error) throw error
      return data ?? []
    }
  })

  useEffect(() => {
    if (!db) { setAuthReady(true); return }
    db.auth.getSession().then(({ data }) => {
      const u = data.session?.user
      if (u) setUser({ id: u.id, email: u.email, created_at: u.created_at, role: typeof u.app_metadata?.role === 'string' ? u.app_metadata.role : undefined })
      setAuthReady(true)
    }).catch(() => setAuthReady(true))
    const { data } = db.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ? { id: session.user.id, email: session.user.email, created_at: session.user.created_at, role: typeof session.user.app_metadata?.role === 'string' ? session.user.app_metadata.role : undefined } : null)
      if (event === 'PASSWORD_RECOVERY') {
        setAuthMode('recovery')
        setPassword('')
        setAuthNotice('Choose a new password for your tradR account.')
        setAuthOpen(true)
      }
      setAuthReady(true)
    })
    return () => data.subscription.unsubscribe()
  }, [])
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(''), 3200); return () => window.clearTimeout(timer) }, [toast])
  useEffect(() => { try { window.localStorage.setItem('tradr.theme.v1', darkMode ? 'dark' : 'light') } catch { /* Theme still applies for this session. */ } }, [darkMode])
  useEffect(() => { try { window.localStorage.setItem('tradr.saved-listings.v1', JSON.stringify(favorites)) } catch { /* Saved finds remain usable for this session if storage is unavailable. */ } }, [favorites])
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
    const paymentKind = params.get('payment')
    if (paymentKind !== 'return' && paymentKind !== 'shop-return') return
    const subscriptionType = paymentKind === 'shop-return' ? 'shop_monthly' : 'listing'
    const txRef = params.get('tx_ref') ?? ''
    const providerStatus = (params.get('status') ?? '').toLowerCase()
    const cancelled = providerStatus === 'cancelled' || providerStatus === 'failed'
    setPaymentReturn({
      txRef,
      state: txRef ? 'checking' : 'error',
      subscriptionType,
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
          setPaymentReturn(current => current ? { ...current, state: 'succeeded', listingTitle: data.listing_title, subscriptionType: data.subscription_type ?? current.subscriptionType, expiresAt: data.expires_at, message: undefined } : current)
          return
        }
        if (data?.status === 'failed') {
          setPaymentReturn(current => current ? { ...current, state: 'failed', listingTitle: data.listing_title, subscriptionType: data.subscription_type ?? current.subscriptionType, message: 'The payment was not completed successfully. You can return to My shop and try again.' } : current)
          return
        }
        setPaymentReturn(current => current ? { ...current, state: 'pending', listingTitle: data?.listing_title, subscriptionType: data?.subscription_type ?? current.subscriptionType, message: 'We have not received final confirmation yet. We are checking again automatically.' } : current)
        if (attempt < 5) await wait(1800)
      }
      if (!cancelled) setPaymentReturn(current => current ? { ...current, state: current.checkoutCancelled ? 'cancelled' : 'pending', message: current.checkoutCancelled ? 'We have not verified a payment for this checkout. If you completed payment despite the cancellation message, check again before trying to pay again.' : 'Your payment is still being confirmed by the payment provider. You do not need to pay again yet. Check again shortly or open My shop to review the status.' } : current)
    }
    void checkPayment()
    return () => { cancelled = true }
  }, [paymentReturn?.txRef, authReady, user?.id, paymentRetry])

  const listings = useMemo(() => {
    const term = search.toLowerCase().trim()
    return [...(query.data ?? [])].filter((l) => (!savedOnly || favorites.includes(l.id)) && (category === 'All finds' || l.category === category) && (!term || [l.title, l.description, l.category, l.vendor?.shop_name ?? ''].some((v) => v.toLowerCase().includes(term))))
      .sort((a, b) => sort === 'price-low' ? a.price_ngn - b.price_ngn : sort === 'price-high' ? b.price_ngn - a.price_ngn : Date.parse(b.created_at) - Date.parse(a.created_at))
  }, [query.data, search, category, sort, savedOnly, favorites])

  async function authSubmit(e: FormEvent) {
    e.preventDefault()
    if (!db) { setToast('Supabase is not configured yet.'); return }
    setBusy(true)
    try {
      if (authMode === 'signup') {
        const { data, error } = await db.auth.signUp({ email, password, options: { data: { display_name: name.trim() }, emailRedirectTo: 'https://www.tradrr.store/auth/confirmed' } })
        if (error) throw error
        if (data.session) {
          setAuthOpen(false)
          setConfirmation({ kind: 'success', eyebrow: 'ACCOUNT READY', title: 'You’re in.', message: 'Your tradR account has been created. You can explore the marketplace or start setting up your shop.', primaryLabel: 'Explore tradR', action: 'dismiss' })
        } else {
          setAuthOpen(false)
          setPassword('')
          setConfirmation({ kind: 'info', eyebrow: 'CHECK YOUR INBOX', title: 'One last step.', message: 'Your signup was received. Open the confirmation email we sent you, then come back and log in. If it does not arrive, check your spam folder.', primaryLabel: 'Back to tradR', action: 'dismiss' })
        }
      } else if (authMode === 'reset') {
        const { error } = await db.auth.resetPasswordForEmail(email, { redirectTo: 'https://www.tradrr.store/auth/reset-password' })
        if (error) throw error
        setAuthOpen(false)
        setConfirmation({ kind: 'info', eyebrow: 'CHECK YOUR INBOX', title: 'Password reset link sent.', message: 'If an account exists for that email, a password reset link is on its way. Check your inbox and spam folder.', primaryLabel: 'Back to tradR', action: 'dismiss' })
      } else if (authMode === 'recovery') {
        const { error } = await db.auth.updateUser({ password })
        if (error) throw error
        setAuthOpen(false)
        setPassword('')
        setConfirmation({ kind: 'success', eyebrow: 'PASSWORD UPDATED', title: 'You’re back in control.', message: 'Your password has been updated. You can now sign in to tradR with your new password.', primaryLabel: 'Continue to tradR', action: 'dismiss' })
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
    const { z } = await import('zod')
    const schema = z.object({ title: z.string().trim().min(3).max(120), description: z.string().trim().min(10).max(3000), category: z.string().min(1), price_ngn: z.coerce.number().int().min(0).max(100000000000) })
    const parsed = schema.safeParse({ ...form, price_ngn: form.price_ngn })
    if (!parsed.success) { setToast(parsed.error.issues[0]?.message ?? 'Check your listing details.'); return }
    if (!db || !user) { setListingOpen(false); setAuthOpen(true); setToast('Sign in first to create a listing.'); return }
    if (!validateImageFiles(listingFiles, 4, 'listing images')) return
    if (editingListingId && existingListingImages.length + listingFiles.length > 8) { setToast('A listing can have up to 8 photos total. Remove a current photo before adding more.'); return }
    setBusy(true)
    const uploadedPaths: string[] = []
    try {
      const { data: vendor, error: vendorError } = await db.from('vendors').select('id,verification_status').eq('profile_id', user.id).maybeSingle()
      if (vendorError) throw vendorError
      if (!vendor) { setListingOpen(false); setVendorOnboardingOpen(true); return }
      if (vendor.verification_status !== 'approved') { setToast('Your shop must be approved by tradR before you can publish listings.'); return }
      if (!shopAccessActive) { setToast('Your free shop trial has ended. Subscribe for ₦500/month to publish listings.'); return }
      if (!editingListingId) {
        const { count: existingListingCount, error: countError } = await db.from('listings').select('id', { count: 'exact', head: true }).eq('vendor_id', vendor.id).neq('status', 'archived')
        if (countError) throw countError
        if ((existingListingCount ?? 0) >= 10) {
          setToast('Each shop can have up to 10 active listings. Delete an existing listing to free a slot.')
          return
        }
      }
      const imageUrls: string[] = []
      for (const file of listingFiles) {
        const uploaded = await uploadPublicImage(file, 'listings')
        uploadedPaths.push(uploaded.path)
        imageUrls.push(uploaded.url)
      }
      if (editingListingId) {
        const { error } = await db.from('listings').update({ ...parsed.data, image_urls: [...existingListingImages, ...imageUrls] }).eq('id', editingListingId).eq('vendor_id', vendor.id)
        if (error) throw error
        setListingOpen(false)
        setEditingListingId(null)
        setExistingListingImages([])
        setForm({ title: '', description: '', category: '', price_ngn: '' })
        setListingFiles([])
        setToast('Listing updated. Your changes are now reflected on the marketplace.')
      } else {
        const { error } = await db.from('listings').insert({ ...parsed.data, vendor_id: vendor.id, status: 'published', moderation_status: 'approved', image_urls: imageUrls })
        if (error) throw error
        setListingOpen(false)
        setForm({ title: '', description: '', category: '', price_ngn: '' })
        setListingFiles([])
        setConfirmation({ kind: 'success', eyebrow: 'LISTING PUBLISHED', title: 'You’re live.', message: 'Your listing is now visible to the LCU community. Your shop must remain approved and covered by its free trial or ₦500 monthly subscription.', primaryLabel: 'Open My shop', action: 'shop' })
      }
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
      const { data: txData, error: txError } = await db.from('transactions').select('id,listing_id,buyer_id,seller_id,status,buyer_confirmed,seller_confirmed,created_at,listing:listings(title),seller:vendors(shop_name)').order('created_at', { ascending: false }).limit(30)
      if (txError) throw txError
      setTransactions((txData ?? []) as unknown as typeof transactions)
      const { data: reviewData, error: reviewError } = await db.from('seller_reviews').select('transaction_id').eq('reviewer_id', user.id)
      if (reviewError) throw reviewError
      setReviewedTransactionIds((reviewData ?? []).map((r: { transaction_id: string }) => r.transaction_id))
      const { data: notificationData, error: notificationError } = await db.from('notifications').select('id,kind,title,message,entity_type,entity_id,read_at,created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(20)
      if (notificationError) throw notificationError
      setNotifications((notificationData ?? []) as AppNotification[])
      const { data: pushRows, error: pushError } = await db.from('push_subscriptions').select('id').eq('user_id', user.id).limit(1)
      if (pushError && !/push_subscriptions/i.test(pushError.message)) throw pushError
      setPushEnabled(!!pushRows?.length)
      const { data: vendor, error: vendorError } = await db.from('vendors').select('id,verification_status,shop_name,bio,whatsapp_number,logo_url').eq('profile_id', user.id).maybeSingle()
      if (vendorError) throw vendorError
      if (vendor) {
        setVendorStatus(vendor.verification_status)
        setVendorProfile(vendor as VendorProfile)
        const { data: shopSub, error: shopSubError } = await db.from('shop_subscriptions').select('id,status,starts_at,expires_at').eq('vendor_id', vendor.id).eq('status', 'active').gt('expires_at', new Date().toISOString()).order('expires_at', { ascending: false }).limit(1).maybeSingle()
        if (shopSubError) throw shopSubError
        setShopSubscription(shopSub as ShopSubscription | null)
        const { data, error } = await db.from('listings').select('id,title,description,category,price_ngn,image_urls,status,moderation_status,visible_until').eq('vendor_id', vendor.id).neq('status', 'archived').order('created_at', { ascending: false })
        if (error) throw error
        setMyListings(data ?? [])
      } else {
        setVendorStatus(null)
        setVendorProfile(null)
        setShopSubscription(null)
        setMyListings([])
        setActivityOpen(true)
        return
      }
      setDashboardOpen(true)
    } catch (err) { setToast(err instanceof Error ? err.message : 'Could not load your account.') } finally { setBusy(false) }
  }

  async function enablePushNotifications() {
    if (!db || !user || pushBusy) return
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) { setToast('This browser does not support push notifications. Try installing tradR on a supported browser.'); return }
    if (!vapidPublicKey) { setToast('Push notifications are not configured yet. Please try again later.'); return }
    setPushBusy(true)
    try {
      const permission = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission
      if (permission !== 'granted') { setToast('Allow notifications for tradR in your browser settings to receive listing updates.'); return }
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodeBase64Url(vapidPublicKey) })
      const json = subscription.toJSON()
      const keys = json.keys
      if (!json.endpoint || !keys?.p256dh || !keys?.auth) throw new Error('Your browser did not provide a valid push subscription.')
      const { error } = await db.from('push_subscriptions').upsert({ user_id: user.id, endpoint: json.endpoint, p256dh: keys.p256dh, auth: keys.auth, updated_at: new Date().toISOString() }, { onConflict: 'endpoint' })
      if (error) throw error
      setPushEnabled(true)
      setToast('Notifications enabled. We’ll send important shop and transaction updates when available.')
    } catch (err) { setToast(err instanceof Error ? err.message : 'Could not enable push notifications.') }
    finally { setPushBusy(false) }
  }

  async function markNotificationRead(id: string) {
    if (!db || !user || notificationBusyId) return
    const readAt = new Date().toISOString()
    setNotificationBusyId(id)
    try {
      const { error } = await db.from('notifications').update({ read_at: readAt }).eq('id', id).eq('user_id', user.id).is('read_at', null)
      if (error) throw error
      setNotifications(current => current.map(item => item.id === id ? { ...item, read_at: item.read_at ?? readAt } : item))
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Could not update this notification.')
    } finally { setNotificationBusyId('') }
  }

  async function markAllNotificationsRead() {
    if (!db || !user || notificationBusyId || !notifications.some(item => !item.read_at)) return
    const readAt = new Date().toISOString()
    setNotificationBusyId('all')
    try {
      const { error } = await db.from('notifications').update({ read_at: readAt }).eq('user_id', user.id).is('read_at', null)
      if (error) throw error
      setNotifications(current => current.map(item => ({ ...item, read_at: item.read_at ?? readAt })))
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Could not update notifications.')
    } finally { setNotificationBusyId('') }
  }

  async function startTransaction(listing: Listing) {
    if (!db || !user) {
      setSelected(null)
      setAuthMode('signin')
      setAuthOpen(true)
      setToast('Sign in to record a purchase and leave a verified review.')
      return
    }
    if (!listing.vendor?.id || listing.id.startsWith('demo-')) { setToast('Purchase confirmations are available for live listings only.'); return }
    if (listing.vendor.profile_id === user.id) { setToast('You cannot record a purchase on your own listing. The buyer must confirm it from their account.'); return }
    setBusy(true)
    try {
      const { error } = await db.from('transactions').insert({ listing_id: listing.id, buyer_id: user.id, seller_id: listing.vendor.id })
      if (error) {
        if (error.code === '23505') throw new Error('You have already recorded this transaction.')
        throw error
      }
      setSelected(null)
      setToast('Purchase recorded. Ask the seller to confirm after the handover, then confirm your side too.')
      await openDashboard()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not record the purchase.'
      setToast(message.includes('not currently available for a handover record') ? 'This listing cannot be recorded by your account. If you are the seller, ask the buyer to record the purchase from their account.' : message)
    } finally { setBusy(false) }
  }

  async function confirmTransaction(tx: typeof transactions[number]) {
    if (!db || !user) return
    setBusy(true)
    try {
      const patch = tx.buyer_id === user.id ? { buyer_confirmed: true } : { seller_confirmed: true }
      const { error } = await db.from('transactions').update(patch).eq('id', tx.id)
      if (error) throw error
      setToast('Your confirmation has been saved.')
      await openDashboard()
    } catch (err) { setToast(err instanceof Error ? err.message : 'Could not confirm this transaction.') } finally { setBusy(false) }
  }

  async function submitSellerReview(e: FormEvent) {
    e.preventDefault()
    if (!db || !user || !reviewTarget) return
    setReviewBusy(true)
    try {
      const tx = transactions.find(item => item.id === reviewTarget)
      if (!tx) throw new Error('Transaction not found. Refresh your account and try again.')
      const { error } = await db.from('seller_reviews').insert({ transaction_id: tx.id, reviewer_id: user.id, vendor_id: tx.seller_id, rating: reviewRating, review_text: reviewText.trim() })
      if (error) throw error
      setReviewedTransactionIds(old => [...old, tx.id])
      setReviewTarget(null)
      setReviewText('')
      setReviewRating(5)
      setToast('Thanks. Your verified seller review is now published.')
    } catch (err) { setToast(err instanceof Error ? err.message : 'Could not submit your review.') } finally { setReviewBusy(false) }
  }

  async function beginEditListing(item: { id: string; title: string; description: string; category: string; price_ngn: number; image_urls: string[] }) {
    setEditingListingId(item.id)
    setExistingListingImages(item.image_urls ?? [])
    setListingFiles([])
    setForm({ title: item.title, description: item.description, category: item.category, price_ngn: String(item.price_ngn) })
    setDashboardOpen(false)
    setListingOpen(true)
  }

  async function deleteListing(item: { id: string; title: string }) {
    if (!db || !user) return
    const confirmed = window.confirm(`Delete “${item.title}” from your shop? It will disappear from the marketplace and free a listing slot. Payment history is retained.`)
    if (!confirmed) return
    setDeletingListingId(item.id)
    try {
      const { data: listingToArchive, error: lookupError } = await db.from('listings').select('image_urls').eq('id', item.id).single()
      if (lookupError) throw lookupError
      const { error } = await db.from('listings').update({ status: 'archived', image_urls: [] }).eq('id', item.id)
      if (error) throw error
      const storagePaths = ((listingToArchive?.image_urls ?? []) as string[]).flatMap(photo => {
        try { const path = new URL(photo).pathname.split('/listing-images/')[1]; return path ? [decodeURIComponent(path)] : [] } catch { return [] }
      }).filter(path => path.startsWith(`${user.id}/`))
      if (storagePaths.length) await db.storage.from('listing-images').remove(storagePaths)
      setMyListings(current => current.filter(listing => listing.id !== item.id))
      await query.refetch()
      setToast('Listing deleted from your shop. Your listing slot is available again.')
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Could not delete listing. Please try again.')
    } finally { setDeletingListingId(null) }
  }

  async function startShopPayment() {
    if (!db || !user) { setAuthOpen(true); return }
    setPaymentBusyId('shop')
    try {
      const { data, error } = await db.functions.invoke('start-shop-payment')
      if (error) throw error
      if (typeof data?.checkout_url !== 'string') throw new Error(data?.error || 'Shop subscription checkout is not available yet.')
      window.location.assign(data.checkout_url)
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Could not start shop subscription checkout.')
    } finally { setPaymentBusyId('') }
  }

  const img = (l: Listing) => l.image_urls?.[0] || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=900&q=80'
  const closeModal = () => { setAuthOpen(false); setSettingsOpen(false); setListingOpen(false); setVendorOnboardingOpen(false); setSelected(null); setEditingListingId(null); setExistingListingImages([]); setListingFiles([]) }
  async function signOut() {
    if (!db) { setUser(null); setSettingsOpen(false); setToast('Signed out.'); return }
    const { error } = await db.auth.signOut()
    if (error) { setToast('Could not sign out. Please try again.'); return }
    setUser(null); setSettingsOpen(false); setDashboardOpen(false); setActivityOpen(false); setToast('You have been signed out.')
  }

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
      setConfirmation({ kind: 'info', eyebrow: 'SHOP SUBMITTED', title: 'We’ve got your details.', message: 'Your shop profile and branding are saved and waiting for admin approval. Once approved, you can publish listings immediately while your free trial or shop subscription is active.', primaryLabel: 'Open My shop', action: 'shop' })
    } catch (err) {
      if (uploadedLogoPath) await db.storage.from('listing-images').remove([uploadedLogoPath])
      setToast(err instanceof Error ? err.message : 'Could not create your shop profile.')
    } finally { setBusy(false) }
  }

  const transactionCards = transactions.length ? transactions.map(tx => {
    const isBuyer = tx.buyer_id === user?.id
    const isSeller = vendorProfile?.id === tx.seller_id
    return <article className="transaction-card" key={tx.id}>
      <div className="transaction-card-head"><div><b>{tx.listing?.title || 'Campus purchase'}</b><small>{isBuyer ? 'You are the buyer' : 'You are the seller'} · {new Date(tx.created_at).toLocaleDateString('en-NG')}</small></div><span className={'transaction-status ' + tx.status}>{tx.status === 'completed' ? 'COMPLETED' : tx.status.toUpperCase()}</span></div>
      <p>{tx.seller?.shop_name ? `Seller: ${tx.seller.shop_name}. ` : ''}{tx.buyer_confirmed ? 'Buyer confirmed. ' : 'Waiting for buyer confirmation. '}{tx.seller_confirmed ? 'Seller confirmed.' : 'Waiting for seller confirmation.'}</p>
      {tx.status === 'pending' && ((isBuyer && !tx.buyer_confirmed) || (isSeller && !tx.seller_confirmed)) && <button className="outline-button transaction-action" disabled={busy} onClick={() => void confirmTransaction(tx)}>{busy ? 'Saving…' : isBuyer ? 'Confirm I received it' : 'Confirm handover'}</button>}
      {isBuyer && tx.status === 'completed' && !reviewedTransactionIds.includes(tx.id) && <button className="outline-button transaction-action" onClick={() => { setReviewTarget(reviewTarget === tx.id ? null : tx.id); setReviewText(''); setReviewRating(5) }}>{reviewTarget === tx.id ? 'Close review' : 'Rate this seller'}</button>}
      {isBuyer && tx.status === 'completed' && reviewedTransactionIds.includes(tx.id) && <small className="verified-review-note">✓ You’ve reviewed this seller.</small>}
      {reviewTarget === tx.id && <form className="transaction-review-form" onSubmit={submitSellerReview}><label>Rating<select value={reviewRating} onChange={e => setReviewRating(Number(e.target.value))}><option value={5}>★★★★★ · Loved it</option><option value={4}>★★★★☆ · Good</option><option value={3}>★★★☆☆ · Okay</option><option value={2}>★★☆☆☆ · Not great</option><option value={1}>★☆☆☆☆ · Poor</option></select></label><label>Review (optional)<textarea value={reviewText} onChange={e => setReviewText(e.target.value)} maxLength={1000} rows={3} placeholder="How was your experience with this seller?"/></label><button className="modal-primary" disabled={reviewBusy}>{reviewBusy ? 'Publishing…' : 'Publish verified review'} <Icon name="arrow" size={15}/></button><small className="field-hint">Only available after both buyer and seller confirm the handover.</small></form>}
    </article>
  }) : <div className="dashboard-empty"><b>No purchases or sales recorded yet.</b><span>Open a live listing, chat with the seller, then tap “I bought this” after you agree on a purchase.</span></div>

  return <div className={darkMode ? 'app-shell theme-dark' : 'app-shell'} data-theme={darkMode ? 'dark' : 'light'}>
    <InstallGuide />
    <div className="announcement"><span className="announcement-dot" /> YOUR CAMPUS, YOUR COMMUNITY. <span>Made for LCU students.</span><b>↗</b></div>
    <header className="site-header">
      <a className="brand" href="#" onClick={() => { setCategory('All finds'); setSearch('') }}><span className="brand-mark">t<span>.</span></span><span className="brand-word">tradR<span>.</span></span></a>
      <button type="button" className="mobile-profile-button" onClick={() => setSettingsOpen(true)} aria-label={user ? 'Open account and settings' : 'Log in or open settings'}><span>{user ? (user.email?.[0] ?? 'U').toUpperCase() : <Icon name="user" size={19}/>}</span><small>{user ? 'Account' : 'Sign in'}</small></button>
      <div className="header-location"><Icon name="pin" size={17}/><span><b>Lead City University</b><small>Ibadan, Nigeria</small></span><span className="chevron">⌄</span></div>
      <label className="header-search"><Icon name="search" size={18}/><input placeholder="Find anything on campus..." value={search} onChange={e => setSearch(e.target.value)} aria-label="Search marketplace"/><kbd>⌘ K</kbd></label>
      <nav className="header-actions"><button className="nav-link" onClick={() => document.getElementById('marketplace')?.scrollIntoView({ behavior: 'smooth' })}>Explore</button><button className="nav-link" onClick={() => setToast(favorites.length ? favorites.length + ' finds saved.' : 'Tap a heart to save a find.')}>Saved <sup>{favorites.length || ''}</sup></button>{user?.role === 'admin' && <button className="nav-link" onClick={() => setAdminOpen(true)}>Admin</button>}{user && <button className="nav-link account-nav-link" onClick={() => setSettingsOpen(true)}>Account</button>}<button className="nav-link settings-nav-link" onClick={() => setSettingsOpen(true)}>Settings</button>{user ? <button className="login-button" onClick={() => void signOut()}>{(user.email?.[0] ?? 'U').toUpperCase()} · Sign out</button> : <button className="login-button" onClick={() => { setAuthMode('signin'); setAuthOpen(true) }}>Log in</button>}{user && <button className="shop-nav-button" onClick={() => void openDashboard()}>My shop <Icon name="arrow" size={14}/></button>}<button className="sell-button" onClick={() => user ? setListingOpen(true) : setAuthOpen(true)}><Icon name="plus" size={17}/> Sell something</button></nav>
    </header>

    <main>
      <section className="mobile-home-panel" aria-label="Discover tradR">
        <div className="mobile-home-kicker"><span className="mobile-home-live-dot" /> YOUR LCU MARKETPLACE</div>
        <h1>What are we<br/>finding <em>today?</em></h1>
        <p>Good things, from people just around the corner.</p>
        <label className="mobile-home-search"><Icon name="search" size={20}/><input placeholder="Search clothes, food, services..." value={search} onChange={e => setSearch(e.target.value)} aria-label="Search campus marketplace"/><button type="button" onClick={() => document.getElementById('marketplace')?.scrollIntoView({ behavior: 'smooth' })} aria-label="See search results"><Icon name="arrow" size={18}/></button></label>
        <div className="mobile-home-section-label"><span>EXPLORE CATEGORIES</span><span>SWIPE →</span></div>
        <div className="mobile-home-categories">
          {categories.map(([label, emoji]) => <button key={label} className={category === label ? 'mobile-home-category active' : 'mobile-home-category'} onClick={() => { setCategory(label); setSavedOnly(false); setMobileTab('explore'); document.getElementById('marketplace')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }}><span>{emoji}</span><small>{label}</small></button>)}
        </div>
        <div className="mobile-home-trust"><span className="mobile-home-trust-mark">✳</span><span><b>Made for Lead City</b><small>Find it on campus. Connect directly.</small></span><span className="mobile-home-trust-arrow">↗</span></div>
      </section>
      <section className="hero">
        <div className="hero-copy"><div className="eyebrow"><span>✳</span> THE LCU MARKETPLACE</div><h1>Good finds.<br/>Great <em>people.</em></h1><p className="hero-subtitle">From your next favourite fit to that person who fixes everything. Find it right here on campus.</p>
          <label className="hero-search"><Icon name="search" size={20}/><input placeholder="What are you looking for?" value={search} onChange={e => setSearch(e.target.value)} aria-label="Search listings"/><button onClick={() => document.getElementById('marketplace')?.scrollIntoView({ behavior: 'smooth' })}>Find it <Icon name="arrow" size={17}/></button></label>
          <div className="hero-footnote"><span className="avatar-stack"><i>O</i><i>T</i><i>A</i><i>+</i></span><span><b>LCU people,</b> real deals.</span><span className="footnote-divider"/><span className="trust-stars">★★★★★</span><span>Built for campus life</span></div>
        </div>
        <div className="hero-art"><div className="hero-art-bg"/><div className="hero-sticker">THE GOOD<br/>STUFF IS<br/><b>CLOSE BY.</b><span>↘</span></div><div className="hero-photo hero-photo-main"><img src="/assets/seth-ebenezer-tetteh-DeqswsZEO3Y-unsplash.jpg" alt="Campus marketplace hero photo"/><span className="photo-label">STYLE FINDS <b>↗</b></span></div><div className="hero-photo hero-photo-small"><img src="https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=600&q=85" alt="Coffee on a table"/></div><div className="hero-floating-card"><span>✳</span><div><b>Something good</b><small>is always nearby</small></div><strong>↗</strong></div><div className="hero-art-caption">YOUR CAMPUS. YOUR PEOPLE. YOUR MARKET.</div></div>
        <div className="hero-bottomline"><span>01 / THE CAMPUS EDIT</span><i/><span>SCROLL TO EXPLORE ↓</span></div>
      </section>

      <section className="category-section"><div className="section-topline"><span>YOUR NEXT FIND IS IN HERE</span><span>01 — 09</span></div><div className="category-row">{categories.map(([label, emoji]) => <button key={label} className={category === label ? 'category-pill active' : 'category-pill'} onClick={() => { setCategory(label); document.getElementById('marketplace')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }}><span>{emoji}</span>{label}</button>)}</div></section>

      <section className="marketplace-section" id="marketplace"><div className="marketplace-heading"><div><div className="eyebrow"><span>✳</span> THE MARKETPLACE</div><h2>Good stuff, <em>found.</em></h2><p>The things you need, from people just around the corner.</p></div><button className="outline-button" onClick={() => { setCategory('All finds'); setSearch(''); setSort('latest') }}>See everything <Icon name="arrow" size={17}/></button></div>
        <div className="market-toolbar"><div className="results-count"><span/> {query.isLoading ? 'Finding your next thing…' : listings.length + ' finds to fall for'} <i>/ at Lead City</i></div><div className="toolbar-actions"><label htmlFor="sort">Sort by</label><select id="sort" value={sort} onChange={e => setSort(e.target.value)}><option value="latest">Latest finds</option><option value="price-low">Price: low to high</option><option value="price-high">Price: high to low</option></select><button className="filter-button" onClick={() => setToast('Choose a category above to narrow your finds.')}><Icon name="sliders" size={17}/> Filters</button></div></div>
        {query.isError && <div className="inline-notice">We couldn’t reach the live marketplace. <button onClick={() => query.refetch()}>Try again</button></div>}
        {query.isLoading ? <div className="listing-grid">{[1,2,3,4].map(n => <div className="skeleton-card" key={n}><div/><span/><span/></div>)}</div> : listings.length ? <div className="listing-grid">{listings.map((l, i) => <article className="listing-card" key={l.id}><button className="listing-image-button" onClick={() => setSelected(l)} aria-label={'View ' + l.title}><img className="listing-image" src={img(l)} alt={l.title} loading={i > 3 ? 'lazy' : 'eager'}/>{i === 0 && <span className="listing-badge">{l.id.startsWith('demo-') ? 'PREVIEW SAMPLE' : 'CAMPUS FAVOURITE'}</span>}<span className="image-open"><Icon name="arrow"/></span></button><button className={favorites.includes(l.id) ? 'favorite-button is-favorite' : 'favorite-button'} onClick={() => setFavorites(old => old.includes(l.id) ? old.filter(x => x !== l.id) : [...old, l.id])} aria-label="Save listing"><Icon name="heart"/></button><div className="listing-meta"><span>{l.category}</span><b>✳</b></div><button className="listing-title" onClick={() => setSelected(l)}>{l.title}</button><div className="listing-vendor"><span className="vendor-avatar">{l.vendor?.logo_url ? <img src={l.vendor.logo_url} alt=""/> : (l.vendor?.shop_name?.[0] ?? 'L').toUpperCase()}</span><span>{l.vendor?.shop_name ?? 'LCU seller'}</span><i>·</i><span>LCU</span></div>{l.vendor?.id && ratingsQuery.data?.[l.vendor.id] && <div className="seller-rating" aria-label={`${ratingsQuery.data[l.vendor.id].average.toFixed(1)} out of 5 from ${ratingsQuery.data[l.vendor.id].count} verified reviews`}><span>★</span> {ratingsQuery.data[l.vendor.id].average.toFixed(1)} <small>({ratingsQuery.data[l.vendor.id].count})</small></div>}<div className="listing-bottom"><strong>{money(Number(l.price_ngn))}</strong><button onClick={() => setSelected(l)} aria-label="Listing details"><Icon name="arrow"/></button></div></article>)}</div> : <div className="empty-state"><span className="empty-icon"><Icon name="search" size={25}/></span><h3>No finds just yet.</h3><p>Try another search or category. Your next favourite thing is out there.</p><button className="outline-button" onClick={() => { setSearch(''); setCategory('All finds') }}>Clear filters</button></div>}
        <div className="marketplace-end"><span>THAT'S THE CAMPUS EDIT, FOR NOW.</span><b>✳</b><span>MORE GOOD THINGS COMING.</span></div>
      </section>

      <section className="seller-banner"><div className="seller-banner-mark">t<span>.</span></div><div className="seller-banner-copy"><span className="eyebrow">GOT SOMETHING GOOD?</span><h2>Your side hustle<br/>looks good <em>here.</em></h2><p>Put your product or service in front of the people who need it. Your next customer might be two blocks away.</p><button onClick={() => user ? setListingOpen(true) : setAuthOpen(true)}>Start selling <Icon name="arrow" size={17}/></button></div><div className="seller-banner-art"><div className="seller-circle circle-one"/><div className="seller-circle circle-two"/><div className="seller-note note-one">YOUR<br/>THING.</div><div className="seller-note note-two">YOUR<br/>PEOPLE. <span>↗</span></div><div className="seller-banner-grid"/></div><div className="seller-banner-foot"><span>MADE FOR THE MAKERS.</span><span>LCU / IBADAN / NIGERIA</span></div></section>
      <section className="trust-strip"><div><span className="trust-icon">↗</span><span><b>Real campus connections</b><small>Find people who are right here.</small></span></div><div><span className="trust-icon">♡</span><span><b>Keep it direct</b><small>Talk to sellers on WhatsApp.</small></span></div><div><span className="trust-icon trust-lcu-icon"><img src="/assets/lead-city-university-logo.png" alt="Lead City University logo" /></span><span><b>Made for LCU</b><small>Your campus community, in one place.</small></span></div></section>
    </main>

    <footer className="site-footer"><a className="brand" href="#"><span className="brand-mark">t<span>.</span></span><span className="brand-word">tradR<span>.</span></span></a><span className="footer-note">GOOD FINDS TRAVEL FAST.</span><span className="footer-copy">© 2026 tradR.</span><span className="footer-made-for"><span>Made for</span><img src="/assets/lead-city-university-logo.png" alt="Lead City University" /></span><button onClick={() => setToast('For safety concerns, please contact the tradR admin team.')}>Safety & support ↗</button></footer>
    <nav className="mobile-bottom-nav" aria-label="Main navigation">
      <button className={mobileTab === 'home' ? 'active' : ''} onClick={() => { setMobileTab('home'); setSavedOnly(false); setCategory('All finds'); setSearch(''); window.scrollTo({ top: 0, behavior: 'smooth' }) }}><Icon name="home" size={20}/>Home</button>
      <button className={mobileTab === 'explore' ? 'active' : ''} onClick={() => { setMobileTab('explore'); setSavedOnly(false); document.getElementById('marketplace')?.scrollIntoView({ behavior: 'smooth' }) }}><Icon name="search" size={20}/>Explore</button>
      <button className={mobileTab === 'sell' ? 'mobile-nav-sell active' : 'mobile-nav-sell'} onClick={() => { setMobileTab('sell'); if (user) setListingOpen(true); else { setAuthMode('signup'); setAuthOpen(true) } }}><span className="mobile-nav-sell-icon"><Icon name="plus" size={21}/></span>Sell</button>
      <button className={mobileTab === 'saved' ? 'active' : ''} onClick={() => { setMobileTab('saved'); setSavedOnly(true); document.getElementById('marketplace')?.scrollIntoView({ behavior: 'smooth' }); if (!favorites.length) setToast('Save a find with the heart button and it will appear here.') }}><Icon name="heart" size={20}/>Saved{favorites.length > 0 && <sup>{favorites.length}</sup>}</button>
      <button className={mobileTab === 'shop' ? 'active' : ''} onClick={() => { setMobileTab('shop'); if (user) void openDashboard(); else { setAuthMode('signin'); setAuthOpen(true) } }}><Icon name="shop" size={20}/>My shop</button>
    </nav>

    {selected && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setSelected(null) }}><section className="detail-modal" role="dialog" aria-modal="true" aria-label="Listing details"><button className="modal-close modal-back-button" onClick={() => setSelected(null)} aria-label="Go back"><Icon name="arrow"/></button><div className="detail-gallery"><img className="detail-image" src={selected.image_urls?.[selectedImageIndex] || img(selected)} alt={selected.title + (selected.image_urls?.length > 1 ? `, photo ${selectedImageIndex + 1}` : '')}/>{(selected.image_urls?.length ?? 0) > 1 && <div className="detail-thumbnails" aria-label="More listing photos">{selected.image_urls.map((url, index) => <button key={url} type="button" className={selectedImageIndex === index ? 'detail-thumbnail active' : 'detail-thumbnail'} onClick={() => setSelectedImageIndex(index)} aria-label={`Show photo ${index + 1}`} aria-pressed={selectedImageIndex === index}><img src={url} alt=""/></button>)}</div>}</div><div className="detail-content"><span className="detail-category">{selected.category}</span><h2>{selected.title}</h2><strong className="detail-price">{money(Number(selected.price_ngn))}</strong><p>{selected.description}</p><div className="detail-seller"><span className="vendor-avatar large">{selected.vendor?.logo_url ? <img src={selected.vendor.logo_url} alt=""/> : (selected.vendor?.shop_name?.[0] ?? 'L').toUpperCase()}</span><span><b>{selected.vendor?.shop_name ?? 'LCU seller'}</b><small>Lead City University · Ibadan</small>{selected.vendor?.id && ratingsQuery.data?.[selected.vendor.id] && <small className="seller-rating-detail">★ {ratingsQuery.data[selected.vendor.id].average.toFixed(1)} / 5 · {ratingsQuery.data[selected.vendor.id].count} verified review{ratingsQuery.data[selected.vendor.id].count === 1 ? '' : 's'}</small>}</span></div>{reviewsQuery.data && reviewsQuery.data.length > 0 && <section className="seller-reviews-preview"><h3>Recent buyer reviews</h3>{reviewsQuery.data.map(review => <article key={review.id}><span className="review-stars">{'★'.repeat(Number(review.rating))}{'☆'.repeat(5 - Number(review.rating))}</span><small>Verified handover · {new Date(review.created_at).toLocaleDateString('en-NG')}</small>{review.review_text && <p>{review.review_text}</p>}</article>)}</section>}<button className="whatsapp-button" onClick={() => { const phone = selected.vendor?.whatsapp_number; if (!phone) { setToast('Seller contact is not available yet.'); return } window.open('https://wa.me/' + phone + '?text=' + encodeURIComponent('Hi! I found "' + selected.title + '" on tradR. Is it still available?'), '_blank', 'noopener,noreferrer') }}><Icon name="message"/> Chat with seller on WhatsApp <Icon name="arrow"/></button>{selected.vendor?.profile_id === user?.id ? <p className="direct-note">This is your listing. The buyer must record the purchase from their own account.</p> : <button className="report-seller-button" onClick={() => void startTransaction(selected)} disabled={busy}>{busy ? 'Recording…' : 'I bought this'} <Icon name="check" size={15}/></button>}<small className="direct-note">Purchase confirmations are not payments. Both you and the seller must confirm the handover before a verified review is allowed. Always meet safely on campus.</small><button className="report-seller-button" onClick={() => beginReport(selected)}>Report this seller <Icon name="arrow" size={15}/></button></div></section></div>}

    {activityOpen && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setActivityOpen(false) }}><section className="form-modal activity-modal" role="dialog" aria-modal="true" aria-labelledby="activity-heading"><button className="modal-close modal-back-button" onClick={() => setActivityOpen(false)} aria-label="Go back"><Icon name="arrow"/></button><div className="modal-brand-mark">t<span>.</span></div><span className="eyebrow">YOUR TRADR ACTIVITY</span><h2 id="activity-heading">Activity & updates.</h2><p>Confirm only after the real handover. A review unlocks once both sides confirm, and each transaction can receive one buyer review.</p><section className="notification-panel" aria-label="Notifications"><div className="push-opt-in"><div><b>{pushEnabled ? 'Push notifications are on' : 'Get listing updates on your phone'}</b><small>{pushEnabled ? 'Get important shop and transaction updates on your phone.' : 'Enable alerts so you do not miss important shop updates.'}</small></div><button type="button" disabled={pushBusy || pushEnabled} onClick={() => void enablePushNotifications()}>{pushBusy ? 'Enabling…' : pushEnabled ? 'Enabled' : 'Enable alerts'}</button></div><div className="section-topline"><span>UPDATES{notifications.some(item => !item.read_at) ? ` · ${notifications.filter(item => !item.read_at).length} NEW` : ''}</span>{notifications.some(item => !item.read_at) && <button type="button" disabled={!!notificationBusyId} onClick={() => void markAllNotificationsRead()}>{notificationBusyId === 'all' ? 'Saving…' : 'Mark all read'}</button>}</div>{notifications.length ? <div className="notification-list">{notifications.map(item => <article className={item.read_at ? 'notification-item' : 'notification-item unread'} key={item.id}><div><b>{item.title}</b><p>{item.message}</p><small>{new Date(item.created_at).toLocaleString('en-NG', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</small></div>{!item.read_at && <button type="button" disabled={!!notificationBusyId} onClick={() => void markNotificationRead(item.id)}>{notificationBusyId === item.id ? 'Saving…' : 'Mark read'}</button>}</article>)}</div> : <div className="dashboard-empty"><b>You’re all caught up.</b><span>Important shop, listing, payment and transaction updates will appear here.</span></div>}</section><div className="transaction-list">{Array.isArray(transactionCards) ? transactionCards : transactionCards}</div><button className="confirmation-secondary" onClick={() => void openDashboard()}>Refresh activity</button></section></div>}

    {settingsOpen && <div className="modal-backdrop settings-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setSettingsOpen(false) }}><section className="form-modal settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-heading"><button className="modal-close modal-back-button" onClick={() => setSettingsOpen(false)} aria-label="Back from settings"><Icon name="arrow"/></button><div className="modal-brand-mark">t<span>.</span></div><span className="eyebrow">MAKE TRADR YOURS</span><h2 id="settings-heading">Settings.</h2><p>Manage how tradR looks and keep your account secure.</p><div className="settings-section"><span className="settings-section-label">APPEARANCE</span><div className="settings-row"><span className="settings-row-icon">{darkMode ? '☾' : '☀'}</span><span className="settings-row-copy"><b>Dark mode</b><small>{darkMode ? 'A darker look, easier on the eyes.' : 'Use the light tradR look.'}</small></span><button type="button" className={darkMode ? 'theme-switch is-on' : 'theme-switch'} role="switch" aria-checked={darkMode} aria-label="Toggle dark mode" onClick={() => setDarkMode(value => !value)}><span/></button></div></div><div className="settings-section"><span className="settings-section-label">ACCOUNT & SECURITY</span>{user ? <><div className="settings-account"><span className="settings-avatar">{(user.email?.[0] ?? 'U').toUpperCase()}</span><span><b>{user.email}</b><small>Signed in to tradR</small></span></div><button type="button" className="settings-action" onClick={() => { setSettingsOpen(false); setEmail(user.email ?? ''); setAuthMode('reset'); setAuthNotice('We’ll send a secure password-reset link to your email address.'); setAuthOpen(true) }}><span><b>Reset password</b><small>Get a secure password-reset link by email.</small></span><Icon name="arrow" size={17}/></button><button type="button" className="settings-action" onClick={() => { setSettingsOpen(false); void openDashboard() }}><span><b>My shop & activity</b><small>Manage listings, purchases and updates.</small></span><Icon name="arrow" size={17}/></button><button type="button" className="settings-signout" onClick={() => void signOut()}><Icon name="user" size={17}/> Sign out of tradR</button></> : <><div className="settings-account"><span className="settings-avatar"><Icon name="user" size={20}/></span><span><b>You’re browsing as a guest</b><small>Sign in to manage your shop and account.</small></span></div><button type="button" className="modal-primary" onClick={() => { setSettingsOpen(false); setAuthMode('signin'); setAuthOpen(true) }}>Log in to your account <Icon name="arrow"/></button></>}</div><div className="settings-section"><span className="settings-section-label">HELP</span><button type="button" className="settings-action" onClick={() => setToast('For account or safety help, contact tradR support at support@tradrr.store.')}><span><b>Help & support</b><small>Account, safety and marketplace assistance.</small></span><Icon name="arrow" size={17}/></button><p className="settings-version">tradR · Campus marketplace · Version 1.0</p></div></section></div>}

    {authOpen && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) closeModal() }}><section className="form-modal" role="dialog" aria-modal="true" aria-labelledby="auth-heading"><button className="modal-close modal-back-button" onClick={closeModal} aria-label="Go back"><Icon name="arrow"/></button><div className="modal-brand-mark">t<span>.</span></div><span className="eyebrow">{authMode === 'reset' ? 'ACCOUNT RECOVERY' : authMode === 'recovery' ? 'SECURE YOUR ACCOUNT' : 'COME ON IN'}</span><h2 id="auth-heading">{authMode === 'signup' ? 'Your people are here.' : authMode === 'signin' ? 'Good to have you back.' : authMode === 'reset' ? 'Forgot your password?' : 'Choose a new password.'}</h2><p>{authMode === 'signup' ? 'Make an account and get closer to the good stuff.' : authMode === 'signin' ? 'Sign in to pick up where you left off.' : authMode === 'reset' ? 'We’ll email you a secure link to reset your password.' : 'Use a new password with at least 8 characters.'}</p>{authNotice && <div className="auth-notice" role="status">{authNotice}</div>}<form onSubmit={authSubmit}>{authMode === 'signup' && <label>Your name<input value={name} onChange={e => setName(e.target.value)} required minLength={2} placeholder="What should we call you?"/></label>}<label>Email address<input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="you@example.com" autoComplete="email"/></label>{authMode !== 'reset' && <label>{authMode === 'recovery' ? 'New password' : 'Password'}<input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} placeholder="At least 8 characters" autoComplete={authMode === 'signup' || authMode === 'recovery' ? 'new-password' : 'current-password'}/></label>}<button className="modal-primary" disabled={busy}>{busy ? 'One sec…' : authMode === 'signup' ? 'Create my account' : authMode === 'signin' ? 'Log in' : authMode === 'reset' ? 'Send reset link' : 'Update password'} <Icon name="arrow"/></button></form>{authMode !== 'recovery' && <div className="modal-switch">{authMode === 'signup' ? 'Already part of the crew?' : authMode === 'signin' ? 'New around here?' : 'Remembered your password?'} <button onClick={() => { setAuthMode(authMode === 'signup' || authMode === 'reset' ? 'signin' : 'signup'); setAuthNotice(''); setPassword('') }}>{authMode === 'signup' ? 'Log in' : authMode === 'signin' ? 'Create an account' : 'Log in'}</button></div>}{authMode === 'signin' && <div className="modal-switch"><button onClick={() => { setAuthMode('reset'); setAuthNotice(''); setPassword('') }}>Forgot password?</button></div>}<small className="form-footnote">Use tradR responsibly and treat fellow students with respect.</small></section></div>}

    {vendorOnboardingOpen && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setVendorOnboardingOpen(false) }}><section className="form-modal" role="dialog" aria-modal="true" aria-labelledby="vendor-heading"><button className="modal-close modal-back-button" onClick={closeModal} aria-label="Go back"><Icon name="arrow"/></button><div className="modal-brand-mark">t<span>.</span></div><span className="eyebrow">YOUR LITTLE CORNER OF LCU</span><h2 id="vendor-heading">Set up your shop.</h2><p>Give campus buyers a name and a way to reach you. Your shop needs approval before listings go live.</p><form onSubmit={createVendor}><label>Shop or service name<input value={shopName} onChange={e => setShopName(e.target.value)} required minLength={2} maxLength={100} placeholder="e.g. Tomi Hair Studio"/></label><label>WhatsApp number<input type="tel" value={whatsapp} onChange={e => setWhatsapp(e.target.value)} required placeholder="08012345678"/><small className="field-hint">Only shared with buyers through your listing.</small></label><label>Short bio (optional)<textarea value={shopBio} onChange={e => setShopBio(e.target.value)} maxLength={600} rows={3} placeholder="What do you sell or help people with?"/></label><label>Shop picture or logo (optional)<input type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={e => { const files = Array.from(e.target.files ?? []); if (validateImageFiles(files, 1, 'shop logo')) setLogoFile(files[0] ?? null); e.currentTarget.value = '' }}/><small className="field-hint">JPG, PNG, WEBP or AVIF. Maximum 5 MB.</small>{logoPreviewUrl && <img className="upload-logo-preview" src={logoPreviewUrl} alt="Shop logo preview"/>}</label><button className="modal-primary" disabled={busy}>{busy ? 'Setting up…' : 'Create my shop'} <Icon name="arrow"/></button></form><small className="form-footnote">Your shop starts as pending review. We never fake payment or approval status.</small></section></div>}

    {dashboardOpen && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setDashboardOpen(false) }}><section className="form-modal dashboard-modal" role="dialog" aria-modal="true" aria-labelledby="dashboard-heading"><button className="modal-close modal-back-button" onClick={() => setDashboardOpen(false)} aria-label="Go back"><Icon name="arrow"/></button><div className="modal-brand-mark">t<span>.</span></div><span className="eyebrow">YOUR CAMPUS BUSINESS</span><h2 id="dashboard-heading">Your shop.</h2><button className="report-seller-button" type="button" onClick={() => setActivityOpen(true)}>Activity & updates{notifications.some(item => !item.read_at) ? ` · ${notifications.filter(item => !item.read_at).length} new` : ''} <Icon name="arrow" size={15}/></button><p>{vendorStatus === 'approved' ? 'Manage your live listings from one place. New listings publish immediately, and your shop subscription covers every listing.' : 'Your shop is waiting for admin approval. Once approved, you can publish listings immediately.'}</p><section className="shop-subscription-card"><div className="section-topline"><span>SHOP ACCESS</span><span>{shopSubscriptionActive ? 'SUBSCRIBED' : trialActive ? 'FREE TRIAL' : 'SUBSCRIPTION NEEDED'}</span></div>{shopSubscriptionActive ? <><b>Your whole shop is covered.</b><p>All approved listings are covered by your ₦500 monthly shop subscription.</p><small>Active until {new Date(shopSubscription.expires_at as string).toLocaleDateString('en-NG', { dateStyle: 'medium' })}</small></> : trialActive ? <><b>Welcome to tradR. Your first month is free.</b><p>Your entire shop is covered from account signup. List as many items as your shop limit allows during the trial, with no per-listing fees.</p><small>Your free trial ends {trialEndsAt?.toLocaleDateString('en-NG', { dateStyle: 'medium' })}.</small></> : <><b>Your free month has ended.</b><p>Subscribe for ₦500 per calendar month to keep your whole shop eligible for listings. One price for the entire shop, not per listing.</p>{vendorStatus !== 'approved' ? <small>Your shop must be approved before you can subscribe.</small> : paymentsEnabled ? <button className="modal-primary" type="button" disabled={paymentBusyId === 'shop'} onClick={() => void startShopPayment()}>{paymentBusyId === 'shop' ? 'Opening checkout…' : 'Subscribe for ₦500/month'} <Icon name="arrow"/></button> : <small>Shop subscription checkout will appear here once payment approval and verification are complete.</small>}</>}</section><section className="dashboard-transaction-section"><div className="section-topline"><span>PURCHASES & REVIEWS</span><button type="button" onClick={() => setActivityOpen(true)}>Open activity</button></div><div className="transaction-list">{transactionCards}</div></section><div className="listing-limit-notice"><b>{myListings.length} of 10 listings used</b><span>{myListings.length >= 10 ? 'You have reached your shop limit. Existing listings can still be managed.' : `${10 - myListings.length} listing slot${10 - myListings.length === 1 ? '' : 's'} remaining on your shop.`}</span>{myListings.length < 10 && vendorStatus === 'approved' && shopAccessActive && <button type="button" onClick={() => { setDashboardOpen(false); setListingOpen(true) }}>Create a listing <Icon name="arrow" size={15}/></button>}</div><div className="shop-branding-editor"><div className="shop-branding-current"><span className="vendor-avatar large">{vendorProfile?.logo_url ? <img src={vendorProfile.logo_url} alt="Current shop picture"/> : (vendorProfile?.shop_name?.[0] ?? 'S').toUpperCase()}</span><div><b>{vendorProfile?.shop_name}</b><small>Shop picture or logo</small></div></div><label>Change shop picture or logo<input type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={e => { const files = Array.from(e.target.files ?? []); if (validateImageFiles(files, 1, 'shop logo')) setLogoFile(files[0] ?? null); e.currentTarget.value = '' }}/><small className="field-hint">JPG, PNG, WEBP or AVIF, maximum 5 MB.</small></label>{logoPreviewUrl && <img className="upload-logo-preview" src={logoPreviewUrl} alt="New shop picture preview"/>}{logoFile && <button className="modal-primary" type="button" disabled={logoBusy} onClick={() => void saveVendorLogo()}>{logoBusy ? 'Uploading…' : 'Save shop picture'} <Icon name="arrow"/></button>}</div>{myListings.length ? <div className="dashboard-list">{myListings.map(item => { const active = item.status === 'published' && item.moderation_status === 'approved' && item.visible_until && Date.parse(item.visible_until) > Date.now(); const ready = vendorStatus === 'approved'; return <div className="dashboard-list-item" key={item.id}><div className="dashboard-list-copy"><b>{item.title}</b><small>{active ? 'Active until ' + new Date(item.visible_until as string).toLocaleDateString('en-NG') : vendorStatus === 'approved' ? shopAccessActive ? 'Ready to publish' : 'Shop subscription required' : 'Waiting for shop approval'}</small><span className="dashboard-list-actions"><button type="button" onClick={() => void beginEditListing(item)}>Edit</button><button type="button" className="danger-link" disabled={deletingListingId === item.id} onClick={() => void deleteListing(item)}>{deletingListingId === item.id ? 'Deleting…' : 'Delete'}</button></span></div><div className="dashboard-list-side">{active ? <span className="dashboard-status">ACTIVE</span> : ready ? shopAccessActive ? <span className="dashboard-status pending">{trialActive ? 'FREE TRIAL' : 'SHOP COVERED'}</span> : <span className="dashboard-status pending">SUBSCRIBE TO LIST</span> : <span className="dashboard-status pending">SHOP REVIEW</span>}</div></div> })}</div> : <div className="dashboard-empty"><b>No listings yet.</b><span>Once your shop is approved and covered, new listings go live immediately.</span>{vendorStatus === 'approved' && shopAccessActive && <button className="modal-primary" onClick={() => { setDashboardOpen(false); setListingOpen(true) }}>Create a listing <Icon name="arrow"/></button>}</div>}<small className="form-footnote">The free trial starts on your account signup date. After it ends, one verified ₦500 monthly shop subscription covers all listings.</small></section></div>}

    {listingOpen && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setListingOpen(false) }}><section className="form-modal listing-form-modal" role="dialog" aria-modal="true" aria-labelledby="listing-heading"><button className="modal-close modal-back-button" onClick={closeModal} aria-label="Go back"><Icon name="arrow"/></button><div className="modal-brand-mark">t<span>.</span></div><span className="eyebrow">{editingListingId ? 'KEEP IT UP TO DATE' : 'PUT IT OUT THERE'}</span><h2 id="listing-heading">{editingListingId ? 'Edit your listing.' : 'List something good.'}</h2><p>{editingListingId ? 'Update the details buyers see. Changes are reflected immediately while your shop is active.' : 'Publish directly to the LCU marketplace. Your shop must be approved and covered by its free trial or subscription.'}</p><form onSubmit={createListing}><label>What are you offering?<input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} required minLength={3} maxLength={120} placeholder="e.g. Freshly baked brownies"/></label><label>Category<select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} required><option value="">Choose a category</option>{categories.slice(1).map(([c]) => <option key={c} value={c}>{c}</option>)}</select></label><label>Price in naira<input type="number" min="0" value={form.price_ngn} onChange={e => setForm({ ...form, price_ngn: e.target.value })} required placeholder="e.g. 5000"/></label><label>Tell us a little more<textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} required minLength={10} maxLength={3000} rows={3} placeholder="What should a buyer know?"/></label>{editingListingId && existingListingImages.length > 0 && <div className="existing-listing-photos"><small>Current photos. Remove any you no longer want.</small><div className="upload-preview-grid">{existingListingImages.map((photo, index) => <div className="upload-preview-item" key={photo}><img src={photo} alt={`Current listing photo ${index + 1}`}/><button type="button" onClick={() => setExistingListingImages(current => current.filter(url => url !== photo))} aria-label={`Remove current photo ${index + 1}`}><Icon name="close" size={14}/></button></div>)}</div></div>}<label>{editingListingId ? 'Add more product photos (up to 4 new)' : 'Product photos (up to 4)'}<input type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple onChange={e => { const files = Array.from(e.target.files ?? []); if (validateImageFiles(files, 4, 'listing images')) setListingFiles(files); e.currentTarget.value = '' }}/><small className="field-hint">JPG, PNG, WEBP or AVIF. Up to 4 images, 5 MB each. Clear photos with the remove buttons before saving if you change your mind.</small></label>{listingPreviewUrls.length > 0 && <div className="upload-preview-grid">{listingPreviewUrls.map((url, index) => <div className="upload-preview-item" key={url}><img src={url} alt={`Listing photo ${index + 1} preview`}/><button type="button" onClick={() => setListingFiles(files => files.filter((_, fileIndex) => fileIndex !== index))} aria-label={`Remove photo ${index + 1}`}><Icon name="close" size={14}/></button></div>)}</div>}<button className="modal-primary" disabled={busy}>{busy ? 'Publishing…' : editingListingId ? 'Save changes' : 'Publish listing'} <Icon name="arrow"/></button></form><small className="form-footnote">{editingListingId ? 'Editing does not restart your shop subscription or extend its expiry date.' : 'Your listing appears immediately after publishing. Your first calendar month is free, then ₦500/month covers your whole shop.'}</small></section></div>}
    {adminOpen && db && <Suspense fallback={<div className="toast-message" role="status">Loading admin tools…</div>}><AdminPanel db={db} onClose={() => setAdminOpen(false)} /></Suspense>}
    {reportTarget && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget && !reportBusy) setReportTarget(null) }}><section className="form-modal report-form-modal" role="dialog" aria-modal="true" aria-labelledby="report-heading"><button className="modal-close modal-back-button" onClick={() => !reportBusy && setReportTarget(null)} aria-label="Go back"><Icon name="arrow"/></button><div className="modal-brand-mark">t<span>.</span></div><span className="eyebrow">BUYER SAFETY</span><h2 id="report-heading">Report a seller.</h2><p>Your report goes to the tradR review team, not the seller. Only you and authorized administrators can access your report and evidence.</p><div className="reporting-seller"><span className="vendor-avatar">{reportTarget.vendorName[0]?.toUpperCase() || 'S'}</span><div><b>{reportTarget.vendorName}</b><small>{reportTarget.listingTitle ? `Listing: ${reportTarget.listingTitle}` : 'Seller report'}</small></div></div><form onSubmit={submitSellerReport}><label>What happened?<select value={reportReason} onChange={e => setReportReason(e.target.value as ReportReason)} required><option value="non_delivery">Seller did not deliver</option><option value="suspected_scam">Suspected scam or fraud</option><option value="misleading_listing">Misleading product or listing</option><option value="harassment">Harassment or abusive behaviour</option><option value="other">Other concern</option></select></label><label>Explain the situation<textarea value={reportDetails} onChange={e => setReportDetails(e.target.value)} required minLength={20} maxLength={3000} rows={5} placeholder="Include dates, what was promised, what you paid, and any attempts to contact the seller."/><small className="field-hint">At least 20 characters. Be factual and include only information relevant to this report.</small></label><label>Evidence screenshots (up to 5)<input type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple onChange={e => { const files = Array.from(e.target.files ?? []); if (validateImageFiles(files, 5, 'evidence images')) setReportFiles(files); e.currentTarget.value = '' }}/><small className="field-hint">Optional but helpful: WhatsApp chats, receipts, transfer confirmations or other screenshots. JPG, PNG, WEBP or AVIF, up to 5 MB each. Evidence is stored privately.</small></label>{reportPreviewUrls.length > 0 && <div className="upload-preview-grid">{reportPreviewUrls.map((url, index) => <div className="upload-preview-item" key={url}><img src={url} alt={`Evidence screenshot ${index + 1} preview`}/><button type="button" onClick={() => setReportFiles(files => files.filter((_, fileIndex) => fileIndex !== index))} aria-label={`Remove evidence ${index + 1}`}><Icon name="close" size={14}/></button></div>)}</div>}<button className="modal-primary" disabled={reportBusy}>{reportBusy ? 'Submitting report…' : 'Submit report securely'} <Icon name="arrow"/></button></form><small className="form-footnote">Submitting a report does not automatically suspend a seller. Keep original messages and receipts in case the review team needs to verify details.</small></section></div>}

    {emailConfirmationLanding && <div className="confirmation-page" role="status" aria-labelledby="email-confirmation-title">
      <div className="confirmation-brand"><span className="brand-mark">t<span>.</span></span><span className="brand-word">tradR<span>.</span></span></div>
      <div className="confirmation-icon success"><Icon name="check" size={30}/></div>
      <span className="eyebrow">EMAIL CONFIRMED</span>
      <h1 id="email-confirmation-title">You’re verified!</h1>
      <p>Your email address has been confirmed and your tradR account is ready.</p>
      <div className="confirmation-detail"><span>WHAT’S NEXT?</span><strong>Return to the tradR app to sign in and continue exploring your campus marketplace.</strong></div>
      <small className="form-footnote">You can safely close this browser tab and switch back to tradR. Welcome aboard!</small>
    </div>}

    {paymentReturn && !authOpen && <div className="confirmation-page" role="dialog" aria-modal="true" aria-labelledby="payment-confirmation-title">
      <div className="confirmation-brand"><span className="brand-mark">t<span>.</span></span><span className="brand-word">tradR<span>.</span></span></div>
      <div className={`confirmation-icon ${paymentReturn.state}`}>{paymentReturn.state === 'succeeded' ? <Icon name="check" size={30}/> : paymentReturn.state === 'checking' ? <span className="confirmation-spinner"/> : paymentReturn.state === 'pending' ? <span className="confirmation-wait">…</span> : <Icon name="close" size={28}/>}</div>
      <span className="eyebrow">{paymentReturn.state === 'succeeded' ? 'PAYMENT CONFIRMED' : paymentReturn.state === 'checking' ? 'SECURE CHECK IN PROGRESS' : paymentReturn.state === 'pending' ? 'AWAITING CONFIRMATION' : paymentReturn.state === 'cancelled' ? 'CHECKOUT CANCELLED' : paymentReturn.state === 'failed' ? 'PAYMENT NOT COMPLETED' : 'PAYMENT STATUS UNAVAILABLE'}</span>
      <h1 id="payment-confirmation-title">{paymentReturn.state === 'succeeded' ? 'You’re all set.' : paymentReturn.state === 'checking' ? 'Checking your payment.' : paymentReturn.state === 'pending' ? 'Almost there.' : paymentReturn.state === 'cancelled' ? 'No worries.' : paymentReturn.state === 'failed' ? 'Payment didn’t go through.' : 'We couldn’t confirm it yet.'}</h1>
      <p>{paymentReturn.message || (paymentReturn.state === 'succeeded' ? paymentReturn.subscriptionType === 'shop_monthly' ? 'Your ₦500 shop subscription has been verified. Your whole shop is covered for one calendar month.' : 'Your ₦500 listing subscription has been verified.' : paymentReturn.state === 'checking' ? 'We’re checking the payment directly against our server records. Please keep this page open for a moment.' : 'We’re checking the payment status.')}</p>
      {paymentReturn.listingTitle && <div className="confirmation-detail"><span>LISTING</span><strong>{paymentReturn.listingTitle}</strong></div>}
      {paymentReturn.state === 'succeeded' && paymentReturn.expiresAt && <div className="confirmation-detail"><span>ACTIVE UNTIL</span><strong>{new Date(paymentReturn.expiresAt).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' })}</strong></div>}
      {paymentReturn.txRef && <small className="confirmation-reference">Reference ending · {paymentReturn.txRef.slice(-8)}</small>}
      <div className="confirmation-actions">
        {paymentReturn.state === 'checking' ? <button className="modal-primary" disabled>Checking securely… <span className="confirmation-spinner small"/></button> : paymentReturn.state === 'pending' || paymentReturn.state === 'cancelled' ? <button className="modal-primary" onClick={() => setPaymentRetry(value => value + 1)}>Check payment again <Icon name="arrow"/></button> : paymentReturn.state === 'error' && paymentReturn.txRef ? <button className="modal-primary" onClick={() => setPaymentRetry(value => value + 1)}>Try checking again <Icon name="arrow"/></button> : <button className="modal-primary" onClick={() => { setPaymentReturn(null); void openDashboard() }}>{paymentReturn.state === 'succeeded' ? 'Open My shop' : 'Return to My shop'} <Icon name="arrow"/></button>}
        {paymentReturn.state === 'pending' || paymentReturn.state === 'cancelled' || paymentReturn.state === 'error' ? <button className="confirmation-secondary" onClick={() => { if (!user) { setAuthMode('signin'); setAuthOpen(true) } else { setPaymentReturn(null); void openDashboard() } }}>{user ? 'Open My shop' : 'Sign in to check payment'}</button> : <button className="confirmation-secondary" onClick={() => setPaymentReturn(null)}>Back to marketplace</button>}
      </div>
      <small className="form-footnote">A checkout redirect alone does not count as payment. tradR activates subscriptions only after server-side verification.</small>
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
