import { useEffect, useMemo, useState } from 'react'

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
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

const seenKey = 'tradr.install-guide.seen.v1'

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
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null)
  const guide = useMemo(() => detectBrowser(), [])

  useEffect(() => {
    const ua = navigator.userAgent
    const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1)
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
      ('standalone' in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone))
    if (!isMobile || isStandalone || new URLSearchParams(window.location.search).has('payment')) return
    try {
      if (window.localStorage.getItem(seenKey) === '1') return
    } catch { /* If storage is blocked, the guide can still be used for this visit. */ }

    const onBeforeInstall = (event: Event) => {
      event.preventDefault()
      setInstallPrompt(event as InstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    setOpen(true)
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall)
  }, [])

  function closeGuide() {
    setOpen(false)
    try { window.localStorage.setItem(seenKey, '1') } catch { /* Ignore blocked storage. */ }
  }

  async function installNow() {
    if (!installPrompt) return
    try {
      await installPrompt.prompt()
      await installPrompt.userChoice
      setInstallPrompt(null)
      closeGuide()
    } catch {
      setInstallPrompt(null)
      setStep(0)
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
      <h2 id="install-guide-title">{step === 0 ? 'Make tradR feel like an app.' : step === 1 ? 'One tiny menu, that’s it.' : 'Your campus, one tap away.'}</h2>
      <p className="install-guide-copy">{steps[step].detail}</p>
      <div className="install-guide-progress" aria-label={`Step ${step + 1} of 3`}>
        {steps.map((item, index) => <span key={item.label} className={index === step ? 'active' : index < step ? 'complete' : ''} />)}
      </div>
      {installPrompt && <button className="install-guide-native" type="button" onClick={() => void installNow()}>Install tradR now <span>↗</span></button>}
      <div className="install-guide-actions">
        {step > 0 ? <button type="button" className="install-guide-back" onClick={() => setStep(value => value - 1)}>Back</button> : <button type="button" className="install-guide-back" onClick={closeGuide}>Not now</button>}
        <button type="button" className="install-guide-next" onClick={() => step < 2 ? setStep(value => value + 1) : closeGuide()}>{step < 2 ? 'Next step' : 'Let’s explore'} <span>↗</span></button>
      </div>
      <p className="install-guide-footnote">Free to add. No app store needed.</p>
    </section>
  </div>
}
