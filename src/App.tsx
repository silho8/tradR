import { lazy, Suspense, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@supabase/supabase-js'
import InstallGuide from './InstallGuide'

const AdminPanel = lazy(() => import('./AdminPanel'))

const categories = [
  ['All finds', '✳'], ['Food & Drinks', '🥘'], ['Fashion & Thrift', '🧥'], ['Electronics', '🎧'],
  ['Beauty & Hair', '💅'], ['Books & Study Materials', '📚'], ['Tech Services', '💻'],
  ['Laundry & Cleaning', '🫧'], ['Accommodation', '🏡'], ['Other Services', '✦']
]
type Listing = { id: string; title: string; description: string; category: string; price_ngn: number; image_urls: string[]; created_at: string; vendor?: { id?: string; profile_id?: string; shop_name: string; bio?: string | null; whatsapp_number: string; logo_url?: string | null } | null }
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
const money = (n: number) => new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(n)
const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined
function decodeBase64Url(value: string) { const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4); return Uint8Array.from(atob(padded), char => char.charCodeAt(0)) }
type Confirmation = { kind: 'success' | 'info' | 'error'; eyebrow: string; title: string; message: string; detail?: string; primaryLabel: string; action: 'dismiss' | 'shop'; secondaryLabel?: string; shopSubmitted?: boolean }
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
  const [searchOpen, setSearchOpen] = useState(false)
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
  const [notificationFilter, setNotificationFilter] = useState<'all' | 'unread'>('all')
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
  const [shopName, setShopName] = useState('')
  const [shopNameEdit, setShopNameEdit] = useState('')
  const [shopNameBusy, setShopNameBusy] = useState(false)
  const [accountType, setAccountType] = useState<'buyer' | 'seller'>('buyer')
  const [shopBio, setShopBio] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [selected, setSelected] = useState<Listing | null>(null)
  const [shopPreview, setShopPreview] = useState<NonNullable<Listing['vendor']> | null>(null)
  const [shopPageId, setShopPageId] = useState<string | null>(() => window.location.pathname.match(/^\/shop\/([a-zA-Z0-9-]+)\/?$/)?.[1] ?? null)
  const [shopCategory, setShopCategory] = useState('All')
  const [selectedImageIndex, setSelectedImageIndex] = useState(0)
  const galleryTouchStart = useRef<number | null>(null)
  const [toast, setToast] = useState('')
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
  const [paymentReturn, setPaymentReturn] = useState<PaymentReturn | null>(null)
  const [paymentRetry, setPaymentRetry] = useState(0)
  const [authReady, setAuthReady] = useState(false)
  const [emailConfirmationLanding] = useState(() => window.location.pathname.replace(/\/+$/, '') === '/auth/confirmed')
  const [user, setUser] = useState<{ id: string; email?: string; role?: string; accountType?: string; created_at?: string } | null>(null)
  const [authMode, setAuthMode] = useState<'signup' | 'signin' | 'reset' | 'recovery'>(() => window.location.pathname.replace(/\/+$/, '') === '/auth/reset-password' ? 'recovery' : 'signup')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authNotice, setAuthNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ title: '', description: '', category: '', price_ngn: '' })
  // Seller access is currently free for every account. Billing can be re-enabled deliberately later.
  const shopAccessActive = true

  const query = useQuery({
    queryKey: ['listings'],
    queryFn: async () => {
      if (!db) return demoListings
      const { data, error } = await db.from('listings').select('id,title,description,category,price_ngn,image_urls,created_at,vendor:vendors(id,profile_id,shop_name,bio,whatsapp_number,logo_url)').eq('status', 'published').eq('moderation_status', 'approved').gt('visible_until', new Date().toISOString()).order('created_at', { ascending: false }).limit(60)
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

  const shopPageQuery = useQuery({
    queryKey: ['public-shop-page', shopPageId],
    enabled: !!db && !!shopPageId,
    queryFn: async () => {
      if (!db || !shopPageId) return null
      const { data: vendor, error: vendorError } = await db.from('vendors').select('id,shop_name,bio,whatsapp_number,logo_url,verification_status').eq('id', shopPageId).maybeSingle()
      if (vendorError) throw vendorError
      if (!vendor || vendor.verification_status !== 'approved') return null
      const [{ data, error }, { data: reviewData, error: reviewError }, { data: ratingData, error: ratingError }] = await Promise.all([
        db.from('listings').select('id,title,description,category,price_ngn,image_urls,created_at,vendor:vendors(id,profile_id,shop_name,bio,whatsapp_number,logo_url)').eq('vendor_id', shopPageId).eq('status', 'published').eq('moderation_status', 'approved').gt('visible_until', new Date().toISOString()).order('created_at', { ascending: false }).limit(60),
        db.from('seller_reviews').select('id,rating,review_text,created_at').eq('vendor_id', shopPageId).order('created_at', { ascending: false }).limit(6),
        db.from('seller_reviews').select('rating').eq('vendor_id', shopPageId)
      ])
      if (error) throw error
      if (reviewError) throw reviewError
      if (ratingError) throw ratingError
      const reviews = reviewData ?? []
      const allRatings = ratingData ?? []
      const rating = allRatings.length ? allRatings.reduce((sum, review) => sum + Number(review.rating), 0) / allRatings.length : null
      return { vendor: vendor as NonNullable<Listing['vendor']>, listings: (data ?? []) as unknown as Listing[], reviews, rating, reviewCount: allRatings.length }
    },
    staleTime: 30_000
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
      if (u) setUser({ id: u.id, email: u.email, created_at: u.created_at, role: typeof u.app_metadata?.role === 'string' ? u.app_metadata.role : undefined, accountType: typeof u.user_metadata?.account_type === 'string' ? u.user_metadata.account_type : undefined })
      setAuthReady(true)
    }).catch(() => setAuthReady(true))
    const { data } = db.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ? { id: session.user.id, email: session.user.email, created_at: session.user.created_at, role: typeof session.user.app_metadata?.role === 'string' ? session.user.app_metadata.role : undefined, accountType: typeof session.user.user_metadata?.account_type === 'string' ? session.user.user_metadata.account_type : undefined } : null)
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
  useEffect(() => {
    if (!db || !authReady || !user) { setNotifications([]); return }
    let cancelled = false
    const loadNotifications = async () => {
      const { data, error } = await db.from('notifications').select('id,kind,title,message,entity_type,entity_id,read_at,created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(40)
      if (error) { console.warn('Could not load tradR notifications:', error.message); return }
      if (!cancelled) setNotifications((data ?? []) as AppNotification[])
    }
    void loadNotifications()
    const channel = db.channel('tradr-notifications-' + user.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: 'user_id=eq.' + user.id }, () => { void loadNotifications() })
      .subscribe()
    return () => { cancelled = true; void db.removeChannel(channel) }
  }, [authReady, user?.id])

  useEffect(() => {
    const listingId = new URLSearchParams(window.location.search).get('listing')
    if (!listingId || !query.data) return
    const target = query.data.find(item => item.id === listingId)
    if (target) {
      setSelectedImageIndex(0)
      setSelected(target)
      setActivityOpen(false)
      const params = new URLSearchParams(window.location.search)
      params.delete('listing')
      const rest = params.toString()
      window.history.replaceState({}, '', window.location.pathname + (rest ? '?' + rest : '') + window.location.hash)
    }
  }, [query.data])

  useEffect(() => {
    if (!db || !authReady || !user || !('Notification' in window) || Notification.permission !== 'granted' || !('serviceWorker' in navigator) || !('PushManager' in window) || !vapidPublicKey) return
    let cancelled = false
    void (async () => {
      const registration = await navigator.serviceWorker.ready
      let subscription = await registration.pushManager.getSubscription()
      if (!subscription) subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodeBase64Url(vapidPublicKey) })
      if (cancelled) return
      const json = subscription.toJSON()
      const keys = json.keys
      if (!json.endpoint || !keys?.p256dh || !keys?.auth) throw new Error('Invalid browser push subscription.')
      const { error } = await db.from('push_subscriptions').upsert({ user_id: user.id, endpoint: json.endpoint, p256dh: keys.p256dh, auth: keys.auth, updated_at: new Date().toISOString() }, { onConflict: 'endpoint' })
      if (error) throw error
      if (!cancelled) setPushEnabled(true)
    })().catch(error => console.warn('Could not register tradR push notifications:', error))
    return () => { cancelled = true }
  }, [authReady, user?.id])
  useEffect(() => {
    if (!authReady || !user) return
    const params = new URLSearchParams(window.location.search)
    const openActivity = params.get('activity') === '1'
    const openShop = params.get('shop') === '1'
    if (!openActivity && !openShop) return
    params.delete('activity')
    params.delete('shop')
    const queryString = params.toString()
    window.history.replaceState({}, '', window.location.pathname + (queryString ? '?' + queryString : '') + window.location.hash)
    void openDashboard().then(() => { if (openActivity) setActivityOpen(true) })
  }, [authReady, user?.id])
  useEffect(() => {
    if (!db || !authReady || !user || user.accountType !== 'seller') return
    let cancelled = false
    void db.from('vendors').select('id').eq('profile_id', user.id).maybeSingle().then(({ data, error }) => {
      if (cancelled || error || data) return
      setVendorOnboardingOpen(true)
    })
    return () => { cancelled = true }
  }, [authReady, user?.id, user?.accountType])
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(''), 3200); return () => window.clearTimeout(timer) }, [toast])
  useEffect(() => { try { window.localStorage.setItem('tradr.theme.v1', darkMode ? 'dark' : 'light') } catch { /* Theme still applies for this session. */ } }, [darkMode])
  useEffect(() => { try { window.localStorage.setItem('tradr.saved-listings.v1', JSON.stringify(favorites)) } catch { /* Saved finds remain usable for this session if storage is unavailable. */ } }, [favorites])
  useEffect(() => {
    const urls = listingFiles.map(file => URL.createObjectURL(file))
    setListingPreviewUrls(urls)
    return () => urls.forEach(url => URL.revokeObjectURL(url))
  }, [listingFiles])
  useEffect(() => { setSelectedImageIndex(0) }, [selected?.id])
  useEffect(() => { const onPopState = () => setShopPageId(window.location.pathname.match(/^\/shop\/([a-zA-Z0-9-]+)\/?$/)?.[1] ?? null); window.addEventListener('popstate', onPopState); return () => window.removeEventListener('popstate', onPopState) }, [])
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
    const filtered = [...(query.data ?? [])].filter((l) => (!savedOnly || favorites.includes(l.id)) && (category === 'All finds' || l.category === category) && (!term || [l.title, l.description, l.category, l.vendor?.shop_name ?? ''].some((v) => v.toLowerCase().includes(term))))
    if (sort === 'price-low') return filtered.sort((a, b) => a.price_ngn - b.price_ngn)
    if (sort === 'price-high') return filtered.sort((a, b) => b.price_ngn - a.price_ngn)

    // Keep recent listings prominent, but round-robin seller buckets so a batch
    // from one shop cannot occupy the whole homepage feed.
    const newestFirst = filtered.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
    const sellerBuckets = new Map<string, Listing[]>()
    for (const listing of newestFirst) {
      const sellerKey = listing.vendor?.id ?? listing.vendor?.shop_name ?? listing.id
      const bucket = sellerBuckets.get(sellerKey) ?? []
      bucket.push(listing)
      sellerBuckets.set(sellerKey, bucket)
    }
    const mixed: Listing[] = []
    while (sellerBuckets.size) {
      for (const [sellerKey, bucket] of sellerBuckets) {
        const next = bucket.shift()
        if (next) mixed.push(next)
        if (!bucket.length) sellerBuckets.delete(sellerKey)
      }
    }
    return mixed
  }, [query.data, search, category, sort, savedOnly, favorites])

  async function authSubmit(e: FormEvent) {
    e.preventDefault()
    if (!db) { setToast('Supabase is not configured yet.'); return }
    setBusy(true)
    try {
      if (authMode === 'signup') {
        const { data, error } = await db.auth.signUp({ email, password, options: { data: { display_name: name.trim(), account_type: accountType }, emailRedirectTo: 'https://www.tradrr.store/auth/confirmed' } })
        if (error) throw error
        if (data.session) {
          setAuthOpen(false)
          if (accountType === 'seller') setVendorOnboardingOpen(true)
          else setConfirmation({ kind: 'success', eyebrow: 'ACCOUNT READY', title: 'You’re in.', message: 'Your tradR account has been created. You can explore the marketplace and find what you need.', primaryLabel: 'Explore tradR', action: 'dismiss' })
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

  async function saveVendorShopName() {
    if (!db || !user || !vendorProfile) return
    const nextName = shopNameEdit.trim()
    if (nextName.length < 2 || nextName.length > 100) { setToast('Shop name must be between 2 and 100 characters.'); return }
    setShopNameBusy(true)
    try {
      const { error } = await db.from('vendors').update({ shop_name: nextName }).eq('id', vendorProfile.id)
      if (error) throw error
      setVendorProfile({ ...vendorProfile, shop_name: nextName })
      setToast('Shop name updated.')
      await query.refetch()
    } catch (err) { setToast(err instanceof Error ? err.message : 'Could not update shop name.') }
    finally { setShopNameBusy(false) }
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
      if (!shopAccessActive) { setToast('Seller access is currently free on tradR.'); return }
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
        setConfirmation({ kind: 'success', eyebrow: 'LISTING PUBLISHED', title: 'You’re live.', message: 'Your listing is now visible to the LCU community. Seller access is currently free on tradR.', primaryLabel: 'Open My shop', action: 'shop', shopSubmitted: true })
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
        const { data, error } = await db.from('listings').select('id,title,description,category,price_ngn,image_urls,status,moderation_status,visible_until').eq('vendor_id', vendor.id).neq('status', 'archived').order('created_at', { ascending: false })
        if (error) throw error
        setMyListings(data ?? [])
      } else {
        setVendorStatus(null)
        setVendorProfile(null)
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
      if (permission !== 'granted') { setToast(permission === 'denied' ? 'Your browser has blocked notifications for this site. It will not let tradR show the permission prompt again unless you change that site permission.' : 'Notifications were not enabled. You can try again whenever you are ready.'); return }
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.getSubscription() ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodeBase64Url(vapidPublicKey) })
      const json = subscription.toJSON()
      const keys = json.keys
      if (!json.endpoint || !keys?.p256dh || !keys?.auth) throw new Error('Your browser did not provide a valid push subscription.')
      const { error } = await db.from('push_subscriptions').upsert({ user_id: user.id, endpoint: json.endpoint, p256dh: keys.p256dh, auth: keys.auth, updated_at: new Date().toISOString() }, { onConflict: 'endpoint' })
      if (error) throw error
      setPushEnabled(true)
      setToast('Notifications enabled. You’ll get one campus pick a day, plus important account updates.')
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

  async function requireShopBeforeListing() {
    if (!db || !user) { setAuthMode('signup'); setAuthOpen(true); return }
    try {
      const { data: vendor, error } = await db.from('vendors').select('id').eq('profile_id', user.id).maybeSingle()
      if (error) throw error
      if (!vendor) { setVendorOnboardingOpen(true); setToast('Create your shop first. You can list products after your shop is set up.'); return }
      setListingOpen(true)
    } catch (err) { setToast(err instanceof Error ? err.message : 'Could not check your shop. Please try again.') }
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
    const confirmed = window.confirm(`Delete “${item.title}” from your shop? It will disappear from the marketplace. Payment history is retained.`)
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
      setToast('Listing deleted from your shop.')
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Could not delete listing. Please try again.')
    } finally { setDeletingListingId(null) }
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
      setConfirmation({ kind: 'info', eyebrow: 'SHOP SUBMITTED', title: 'We’ve got your details.', message: 'Your shop profile and branding are saved and waiting for admin approval. Once approved, you can publish listings immediately with free seller access. Seller access is currently free.', primaryLabel: 'Open My shop', action: 'shop' })
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

  if (shopPageId) {
    const publicShop = shopPageQuery.data
    const shareUrl = window.location.origin + '/shop/' + shopPageId
    const shopCategories = ['All', ...Array.from(new Set((publicShop?.listings ?? []).map(item => item.category))).sort()]
    const shopListings = (publicShop?.listings ?? []).filter(item => shopCategory === 'All' || item.category === shopCategory)
    return <div className={darkMode ? 'app-shell theme-dark public-shop-page' : 'app-shell public-shop-page'} data-theme={darkMode ? 'dark' : 'light'}>
      <div className="public-shop-topbar"><a className="brand" href="/"><span className="brand-mark">t<span>.</span></span><span className="brand-word">tradR<span>.</span></span></a><a className="public-shop-back" href="/">Explore marketplace <Icon name="arrow" size={15}/></a></div>
      {shopPageQuery.isLoading ? <div className="public-shop-state"><span className="eyebrow">TRADR. SHOP</span><h1>Opening this shop…</h1><p>Just a moment while we fetch the latest listings.</p></div> : shopPageQuery.isError ? <div className="public-shop-state"><span className="eyebrow">A LITTLE HICCUP</span><h1>Couldn’t load this shop.</h1><p>Check your connection and try again.</p><button className="modal-primary" onClick={() => void shopPageQuery.refetch()}>Try again <Icon name="arrow"/></button></div> : !publicShop ? <div className="public-shop-state"><span className="eyebrow">SHOP NOT AVAILABLE</span><h1>We can’t find this shop.</h1><p>It may be awaiting approval or the link may be incorrect.</p><a className="modal-primary" href="/">Explore tradR. <Icon name="arrow"/></a></div> : <>
        <section className="public-shop-hero"><div className="public-shop-avatar">{publicShop.vendor.logo_url ? <img src={publicShop.vendor.logo_url} alt={publicShop.vendor.shop_name + ' logo'}/> : (publicShop.vendor.shop_name?.[0] ?? 'L').toUpperCase()}</div><span className="public-shop-verified"><Icon name="check" size={13}/> APPROVED LCU SHOP</span><h1>{publicShop.vendor.shop_name}</h1><p className="public-shop-location">Lead City University · Ibadan, Nigeria</p>{publicShop.vendor.bio?.trim() && <p className="public-shop-bio">{publicShop.vendor.bio}</p>}<div className="public-shop-proof">{publicShop.rating !== null && <span className="public-shop-rating">★ {publicShop.rating.toFixed(1)} <small>({publicShop.reviewCount} verified {publicShop.reviewCount === 1 ? 'review' : 'reviews'})</small></span>}<span><Icon name="check" size={13}/> Shop reviewed by tradR.</span><span><Icon name="pin" size={13}/> LCU community</span></div><div className="public-shop-actions"><button type="button" className="modal-primary" onClick={() => { void navigator.clipboard?.writeText(shareUrl).then(() => setToast('Shop link copied.')).catch(() => setToast('Could not copy the link on this browser.')) }}>Share shop <Icon name="arrow"/></button>{publicShop.vendor.whatsapp_number && <a className="public-shop-whatsapp" href={'https://wa.me/' + publicShop.vendor.whatsapp_number + '?text=' + encodeURIComponent('Hi! I found your shop on tradR.') } target="_blank" rel="noreferrer"><Icon name="message"/> Chat on WhatsApp</a>}</div></section>
        <section className="public-shop-listings"><div className="public-shop-listings-heading"><div><span className="eyebrow">THE SHOP FLOOR</span><h2>What’s <em>available.</em></h2></div><span>{shopListings.length} of {publicShop.listings.length} {publicShop.listings.length === 1 ? 'listing' : 'listings'}</span></div>{shopCategories.length > 2 && <div className="public-shop-category-filter" aria-label="Filter shop listings by category">{shopCategories.map(value => <button type="button" key={value} className={shopCategory === value ? 'active' : ''} onClick={() => setShopCategory(value)}>{value}</button>)}</div>}{shopListings.length ? <div className="listing-grid">{shopListings.map((item, i) => <article className="listing-card" key={item.id}><div className="listing-card-media"><img className="listing-image" src={img(item)} alt={item.title} loading={i > 3 ? 'lazy' : 'eager'}/></div><div className="listing-card-content"><div className="listing-meta"><span>{item.category}</span></div><h3 className="listing-title-static">{item.title}</h3><p className="public-shop-item-description">{item.description}</p><div className="listing-bottom"><strong>{money(Number(item.price_ngn))}</strong>{publicShop.vendor.whatsapp_number && <a href={'https://wa.me/' + publicShop.vendor.whatsapp_number + '?text=' + encodeURIComponent('Hi! I found “' + item.title + '” on your tradR shop. Is it still available?')} target="_blank" rel="noreferrer" aria-label={'Ask about ' + item.title}><Icon name="message"/></a>}</div></div></article>)}</div> : <div className="empty-state"><h3>{publicShop.listings.length ? 'Nothing in this category yet.' : 'No active listings yet.'}</h3><p>{publicShop.listings.length ? 'Choose another category to see more from this shop.' : 'Check back soon. This shop may add something new.'}</p></div>}</section>
        {publicShop.reviews.length > 0 && <section className="public-shop-reviews"><div className="public-shop-reviews-heading"><span className="eyebrow">FROM THE LCU COMMUNITY</span><h2>Good people say <em>good things.</em></h2><p>Reviews are only available after a completed, confirmed handover on tradR.</p></div><div className="public-shop-review-grid">{publicShop.reviews.map(review => <article key={review.id}><span className="public-shop-review-stars">{'★'.repeat(Number(review.rating))}{'☆'.repeat(5 - Number(review.rating))}</span>{review.review_text?.trim() ? <p>“{review.review_text}”</p> : <p>Verified purchase and handover.</p>}<small>{new Date(review.created_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })} · Verified review</small></article>)}</div></section>}
      </>}
      <footer className="public-shop-footer"><span>MADE FOR LEAD CITY</span><a href="/">Discover more on tradR. ↗</a></footer>{toast && <div className="toast-message" role="status">{toast}<button onClick={() => setToast('')} aria-label="Dismiss"><Icon name="close" size={16}/></button></div>}
    </div>
  }

  return <div className={darkMode ? 'app-shell theme-dark' : 'app-shell'} data-theme={darkMode ? 'dark' : 'light'}>
    <InstallGuide />
    <div className="announcement"><span className="announcement-dot" /> YOUR CAMPUS, YOUR COMMUNITY. <span>Made for LCU students.</span><b>↗</b></div>
    <header className="site-header">
      <a className="brand" href="#" onClick={() => { setCategory('All finds'); setSearch('') }}><span className="brand-mark">t<span>.</span></span><span className="brand-word">tradR<span>.</span></span></a>
      <button type="button" className="mobile-profile-button" onClick={() => { if (user) setActivityOpen(true); else { setAuthMode('signin'); setAuthOpen(true) } }} aria-label={user ? 'Open notifications' : 'Log in'}><span>{user ? (user.email?.[0] ?? 'U').toUpperCase() : <Icon name="user" size={19}/>}</span><small>{user ? 'Updates' : 'Sign in'}</small>{user && notifications.some(item => !item.read_at) && <sup className="notification-badge">{notifications.filter(item => !item.read_at).length > 9 ? '9+' : notifications.filter(item => !item.read_at).length}</sup>}</button>
      <div className="header-location"><Icon name="pin" size={17}/><span><b>Lead City University</b><small>Ibadan, Nigeria</small></span><span className="chevron">⌄</span></div>
      <button type="button" className="header-search search-launch" onClick={() => setSearchOpen(true)} aria-label="Open dedicated search"><Icon name="search" size={18}/><span>Search...</span><kbd>⌘ K</kbd></button>
      <nav className="header-actions">{user && <button type="button" className="notification-bell" onClick={() => { setActivityOpen(true); void openDashboard() }} aria-label={notifications.some(item => !item.read_at) ? `Notifications, ${notifications.filter(item => !item.read_at).length} unread` : 'Notifications'}><Icon name="bell" size={18}/>{notifications.some(item => !item.read_at) && <sup>{notifications.filter(item => !item.read_at).length > 9 ? '9+' : notifications.filter(item => !item.read_at).length}</sup>}</button>}<button className="nav-link" onClick={() => document.getElementById('marketplace')?.scrollIntoView({ behavior: 'smooth' })}>Explore</button><button className="nav-link" onClick={() => setToast(favorites.length ? favorites.length + ' finds saved.' : 'Tap a heart to save a find.')}>Saved <sup>{favorites.length || ''}</sup></button>{user?.role === 'admin' && <button className="nav-link" onClick={() => setAdminOpen(true)}>Admin</button>}{user && <button className="nav-link account-nav-link" onClick={() => setSettingsOpen(true)}>Account</button>}<button className="nav-link settings-nav-link" onClick={() => setSettingsOpen(true)}>Settings</button>{user ? <button className="login-button" onClick={() => void signOut()}>{(user.email?.[0] ?? 'U').toUpperCase()} · Sign out</button> : <button className="login-button" onClick={() => { setAuthMode('signin'); setAuthOpen(true) }}>Log in</button>}{user && <button className="shop-nav-button" onClick={() => void openDashboard()}>My shop <Icon name="arrow" size={14}/></button>}<button className="sell-button" onClick={() => void requireShopBeforeListing()}><Icon name="plus" size={17}/> Sell something</button></nav>
    </header>

    <main>
      <section className="mobile-home-panel" aria-label="Discover tradR">
        <div className="mobile-home-kicker"><span className="mobile-home-live-dot" /> YOUR LCU MARKETPLACE</div>
        <h1>What are we<br/>finding <em>today?</em></h1>
        <p>Good things, from people just around the corner.</p>
        <button type="button" className="mobile-home-search search-launch" onClick={() => setSearchOpen(true)}><Icon name="search" size={20}/><span>Search clothes, food, services...</span><span className="search-launch-arrow"><Icon name="arrow" size={18}/></span></button>
        <div className="mobile-home-section-label"><span>EXPLORE CATEGORIES</span><span>SWIPE →</span></div>
        <div className="mobile-home-categories">
          {categories.map(([label, emoji]) => <button key={label} className={category === label ? 'mobile-home-category active' : 'mobile-home-category'} onClick={() => { setCategory(label); setSavedOnly(false); setMobileTab('explore'); document.getElementById('marketplace')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }}><span>{emoji}</span><small>{label}</small></button>)}
        </div>
        <div className="mobile-home-trust"><span className="mobile-home-trust-mark">✳</span><span><b>Made for Lead City</b><small>Find it on campus. Connect directly.</small></span><span className="mobile-home-trust-arrow">↗</span></div>
      </section>
      <section className="hero">
        <div className="hero-copy"><div className="eyebrow"><span>✳</span> THE LCU MARKETPLACE</div><h1>Good finds.<br/>Great <em>people.</em></h1><p className="hero-subtitle">From your next favourite fit to that person who fixes everything. Find it right here on campus.</p>
          <button type="button" className="hero-search search-launch" onClick={() => setSearchOpen(true)}><Icon name="search" size={20}/><span>What are you looking for?</span><span className="hero-search-action">Find it <Icon name="arrow" size={17}/></span></button>
          <div className="hero-footnote"><span className="avatar-stack"><i>O</i><i>T</i><i>A</i><i>+</i></span><span><b>LCU people,</b> real deals.</span><span className="footnote-divider"/><span className="trust-stars">★★★★★</span><span>Built for campus life</span></div>
        </div>
        <div className="hero-art"><div className="hero-art-bg"/><div className="hero-sticker">THE GOOD<br/>STUFF IS<br/><b>CLOSE BY.</b><span>↘</span></div><div className="hero-photo hero-photo-main"><img src="/assets/seth-ebenezer-tetteh-DeqswsZEO3Y-unsplash.jpg" alt="Campus marketplace hero photo"/><span className="photo-label">STYLE FINDS <b>↗</b></span></div><div className="hero-photo hero-photo-small"><img src="https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=600&q=85" alt="Coffee on a table"/></div><div className="hero-floating-card"><span>✳</span><div><b>Something good</b><small>is always nearby</small></div><strong>↗</strong></div><div className="hero-art-caption">YOUR CAMPUS. YOUR PEOPLE. YOUR MARKET.</div></div>
        <div className="hero-bottomline"><span>01 / THE CAMPUS EDIT</span><i/><span>SCROLL TO EXPLORE ↓</span></div>
      </section>

      <section className="category-section"><div className="section-topline"><span>YOUR NEXT FIND IS IN HERE</span><span>01 — 09</span></div><div className="category-row">{categories.map(([label, emoji]) => <button key={label} className={category === label ? 'category-pill active' : 'category-pill'} onClick={() => { setCategory(label); document.getElementById('marketplace')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }}><span>{emoji}</span>{label}</button>)}</div></section>

      <section className="marketplace-section" id="marketplace"><div className="marketplace-heading"><div><div className="eyebrow"><span>✳</span> THE MARKETPLACE</div><h2>Find your <em>next thing.</em></h2><p>Shop what’s happening around campus, all in one place.</p></div><button className="outline-button" onClick={() => { setCategory('All finds'); setSearch(''); setSort('latest') }}>See everything <Icon name="arrow" size={17}/></button></div>
        <div className="market-toolbar"><div className="results-count"><span/> {query.isLoading ? 'Finding your next thing…' : listings.length + (listings.length === 1 ? ' find' : ' finds')} <i>/ at Lead City</i></div><div className="toolbar-actions"><label htmlFor="sort">Sort by</label><select id="sort" value={sort} onChange={e => setSort(e.target.value)}><option value="latest">Latest finds</option><option value="price-low">Price: low to high</option><option value="price-high">Price: high to low</option></select><button className="filter-button" onClick={() => setToast('Choose a category above to narrow your finds.')}><Icon name="sliders" size={17}/> Filters</button></div></div>
        {query.isError && <div className="inline-notice">We couldn’t reach the live marketplace. <button onClick={() => query.refetch()}>Try again</button></div>}
        {query.isLoading ? <div className="listing-grid">{[1,2,3,4].map(n => <div className="skeleton-card" key={n}><div/><span/><span/></div>)}</div> : listings.length ? <div className="listing-grid">{listings.map((l, i) => <article className="listing-card" key={l.id}><div className="listing-card-media"><button className="listing-image-button" onClick={() => setSelected(l)} aria-label={'View ' + l.title}><img className="listing-image" src={img(l)} alt={l.title} loading={i > 3 ? 'lazy' : 'eager'}/><span className="image-open"><Icon name="arrow"/></span></button><button className={favorites.includes(l.id) ? 'favorite-button is-favorite' : 'favorite-button'} onClick={() => setFavorites(old => old.includes(l.id) ? old.filter(x => x !== l.id) : [...old, l.id])} aria-label={favorites.includes(l.id) ? 'Remove saved listing' : 'Save listing'} aria-pressed={favorites.includes(l.id)}><Icon name="heart"/></button></div><div className="listing-card-content"><div className="listing-meta"><span>{l.category}</span></div><button className="listing-title" onClick={() => setSelected(l)}>{l.title}</button><div className="listing-vendor"><span className="vendor-avatar">{l.vendor?.logo_url ? <img src={l.vendor.logo_url} alt=""/> : (l.vendor?.shop_name?.[0] ?? 'L').toUpperCase()}</span><span>{l.vendor?.shop_name ?? 'LCU seller'}</span><i>·</i><span>LCU</span></div>{l.vendor?.id && ratingsQuery.data?.[l.vendor.id] && <div className="seller-rating" aria-label={`${ratingsQuery.data[l.vendor.id].average.toFixed(1)} out of 5 from ${ratingsQuery.data[l.vendor.id].count} verified reviews`}><span>★</span> {ratingsQuery.data[l.vendor.id].average.toFixed(1)} <small>({ratingsQuery.data[l.vendor.id].count})</small></div>}<div className="listing-bottom"><strong>{money(Number(l.price_ngn))}</strong><button onClick={() => setSelected(l)} aria-label={'View details for ' + l.title}><Icon name="arrow"/></button></div></div></article>)}</div> : <div className="empty-state"><span className="empty-icon"><Icon name="search" size={25}/></span><h3>No finds just yet.</h3><p>Try another search or category. Your next favourite thing is out there.</p><button className="outline-button" onClick={() => { setSearch(''); setCategory('All finds') }}>Clear filters</button></div>}
        <div className="marketplace-end"><span>THAT'S THE CAMPUS EDIT, FOR NOW.</span><b>✳</b><span>MORE GOOD THINGS COMING.</span></div>
      </section>

      <section className="seller-banner"><div className="seller-banner-mark">t<span>.</span></div><div className="seller-banner-copy"><span className="eyebrow">GOT SOMETHING GOOD?</span><h2>Your side hustle<br/>looks good <em>here.</em></h2><p>Put your product or service in front of the people who need it. Your next customer might be two blocks away.</p><button onClick={() => void requireShopBeforeListing()}>Start selling <Icon name="arrow" size={17}/></button></div><div className="seller-banner-art"><div className="seller-circle circle-one"/><div className="seller-circle circle-two"/><div className="seller-note note-one">YOUR<br/>THING.</div><div className="seller-note note-two">YOUR<br/>PEOPLE. <span>↗</span></div><div className="seller-banner-grid"/></div><div className="seller-banner-foot"><span>MADE FOR THE MAKERS.</span><span>LCU / IBADAN / NIGERIA</span></div></section>
      <section className="trust-strip"><div><span className="trust-icon">↗</span><span><b>Real campus connections</b><small>Find people who are right here.</small></span></div><div><span className="trust-icon">♡</span><span><b>Keep it direct</b><small>Talk to sellers on WhatsApp.</small></span></div><div><span className="trust-icon trust-lcu-icon"><img src="/assets/lead-city-university-logo.png" alt="Lead City University logo" /></span><span><b>Made for LCU</b><small>Your campus community, in one place.</small></span></div></section>
    </main>

    {searchOpen && <div className="search-page" role="dialog" aria-modal="true" aria-label="Search the marketplace"><div className="search-page-inner"><header className="search-page-header"><button type="button" className="search-back-button" onClick={() => setSearchOpen(false)} aria-label="Back to marketplace"><Icon name="arrow"/></button><div><span className="eyebrow">DISCOVER TRADR.</span><h2>Find your <em>thing.</em></h2></div></header><label className="search-page-input"><Icon name="search" size={21}/><input autoFocus value={search} onChange={e => { setSearch(e.target.value); setSavedOnly(false) }} placeholder="Search products, shops, categories..." aria-label="Search products and shops"/><button type="button" onClick={() => setSearch('')} aria-label="Clear search" disabled={!search}><Icon name="close"/></button></label><div className="search-page-categories"><span>QUICK CATEGORIES</span><div>{categories.map(([label, emoji]) => <button type="button" key={label} className={category === label ? 'active' : ''} onClick={() => { setCategory(label); setSavedOnly(false) }}>{emoji} {label}</button>)}</div></div><div className="search-page-results-head"><b>{search.trim() ? `Results for “${search.trim()}”` : category === 'All finds' ? 'Explore all finds' : category}</b><span>{query.isLoading ? 'Loading…' : `${listings.length} ${listings.length === 1 ? 'result' : 'results'}`}</span></div>{query.isLoading ? <div className="search-page-loading">Finding good things around campus…</div> : listings.length ? <div className="search-result-list">{listings.map(item => <button type="button" className="search-result-item" key={item.id} onClick={() => { setSearchOpen(false); setSelected(item) }}><img src={img(item)} alt="" loading="lazy"/><span className="search-result-copy"><small>{item.category}</small><b>{item.title}</b><span>{item.vendor?.shop_name ?? 'LCU seller'}</span></span><strong>{money(Number(item.price_ngn))}</strong><Icon name="arrow" size={17}/></button>)}</div> : <div className="search-page-empty"><span><Icon name="search" size={24}/></span><b>No matches yet.</b><p>Try a different word or browse another category.</p><button type="button" onClick={() => { setSearch(''); setCategory('All finds') }}>Clear search</button></div>}</div></div>}

    <footer className="site-footer"><a className="brand" href="#"><span className="brand-mark">t<span>.</span></span><span className="brand-word">tradR<span>.</span></span></a><span className="footer-note">GOOD FINDS TRAVEL FAST.</span><span className="footer-copy">© 2026 tradR.</span><span className="footer-made-for"><span>Made for</span><img src="/assets/lead-city-university-logo.png" alt="Lead City University" /></span><button onClick={() => setToast('For safety concerns, please contact the tradR admin team.')}>Safety & support ↗</button></footer>
    <nav className="mobile-bottom-nav" aria-label="Main navigation">
      <button className={mobileTab === 'home' ? 'active' : ''} onClick={() => { setMobileTab('home'); setSavedOnly(false); setCategory('All finds'); setSearch(''); window.scrollTo({ top: 0, behavior: 'smooth' }) }}><Icon name="home" size={20}/>Home</button>
      <button className={mobileTab === 'explore' ? 'active' : ''} onClick={() => { setMobileTab('explore'); setSavedOnly(false); setSearchOpen(true) }}><Icon name="search" size={20}/>Explore</button>
      <button className={mobileTab === 'sell' ? 'mobile-nav-sell active' : 'mobile-nav-sell'} onClick={() => { setMobileTab('sell'); void requireShopBeforeListing() }}><span className="mobile-nav-sell-icon"><Icon name="plus" size={21}/></span>Sell</button>
      <button className={mobileTab === 'saved' ? 'active' : ''} onClick={() => { setMobileTab('saved'); setSavedOnly(true); document.getElementById('marketplace')?.scrollIntoView({ behavior: 'smooth' }); if (!favorites.length) setToast('Save a find with the heart button and it will appear here.') }}><Icon name="heart" size={20}/>Saved{favorites.length > 0 && <sup>{favorites.length}</sup>}</button>
      <button className={mobileTab === 'shop' ? 'active' : ''} onClick={() => { setMobileTab('shop'); if (user) void openDashboard(); else { setAuthMode('signin'); setAuthOpen(true) } }}><Icon name="shop" size={20}/>My shop</button>
    </nav>

    {shopPreview && <div className="modal-backdrop shop-preview-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setShopPreview(null) }}><section className="shop-preview-modal" role="dialog" aria-modal="true" aria-label={`${shopPreview.shop_name} shop`}><button type="button" className="modal-close" onClick={() => setShopPreview(null)} aria-label="Close shop profile"><Icon name="close"/></button><header className="shop-preview-header"><span className="shop-preview-avatar">{shopPreview.logo_url ? <img src={shopPreview.logo_url} alt=""/> : (shopPreview.shop_name?.[0] ?? 'L').toUpperCase()}</span><div><span className="eyebrow">MEET THE SELLER</span><h2>{shopPreview.shop_name}</h2><small>Lead City University · Ibadan</small>{shopPreview.id && ratingsQuery.data?.[shopPreview.id] && <b className="shop-preview-rating">★ {ratingsQuery.data[shopPreview.id].average.toFixed(1)} · {ratingsQuery.data[shopPreview.id].count} verified review{ratingsQuery.data[shopPreview.id].count === 1 ? '' : 's'}</b>}</div></header>{shopPreview.bio?.trim() && <p className="shop-preview-bio">{shopPreview.bio}</p>}<div className="shop-preview-listings-head"><span>FROM THIS SHOP</span><b>{(query.data ?? []).filter(item => item.vendor?.id === shopPreview.id).length} listings</b></div>{(query.data ?? []).filter(item => item.vendor?.id === shopPreview.id).length ? <div className="shop-preview-grid">{(query.data ?? []).filter(item => item.vendor?.id === shopPreview.id).map(item => <button type="button" className="shop-preview-product" key={item.id} onClick={() => { setShopPreview(null); setSelectedImageIndex(0); setSelected(item) }}><img src={img(item)} alt="" loading="lazy"/><span><b>{item.title}</b><strong>{money(Number(item.price_ngn))}</strong></span></button>)}</div> : <p className="shop-preview-empty">This shop has no other active listings right now.</p>}<div className="shop-preview-actions"><button type="button" className="modal-primary" onClick={() => { if (shopPreview.id) { window.history.pushState({}, '', '/shop/' + shopPreview.id); setShopPageId(shopPreview.id); setShopPreview(null); void shopPageQuery.refetch() } }}>View full shop <Icon name="arrow"/></button><button type="button" className="shop-preview-share" onClick={() => { if (shopPreview.id) void navigator.clipboard?.writeText(window.location.origin + '/shop/' + shopPreview.id).then(() => setToast('Shop link copied.')).catch(() => setToast('Could not copy the link on this browser.')) }}>Copy shop link</button></div><small className="shop-preview-footnote">Listings shown are currently active on tradR.</small></section></div>}
    {selected && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setSelected(null) }}><section className="detail-modal" role="dialog" aria-modal="true" aria-label="Listing details"><button className="modal-close modal-back-button" onClick={() => setSelected(null)} aria-label="Go back"><Icon name="arrow"/></button><div className="detail-gallery"><div className="detail-image-stage" onTouchStart={e => { galleryTouchStart.current = e.touches[0]?.clientX ?? null }} onTouchEnd={e => { const start = galleryTouchStart.current; const end = e.changedTouches[0]?.clientX; galleryTouchStart.current = null; if (start !== null && end !== undefined && Math.abs(end - start) > 45) setSelectedImageIndex(index => Math.max(0, Math.min((selected.image_urls?.length ?? 1) - 1, index + (end < start ? 1 : -1)))) }}><img className="detail-image" src={selected.image_urls?.[selectedImageIndex] || img(selected)} alt={selected.title + (selected.image_urls?.length > 1 ? `, photo ${selectedImageIndex + 1}` : '')}/>{(selected.image_urls?.length ?? 0) > 1 && <><button type="button" className="gallery-arrow gallery-arrow-prev" onClick={() => setSelectedImageIndex(index => Math.max(0, index - 1))} disabled={selectedImageIndex === 0} aria-label="Previous photo"><Icon name="arrow"/></button><button type="button" className="gallery-arrow gallery-arrow-next" onClick={() => setSelectedImageIndex(index => Math.min((selected.image_urls?.length ?? 1) - 1, index + 1))} disabled={selectedImageIndex === (selected.image_urls?.length ?? 1) - 1} aria-label="Next photo"><Icon name="arrow"/></button><span className="gallery-count">{selectedImageIndex + 1} / {selected.image_urls.length}</span></>}</div>{(selected.image_urls?.length ?? 0) > 1 && <div className="detail-thumbnails" aria-label="More listing photos">{selected.image_urls.map((url, index) => <button key={url} type="button" className={selectedImageIndex === index ? 'detail-thumbnail active' : 'detail-thumbnail'} onClick={() => setSelectedImageIndex(index)} aria-label={`Show photo ${index + 1}`} aria-pressed={selectedImageIndex === index}><img src={url} alt=""/></button>)}</div>}</div><div className="detail-content"><span className="detail-category">{selected.category}</span><h2>{selected.title}</h2><strong className="detail-price">{money(Number(selected.price_ngn))}</strong><p>{selected.description}</p><div className="detail-seller"><span className="vendor-avatar large">{selected.vendor?.logo_url ? <img src={selected.vendor.logo_url} alt=""/> : (selected.vendor?.shop_name?.[0] ?? 'L').toUpperCase()}</span><span><button type="button" className="detail-shop-link" onClick={() => { if (selected.vendor?.id) { window.history.pushState({}, '', '/shop/' + selected.vendor.id); setShopPageId(selected.vendor.id); setShopPreview(null); setSelected(null); void shopPageQuery.refetch() } }} disabled={!selected.vendor?.id}>{selected.vendor?.shop_name ?? 'LCU seller'} <Icon name="arrow" size={12}/></button><small>Lead City University · Ibadan</small>{selected.vendor?.id && ratingsQuery.data?.[selected.vendor.id] && <small className="seller-rating-detail">★ {ratingsQuery.data[selected.vendor.id].average.toFixed(1)} / 5 · {ratingsQuery.data[selected.vendor.id].count} verified review{ratingsQuery.data[selected.vendor.id].count === 1 ? '' : 's'}</small>}</span></div>{reviewsQuery.data && reviewsQuery.data.length > 0 && <section className="seller-reviews-preview"><h3>Recent buyer reviews</h3>{reviewsQuery.data.map(review => <article key={review.id}><span className="review-stars">{'★'.repeat(Number(review.rating))}{'☆'.repeat(5 - Number(review.rating))}</span><small>Verified handover · {new Date(review.created_at).toLocaleDateString('en-NG')}</small>{review.review_text && <p>{review.review_text}</p>}</article>)}</section>}<button className="whatsapp-button" onClick={() => { const phone = selected.vendor?.whatsapp_number; if (!phone) { setToast('Seller contact is not available yet.'); return } window.open('https://wa.me/' + phone + '?text=' + encodeURIComponent('Hi! I found "' + selected.title + '" on tradR. Is it still available?'), '_blank', 'noopener,noreferrer') }}><Icon name="message"/> Chat with seller on WhatsApp <Icon name="arrow"/></button>{selected.vendor?.profile_id === user?.id ? <p className="direct-note">This is your listing. The buyer must record the purchase from their own account.</p> : <button className="report-seller-button" onClick={() => void startTransaction(selected)} disabled={busy}>{busy ? 'Recording…' : 'I bought this'} <Icon name="check" size={15}/></button>}<small className="direct-note">Purchase confirmations are not payments. Both you and the seller must confirm the handover before a verified review is allowed. Always meet safely on campus.</small><button className="report-seller-button" onClick={() => beginReport(selected)}>Report this seller <Icon name="arrow" size={15}/></button></div>{(query.data ?? []).some(item => item.id !== selected.id && item.category === selected.category && item.vendor?.id !== selected.vendor?.id) && <section className="related-listings"><div className="related-heading"><span>KEEP EXPLORING</span><b>More like this</b></div><div className="related-listings-row">{(query.data ?? []).filter(item => item.id !== selected.id && item.category === selected.category && item.vendor?.id !== selected.vendor?.id).slice(0, 4).map(item => <button type="button" className="related-listing-card" key={item.id} onClick={() => { setSelectedImageIndex(0); setSelected(item) }}><img src={img(item)} alt="" loading="lazy"/><span><small>{item.category}</small><b>{item.title}</b><strong>{money(Number(item.price_ngn))}</strong></span></button>)}</div></section>}</section></div>}

    {activityOpen && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setActivityOpen(false) }}><section className="form-modal activity-modal" role="dialog" aria-modal="true" aria-labelledby="activity-heading"><button className="modal-close modal-back-button" onClick={() => setActivityOpen(false)} aria-label="Go back"><Icon name="arrow"/></button><div className="modal-brand-mark">t<span>.</span></div><span className="eyebrow">YOUR TRADR ACTIVITY</span><h2 id="activity-heading">Activity & updates.</h2><p>Confirm only after the real handover. A review unlocks once both sides confirm, and each transaction can receive one buyer review.</p><section className="notification-panel" aria-label="Notifications"><div className="push-opt-in"><div><b>{pushEnabled ? 'Push notifications are on' : 'Get one campus pick a day, plus important shop updates.'}</b><small>{pushEnabled ? 'Your daily campus pick arrives once a day at a random daytime hour. Important account updates are separate.' : 'Allow notifications here. No need to turn them on later in Settings.'}</small></div><button type="button" disabled={pushBusy || pushEnabled} onClick={() => void enablePushNotifications()}>{pushBusy ? 'Enabling…' : pushEnabled ? 'Enabled' : 'Enable alerts'}</button></div><div className="section-topline"><span>UPDATES{notifications.some(item => !item.read_at) ? ` · ${notifications.filter(item => !item.read_at).length} NEW` : ''}</span><div className="notification-tools"><button type="button" onClick={() => setNotificationFilter(value => value === 'all' ? 'unread' : 'all')}>{notificationFilter === 'all' ? 'Unread only' : 'Show all'}</button>{notifications.some(item => !item.read_at) && <button type="button" disabled={!!notificationBusyId} onClick={() => void markAllNotificationsRead()}>{notificationBusyId === 'all' ? 'Saving…' : 'Mark all read'}</button>}</div></div>{notifications.filter(item => notificationFilter === 'unread' ? !item.read_at : true).length ? <div className="notification-list">{notifications.filter(item => notificationFilter === 'unread' ? !item.read_at : true).map(item => <article className={item.read_at ? 'notification-item' : 'notification-item unread'} key={item.id}><div><b>{item.title}</b><p>{item.message}</p><small>{new Date(item.created_at).toLocaleString('en-NG', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</small></div>{!item.read_at && <button type="button" disabled={!!notificationBusyId} onClick={() => void markNotificationRead(item.id)}>{notificationBusyId === item.id ? 'Saving…' : 'Mark read'}</button>}</article>)}</div> : <div className="dashboard-empty"><b>You’re all caught up.</b><span>Important shop, listing, payment and transaction updates will appear here.</span></div>}</section><div className="transaction-list">{Array.isArray(transactionCards) ? transactionCards : transactionCards}</div><button className="confirmation-secondary" onClick={() => { setNotificationFilter('all'); void openDashboard() }}>Refresh activity</button></section></div>}

    {settingsOpen && <div className="modal-backdrop settings-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setSettingsOpen(false) }}><section className="form-modal settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-heading"><button className="modal-close modal-back-button" onClick={() => setSettingsOpen(false)} aria-label="Back from settings"><Icon name="arrow"/></button><div className="modal-brand-mark">t<span>.</span></div><span className="eyebrow">MAKE TRADR YOURS</span><h2 id="settings-heading">Settings.</h2><p>Manage how tradR looks and keep your account secure.</p><div className="settings-section"><span className="settings-section-label">APPEARANCE</span><div className="settings-row"><span className="settings-row-icon">{darkMode ? '☾' : '☀'}</span><span className="settings-row-copy"><b>Dark mode</b><small>{darkMode ? 'A darker look, easier on the eyes.' : 'Use the light tradR look.'}</small></span><button type="button" className={darkMode ? 'theme-switch is-on' : 'theme-switch'} role="switch" aria-checked={darkMode} aria-label="Toggle dark mode" onClick={() => setDarkMode(value => !value)}><span/></button></div></div><div className="settings-section"><span className="settings-section-label">ACCOUNT & SECURITY</span>{user ? <><div className="settings-account"><span className="settings-avatar">{(user.email?.[0] ?? 'U').toUpperCase()}</span><span><b>{user.email}</b><small>Signed in to tradR</small></span></div><button type="button" className="settings-action" onClick={() => { setSettingsOpen(false); setEmail(user.email ?? ''); setAuthMode('reset'); setAuthNotice('We’ll send a secure password-reset link to your email address.'); setAuthOpen(true) }}><span><b>Reset password</b><small>Get a secure password-reset link by email.</small></span><Icon name="arrow" size={17}/></button><button type="button" className="settings-action" onClick={() => { setSettingsOpen(false); void openDashboard() }}><span><b>My shop & activity</b><small>Manage listings, purchases and updates.</small></span><Icon name="arrow" size={17}/></button><button type="button" className="settings-signout" onClick={() => void signOut()}><Icon name="user" size={17}/> Sign out of tradR</button></> : <><div className="settings-account"><span className="settings-avatar"><Icon name="user" size={20}/></span><span><b>You’re browsing as a guest</b><small>Sign in to manage your shop and account.</small></span></div><button type="button" className="modal-primary" onClick={() => { setSettingsOpen(false); setAuthMode('signin'); setAuthOpen(true) }}>Log in to your account <Icon name="arrow"/></button></>}</div><div className="settings-section"><span className="settings-section-label">HELP</span><button type="button" className="settings-action" onClick={() => setToast('For account or safety help, contact tradR support at support@tradrr.store.')}><span><b>Help & support</b><small>Account, safety and marketplace assistance.</small></span><Icon name="arrow" size={17}/></button><p className="settings-version">tradR · Campus marketplace · Version 1.0</p></div></section></div>}

    {authOpen && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) closeModal() }}><section className="form-modal" role="dialog" aria-modal="true" aria-labelledby="auth-heading"><button className="modal-close modal-back-button" onClick={closeModal} aria-label="Go back"><Icon name="arrow"/></button><div className="modal-brand-mark">t<span>.</span></div><span className="eyebrow">{authMode === 'reset' ? 'ACCOUNT RECOVERY' : authMode === 'recovery' ? 'SECURE YOUR ACCOUNT' : 'COME ON IN'}</span><h2 id="auth-heading">{authMode === 'signup' ? 'Your people are here.' : authMode === 'signin' ? 'Good to have you back.' : authMode === 'reset' ? 'Forgot your password?' : 'Choose a new password.'}</h2><p>{authMode === 'signup' ? 'Make an account and get closer to the good stuff. We’ll ask if you want one campus pick a day and important account updates.' : authMode === 'signin' ? 'Sign in to pick up where you left off. We’ll ask if you want to receive campus picks and important updates.' : authMode === 'reset' ? 'We’ll email you a secure link to reset your password.' : 'Use a new password with at least 8 characters.'}</p>{authNotice && <div className="auth-notice" role="status">{authNotice}</div>}<form onSubmit={authSubmit}>{authMode === 'signup' && <label>I'm here to<select value={accountType} onChange={e => setAccountType(e.target.value as 'buyer' | 'seller')}><option value="buyer">Buy and explore</option><option value="seller">Sell on tradR</option></select></label>}{authMode === 'signup' && <label>Your name<input value={name} onChange={e => setName(e.target.value)} required minLength={2} placeholder="What should we call you?"/></label>}<label>Email address<input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="you@example.com" autoComplete="email"/></label>{authMode !== 'reset' && <label>{authMode === 'recovery' ? 'New password' : 'Password'}<input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} placeholder="At least 8 characters" autoComplete={authMode === 'signup' || authMode === 'recovery' ? 'new-password' : 'current-password'}/></label>}<button className="modal-primary" disabled={busy}>{busy ? 'One sec…' : authMode === 'signup' ? 'Create my account' : authMode === 'signin' ? 'Log in' : authMode === 'reset' ? 'Send reset link' : 'Update password'} <Icon name="arrow"/></button></form>{authMode !== 'recovery' && <div className="modal-switch">{authMode === 'signup' ? 'Already part of the crew?' : authMode === 'signin' ? 'New around here?' : 'Remembered your password?'} <button onClick={() => { setAuthMode(authMode === 'signup' || authMode === 'reset' ? 'signin' : 'signup'); setAuthNotice(''); setPassword('') }}>{authMode === 'signup' ? 'Log in' : authMode === 'signin' ? 'Create an account' : 'Log in'}</button></div>}{authMode === 'signin' && <div className="modal-switch"><button onClick={() => { setAuthMode('reset'); setAuthNotice(''); setPassword('') }}>Forgot password?</button></div>}<small className="form-footnote">Use tradR responsibly and treat fellow students with respect.</small></section></div>}

    {vendorOnboardingOpen && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setVendorOnboardingOpen(false) }}><section className="form-modal" role="dialog" aria-modal="true" aria-labelledby="vendor-heading"><button className="modal-close modal-back-button" onClick={closeModal} aria-label="Go back"><Icon name="arrow"/></button><div className="modal-brand-mark">t<span>.</span></div><span className="eyebrow">YOUR LITTLE CORNER OF LCU</span><h2 id="vendor-heading">Set up your shop.</h2><p>Give campus buyers a name and a way to reach you. We’ll review your shop, then you can publish listings for free.</p><div className="seller-onboarding-note"><b>How selling works</b><span>1. Create your shop profile.</span><span>2. Wait for tradR. admin approval.</span><span>3. Add products and chat with buyers directly on WhatsApp.</span><strong>No subscription or listing fee. Seller access is free for now.</strong></div><form onSubmit={createVendor}><label>Shop or service name<input value={shopName} onChange={e => setShopName(e.target.value)} required minLength={2} maxLength={100} placeholder="e.g. Tomi Hair Studio"/></label><label>WhatsApp number<input type="tel" value={whatsapp} onChange={e => setWhatsapp(e.target.value)} required placeholder="08012345678"/><small className="field-hint">Only shared with buyers through your listing.</small></label><label>Short bio (optional)<textarea value={shopBio} onChange={e => setShopBio(e.target.value)} maxLength={600} rows={3} placeholder="What do you sell or help people with?"/></label><label>Shop picture or logo (optional)<input type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={e => { const files = Array.from(e.target.files ?? []); if (validateImageFiles(files, 1, 'shop logo')) setLogoFile(files[0] ?? null); e.currentTarget.value = '' }}/><small className="field-hint">JPG, PNG, WEBP or AVIF. Maximum 5 MB.</small>{logoPreviewUrl && <img className="upload-logo-preview" src={logoPreviewUrl} alt="Shop logo preview"/>}</label><button className="modal-primary" disabled={busy}>{busy ? 'Setting up…' : 'Create my shop'} <Icon name="arrow"/></button></form><small className="form-footnote">Your shop starts as pending review. We never fake payment or approval status.</small></section></div>}

    {dashboardOpen && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setDashboardOpen(false) }}><section className="form-modal dashboard-modal" role="dialog" aria-modal="true" aria-labelledby="dashboard-heading"><button className="modal-close modal-back-button" onClick={() => setDashboardOpen(false)} aria-label="Go back"><Icon name="arrow"/></button><div className="modal-brand-mark">t<span>.</span></div><span className="eyebrow">YOUR CAMPUS BUSINESS</span><h2 id="dashboard-heading">Your shop.</h2><button className="report-seller-button" type="button" onClick={() => setActivityOpen(true)}>Activity & updates{notifications.some(item => !item.read_at) ? ` · ${notifications.filter(item => !item.read_at).length} new` : ''} <Icon name="arrow" size={15}/></button>{vendorProfile?.id && <button className="report-seller-button" type="button" onClick={() => { const link = window.location.origin + '/shop/' + vendorProfile.id; void navigator.clipboard?.writeText(link).then(() => setToast('Your shop link is copied. Share it anywhere.')).catch(() => setToast('Could not copy the link on this browser.')) }}>Share my shop <Icon name="arrow" size={15}/></button>}<p>{vendorStatus === 'approved' ? 'Your shop is ready. Add your products, share them with campus buyers and manage every enquiry here.' : 'Your shop is in the review queue. You can get your photos and product details ready while the team reviews it.'}</p><section className="seller-starter-guide"><div className="section-topline"><span>THE SELLER STARTER GUIDE</span><span>{vendorStatus === 'approved' ? 'SHOP APPROVED' : 'STEP 1 OF 3'}</span></div><h3>{vendorStatus === 'approved' ? 'Let’s get your first buyer.' : 'You’re closer than you think.'}</h3><div className="seller-guide-steps"><article className="seller-guide-step"><span className="seller-guide-number">01</span><div><b>{vendorStatus === 'approved' ? 'Your shop is approved' : 'Get your shop approved'}</b><p>{vendorStatus === 'approved' ? 'Your shop can publish listings right away.' : 'We review each shop to keep the marketplace trustworthy. We’ll notify you when yours is approved.'}</p></div><span className="seller-guide-check">{vendorStatus === 'approved' ? '✓' : '…'}</span></article><article className="seller-guide-step"><span className="seller-guide-number">02</span><div><b>Post a clear first listing</b><p>Use bright, real photos. Give the item a specific name, fair price and honest description. Add up to four photos.</p></div></article><article className="seller-guide-step"><span className="seller-guide-number">03</span><div><b>Help buyers find you</b><p>Share tradR. with your course mates and WhatsApp status. Reply quickly and agree on a safe campus handover.</p></div></article></div>{vendorStatus === 'approved' && <button type="button" className="seller-guide-primary" onClick={() => { setDashboardOpen(false); setListingOpen(true) }}>Create your first listing <Icon name="arrow" size={15}/></button>}<button type="button" className="seller-guide-share" onClick={() => window.open('https://wa.me/?text=' + encodeURIComponent('I’m selling on tradR., the Lead City campus marketplace. Find products and services from our campus community at https://tradrr.store'), '_blank', 'noopener,noreferrer')}>Share tradR. on WhatsApp <Icon name="arrow" size={14}/></button></section><section className="shop-subscription-card"><div className="section-topline"><span>SELLER ACCESS</span><span>FREE FOR NOW</span></div><b>Your shop is free to use.</b><p>No subscription, no trial countdown, and no payment required. This applies to existing sellers and anyone who joins later.</p><small>Shop approval is still required before listings go live.</small></section><section className="dashboard-transaction-section"><div className="section-topline"><span>PURCHASES & REVIEWS</span><button type="button" onClick={() => setActivityOpen(true)}>Open activity</button></div><div className="transaction-list">{transactionCards}</div></section>{vendorStatus === 'approved' && shopAccessActive && <button type="button" className="seller-guide-primary" onClick={() => { setDashboardOpen(false); setListingOpen(true) }}>Create a listing <Icon name="arrow" size={15}/></button>}<div className="shop-branding-editor"><label>Shop name<input value={shopNameEdit || vendorProfile?.shop_name || ''} onChange={e => setShopNameEdit(e.target.value)} minLength={2} maxLength={100}/></label><button className="modal-primary" type="button" disabled={shopNameBusy || !shopNameEdit.trim() || shopNameEdit.trim() === vendorProfile?.shop_name} onClick={() => void saveVendorShopName()}>{shopNameBusy ? 'Saving…' : 'Save shop name'} <Icon name="arrow"/></button><div className="shop-branding-current"><span className="vendor-avatar large">{vendorProfile?.logo_url ? <img src={vendorProfile.logo_url} alt="Current shop picture"/> : (vendorProfile?.shop_name?.[0] ?? 'S').toUpperCase()}</span><div><b>{vendorProfile?.shop_name}</b><small>Shop picture or logo</small></div></div><label>Change shop picture or logo<input type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={e => { const files = Array.from(e.target.files ?? []); if (validateImageFiles(files, 1, 'shop logo')) setLogoFile(files[0] ?? null); e.currentTarget.value = '' }}/><small className="field-hint">JPG, PNG, WEBP or AVIF, maximum 5 MB.</small></label>{logoPreviewUrl && <img className="upload-logo-preview" src={logoPreviewUrl} alt="New shop picture preview"/>}{logoFile && <button className="modal-primary" type="button" disabled={logoBusy} onClick={() => void saveVendorLogo()}>{logoBusy ? 'Uploading…' : 'Save shop picture'} <Icon name="arrow"/></button>}</div>{myListings.length ? <div className="dashboard-list">{myListings.map(item => { const active = item.status === 'published' && item.moderation_status === 'approved' && item.visible_until && Date.parse(item.visible_until) > Date.now(); const ready = vendorStatus === 'approved'; return <div className="dashboard-list-item" key={item.id}><div className="dashboard-list-copy"><b>{item.title}</b><small>{active ? 'Live on the marketplace' : vendorStatus === 'approved' ? 'Ready to publish' : 'Waiting for shop approval'}</small><span className="dashboard-list-actions"><button type="button" onClick={() => void beginEditListing(item)}>Edit</button><button type="button" className="danger-link" disabled={deletingListingId === item.id} onClick={() => void deleteListing(item)}>{deletingListingId === item.id ? 'Deleting…' : 'Delete'}</button></span></div><div className="dashboard-list-side">{active ? <span className="dashboard-status">ACTIVE</span> : ready ? <span className="dashboard-status pending">READY</span> : <span className="dashboard-status pending">SHOP REVIEW</span>}</div></div> })}</div> : <div className="dashboard-empty"><b>No listings yet.</b><span>Once your shop is approved, new listings go live immediately. Seller access is free.</span>{vendorStatus === 'approved' && shopAccessActive && <button className="modal-primary" onClick={() => { setDashboardOpen(false); setListingOpen(true) }}>Create a listing <Icon name="arrow"/></button>}</div>}<small className="form-footnote">Seller access is currently free for all existing and new accounts. No trial countdown or subscription is required.</small></section></div>}

    {listingOpen && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setListingOpen(false) }}><section className="form-modal listing-form-modal" role="dialog" aria-modal="true" aria-labelledby="listing-heading"><button className="modal-close modal-back-button" onClick={closeModal} aria-label="Go back"><Icon name="arrow"/></button><div className="modal-brand-mark">t<span>.</span></div><span className="eyebrow">{editingListingId ? 'KEEP IT UP TO DATE' : 'PUT IT OUT THERE'}</span><h2 id="listing-heading">{editingListingId ? 'Edit your listing.' : 'List something good.'}</h2><p>{editingListingId ? 'Update the details buyers see. Changes are reflected immediately while your shop is approved.' : 'Publish directly to the LCU marketplace. Your shop must be approved. Seller access is currently free.'}</p><form onSubmit={createListing}><label>What are you offering?<input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} required minLength={3} maxLength={120} placeholder="e.g. Freshly baked brownies"/></label><label>Category<select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} required><option value="">Choose a category</option>{categories.slice(1).map(([c]) => <option key={c} value={c}>{c}</option>)}</select></label><label>Price in naira<input type="number" min="0" value={form.price_ngn} onChange={e => setForm({ ...form, price_ngn: e.target.value })} required placeholder="e.g. 5000"/></label><label>Tell us a little more<textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} required minLength={10} maxLength={3000} rows={3} placeholder="What should a buyer know?"/></label>{editingListingId && existingListingImages.length > 0 && <div className="existing-listing-photos"><small>Current photos. Remove any you no longer want.</small><div className="upload-preview-grid">{existingListingImages.map((photo, index) => <div className="upload-preview-item" key={photo}><img src={photo} alt={`Current listing photo ${index + 1}`}/><button type="button" onClick={() => setExistingListingImages(current => current.filter(url => url !== photo))} aria-label={`Remove current photo ${index + 1}`}><Icon name="close" size={14}/></button></div>)}</div></div>}<label>{editingListingId ? 'Add more product photos (up to 4 new)' : 'Product photos (up to 4)'}<input type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple onChange={e => { const files = Array.from(e.target.files ?? []); if (validateImageFiles(files, 4, 'listing images')) setListingFiles(files); e.currentTarget.value = '' }}/><small className="field-hint">JPG, PNG, WEBP or AVIF. Up to 4 images, 5 MB each. Clear photos with the remove buttons before saving if you change your mind.</small></label>{listingPreviewUrls.length > 0 && <div className="upload-preview-grid">{listingPreviewUrls.map((url, index) => <div className="upload-preview-item" key={url}><img src={url} alt={`Listing photo ${index + 1} preview`}/><button type="button" onClick={() => setListingFiles(files => files.filter((_, fileIndex) => fileIndex !== index))} aria-label={`Remove photo ${index + 1}`}><Icon name="close" size={14}/></button></div>)}</div>}<button className="modal-primary" disabled={busy}>{busy ? 'Publishing…' : editingListingId ? 'Save changes' : 'Publish listing'} <Icon name="arrow"/></button></form><small className="form-footnote">{editingListingId ? 'Editing does not restart your shop subscription or extend its expiry date.' : 'There is currently no seller subscription fee. Your shop can publish listings once approved.'}</small></section></div>}
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
      {confirmation.shopSubmitted && <a className="confirmation-whatsapp" href="https://wa.me/2348144364935?text=Hi%2C%20I%20just%20submitted%20my%20shop%20on%20tradR.%20Could%20you%20please%20help%20me%20with%20the%20review%3F" target="_blank" rel="noreferrer">Need a quicker follow-up? Message tradR on WhatsApp <Icon name="arrow" size={16}/></a>}
      {user && 'Notification' in window && Notification.permission === 'default' && <button className="confirmation-notifications" type="button" disabled={pushBusy} onClick={() => void enablePushNotifications()}>{pushBusy ? 'Enabling notifications…' : 'Turn on push notifications'} <Icon name="arrow" size={16}/><small>Tap to let your browser ask for notification access. You can receive shop approval alerts here.</small></button>}
      <div className="confirmation-actions">
        <button className="modal-primary" onClick={() => { setConfirmation(null); if (confirmation.action === 'shop') void openDashboard() }}>{confirmation.primaryLabel} <Icon name="arrow"/></button>
        <button className="confirmation-secondary" onClick={() => setConfirmation(null)}>{confirmation.secondaryLabel || 'Back to marketplace'}</button>
      </div>
      <small className="form-footnote">Keep your account details safe and contact tradR support if something does not look right.</small>
    </div>}

    {toast && !paymentReturn && !confirmation && <div className="toast-message" role="status"><span><Icon name="check" size={17}/></span>{toast}<button onClick={() => setToast('')} aria-label="Dismiss"><Icon name="close" size={16}/></button></div>}
  </div>
}
