import { useEffect, useMemo, useState } from 'react'

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

let deferredInstallPrompt: InstallPromptEvent | null = typeof window !== 'undefined'
  ? ((window as Window & { __tradrInstallPrompt?: InstallPromptEvent }).__tradrInstallPrompt ?? null)
  : null

// Capture Chrome's install event as early as the module loads. React effects can
// otherwise subscribe after the browser has already dispatched it.
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault()
    deferredInstallPrompt = event as InstallPromptEvent
    window.dispatchEvent(new Event('tradr-install-ready'))
  })
}

type BrowserGuide = {
  name: string
  menu: string
  action: string
  confirm: string
  menuIcon: string
  shareBased?: boolean
  inApp?: boolean
}

function detectBrowser(): BrowserGuide {
  const ua = navigator.userAgent
  const ios = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1)
  if (/Instagram|FBAN|FBAV|WhatsApp|TikTok|LinkedInApp/i.test(ua)) return {
    name: 'In-app browser',
    menu: 'Open this browser’s menu (look for ⋯, Share, or the menu icon).',
    action: 'Choose “Open in browser”, “Open in Chrome”, or “Open in Safari”. The wording depends on the app.',
    confirm: 'In Chrome or Safari, open the browser menu and choose “Install app” or “Add to Home Screen”.',
    menuIcon: '⋯',
    inApp: true,
  }
  if (ios && /CriOS/i.test(ua)) return {
    name: 'Chrome on iPhone',
    menu: 'Tap the Share icon in Chrome.',
    action: 'Choose “Add to Home Screen”. If you don’t see it, scroll the Share menu.',
    confirm: 'Tap “Add” in the top-right corner.',
    menuIcon: '↗',
    shareBased: true,
  }
  if (ios && /FxiOS/i.test(ua)) return {
    name: 'Firefox on iPhone',
    menu: 'Tap the Share button in Firefox.',
    action: 'Look for “Add to Home Screen” in the share options.',
    confirm: 'Tap “Add” to place tradR on your Home Screen.',
    menuIcon: '↗',
    shareBased: true,
  }
  if (ios && /EdgiOS/i.test(ua)) return {
    name: 'Edge on iPhone',
    menu: 'Open the Share menu in Edge.',
    action: 'Choose “Add to Home Screen” from the available actions.',
    confirm: 'Tap “Add” to finish.',
    menuIcon: '↗',
    shareBased: true,
  }
  if (ios) return {
    name: 'Safari on iPhone',
    menu: 'Tap the Share button at the bottom of Safari (the square with an arrow).',
    action: 'Scroll the menu and tap “Add to Home Screen”.',
    confirm: 'Keep the name tradR, then tap “Add” in the top-right.',
    menuIcon: '↗',
    shareBased: true,
  }
  if (/SamsungBrowser/i.test(ua)) return {
    name: 'Samsung Internet',
    menu: 'Tap the menu icon (☰) at the bottom or top of the browser.',
    action: 'Choose “Add page to”, then select “Home screen”.',
    confirm: 'Tap “Add” to place tradR beside your other apps.',
    menuIcon: '☰',
  }
  if (/EdgA|EdgiOS/i.test(ua)) return {
    name: 'Microsoft Edge',
    menu: 'Tap the menu (⋯) in the browser.',
    action: 'Choose “Add to phone” or “Add to Home screen”. The wording can vary by version.',
    confirm: 'Follow the prompt and tap “Add” or “Install”.',
    menuIcon: '⋯',
  }
  if (/Firefox/i.test(ua)) return {
    name: 'Firefox on Android',
    menu: 'Tap the three-dot menu (⋮).',
    action: 'Choose “Install” or “Add to Home screen”.',
    confirm: 'Confirm by tapping “Add” or “Install”.',
    menuIcon: '⋮',
  }
  if (/OPR|Opera/i.test(ua)) return {
    name: 'Opera',
    menu: 'Open the Opera menu.',
    action: 'Look for “Add to Home screen” or an install option.',
    confirm: 'Confirm the prompt to add tradR.',
    menuIcon: '☰',
  }
  if (/Chrome/i.test(ua) && /Android/i.test(ua)) return {
    name: 'Chrome on Android',
    menu: 'Tap the three-dot menu (⋮) at the top-right.',
    action: 'Tap “Install app” or “Add to Home screen”.',
    confirm: 'Tap “Install” or “Add” when the browser asks.',
    menuIcon: '⋮',
  }
  return {
    name: /Android/i.test(ua) ? 'Your Android browser' : 'Your mobile browser',
    menu: 'Open your browser’s menu.',
    action: 'Look for “Install app”, “Add to Home screen”, or a similar option.',
    confirm: 'Follow the browser’s confirmation prompt. The wording varies by browser.',
    menuIcon: '☰',
  }
}

