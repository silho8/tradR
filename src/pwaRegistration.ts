import { registerSW } from 'virtual:pwa-register'

type DeferredInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}
type InstallPromptWindow = Window & { __tradrInstallPrompt?: DeferredInstallPromptEvent }

// Capture Chrome's native install event before React mounts. The install guide
// consumes this event to open the real Android installation confirmation.
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    ;(window as InstallPromptWindow).__tradrInstallPrompt = event as DeferredInstallPromptEvent
    window.dispatchEvent(new Event('tradr-install-ready'))
  })
  window.addEventListener('appinstalled', () => {
    ;(window as InstallPromptWindow).__tradrInstallPrompt = undefined
  })
}

// Register before React mounts so the browser can establish service-worker
// control as early as possible on each tradR app origin.
const updateSW = typeof window !== 'undefined' && 'serviceWorker' in navigator
  ? registerSW({
      immediate: true,
      onNeedRefresh() {
        window.dispatchEvent(new Event('tradr-pwa-update-available'))
      },
      onRegisteredSW(_swUrl, registration) {
        if (!registration) return
        const checkForUpdate = () => { void registration.update() }
        window.setInterval(checkForUpdate, 60 * 60 * 1000)
        window.addEventListener('focus', checkForUpdate)
        window.addEventListener('pageshow', checkForUpdate)
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') checkForUpdate()
        })
      },
    })
  : null

export async function applyPwaUpdate() {
  if (updateSW) await updateSW(true)
}
