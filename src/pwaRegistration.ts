import { registerSW } from 'virtual:pwa-register'

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