export default function InstallGuide() {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState(0)
  const [tutorialOpen, setTutorialOpen] = useState(false)
  const [nativeStatus, setNativeStatus] = useState('')
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(() => deferredInstallPrompt)
  const [isIos, setIsIos] = useState(false)
  const guide = useMemo(() => detectBrowser(), [])

  useEffect(() => {
    const ua = navigator.userAgent
    const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1)
    const installedDisplayModes = ['standalone', 'fullscreen', 'minimal-ui', 'window-controls-overlay']
    const isStandalone = installedDisplayModes.some(mode => window.matchMedia(`(display-mode: ${mode})`).matches) ||
      ('standalone' in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone))
    if (!isMobile || isStandalone || new URLSearchParams(window.location.search).has('payment')) return
    setIsIos(/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1))

    const onInstallReady = () => {
      setInstallPrompt(deferredInstallPrompt)
      setNativeStatus('Your browser is ready to install tradR. Tap Install tradR to continue.')
    }
    const onAppInstalled = () => {
      deferredInstallPrompt = null
      ;(window as Window & { __tradrInstallPrompt?: InstallPromptEvent }).__tradrInstallPrompt = undefined
      setInstallPrompt(null)
      setOpen(false)
    }
    window.addEventListener('tradr-install-ready', onInstallReady)
    window.addEventListener('appinstalled', onAppInstalled)
    setOpen(true)
    return () => {
      window.removeEventListener('tradr-install-ready', onInstallReady)
      window.removeEventListener('appinstalled', onAppInstalled)
    }
  }, [])

  function closeGuide() {
    // Dismiss only for this page visit. Show the install reminder again next time
    // the site is opened in a browser, until it is running as an installed app.
    setOpen(false)
  }

  async function installNow() {
    if (isIos) {
      setNativeStatus('iPhone does not support the Android-style install popup. Use “How to install” to add tradR from Safari or Chrome’s share menu.')
      return
    }
    if (!installPrompt) {
      setNativeStatus('Your browser has not provided its native install prompt yet. Make sure you opened tradrr.store directly in an updated browser, then try again. You can still install manually using the guide.')
      return
    }
    try {
      const promptEvent = installPrompt
      await promptEvent.prompt()
      const choice = await promptEvent.userChoice
      deferredInstallPrompt = null
      ;(window as Window & { __tradrInstallPrompt?: InstallPromptEvent }).__tradrInstallPrompt = undefined
      setInstallPrompt(null)
      if (choice.outcome === 'accepted') {
        setNativeStatus('tradR is being added to your device.')
        closeGuide()
      } else {
        setNativeStatus('Installation was cancelled. You can tap Install tradR again if your browser offers it, or use the manual guide.')
      }
    } catch {
      deferredInstallPrompt = null
      ;(window as Window & { __tradrInstallPrompt?: InstallPromptEvent }).__tradrInstallPrompt = undefined
      setInstallPrompt(null)
      setNativeStatus('The browser could not open its install prompt. Please use the manual installation guide.')
    }
  }

  if (!open) return null

  const steps = guide.inApp ? [
    { label: 'Open the menu', detail: guide.menu, visual: guide.menuIcon },
    { label: 'Switch browsers', detail: guide.action, visual: '↗' },
    { label: 'Install tradR', detail: guide.confirm, visual: 't.' },
  ] : [
    { label: 'Open the menu', detail: guide.menu, visual: guide.menuIcon },
    { label: 'Add tradR', detail: guide.action, visual: '＋' },
    { label: 'You’re in', detail: guide.confirm, visual: 't.' },
  ]

  return <div className="install-guide-backdrop" role="presentation">
    <section className="install-guide" role="dialog" aria-modal="true" aria-labelledby="install-guide-title">
      <button className="install-guide-close" type="button" onClick={closeGuide} aria-label="Close install guide">×</button>
      <div className="install-guide-brand"><span className="install-guide-mark">t<span>.</span></span><span>tradR<span>.</span></span></div>
      <div className="install-guide-kicker">A LITTLE CAMPUS HACK</div>
      <div className="install-guide-visual" aria-hidden="true">
        <span className="install-guide-orbit install-guide-orbit-one" />
        <span className="install-guide-orbit install-guide-orbit-two" />
        <span className="install-guide-phone"><span className="install-guide-phone-camera" /><span className="install-guide-app-icon">t<span>.</span></span><small>tradR</small></span>
        <span className="install-guide-float">{steps[step].visual}</span>
      </div>
      <p className="install-guide-browser">{guide.name}</p>
      <h2 id="install-guide-title">Add tradR to your phone.</h2>
      <p className="install-guide-copy">Get quicker access to the Lead City student marketplace. Install tradR on your home screen and open it like an app.</p>
      <button className="install-guide-native" type="button" onClick={() => void installNow()}>{isIos ? 'Add tradR to Home Screen' : 'Install tradR'} <span>↓</span></button>
      {nativeStatus && <p className="install-guide-status" role="status">{nativeStatus}</p>}
      <button className="install-guide-manual" type="button" onClick={() => { setTutorialOpen(value => !value); setStep(0); setNativeStatus('') }}>{tutorialOpen ? 'Hide installation guide' : 'How to install manually'}</button>
      {tutorialOpen && <div className="install-guide-tutorial">
        <p className="install-guide-step-label">STEP {step + 1} OF 3 · {steps[step].label}</p>
        <p className="install-guide-copy">{steps[step].detail}</p>
        <div className="install-guide-progress" aria-label={`Step ${step + 1} of 3`}>
          {steps.map((item, index) => <span key={item.label} className={index === step ? 'active' : index < step ? 'complete' : ''} />)}
        </div>
        <div className="install-guide-actions">
          <button type="button" className="install-guide-back" onClick={() => step > 0 ? setStep(value => value - 1) : setTutorialOpen(false)}>{step > 0 ? 'Back' : 'Close guide'}</button>
          <button type="button" className="install-guide-next" onClick={() => step < 2 ? setStep(value => value + 1) : setTutorialOpen(false)}>{step < 2 ? 'Next step' : 'Done'} <span>↗</span></button>
        </div>
      </div>}
      <p className="install-guide-footnote">Free to add. No app store needed.</p>
    </section>
  </div>
}
