import { useEffect, useState } from 'react'
import { registerSW } from 'virtual:pwa-register'

export default function PWAUpdatePrompt() {
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [updateSW, setUpdateSW] = useState<((reloadPage?: boolean) => Promise<void>) | null>(null)

  useEffect(() => {
    let interval: number | undefined
    let focusHandler: (() => void) | undefined
    let visibilityHandler: (() => void) | undefined
    let pageShowHandler: (() => void) | undefined
    const applyUpdate = registerSW({
      immediate: true,
      onNeedRefresh() { setUpdateAvailable(true) },
      onRegisteredSW(_swUrl, registration) {
        if (!registration) return
        // Check periodically and whenever the app returns to the foreground.
        interval = window.setInterval(() => { void registration.update() }, 60 * 60 * 1000)
        focusHandler = () => { void registration.update() }
        window.addEventListener('focus', focusHandler)
        visibilityHandler = () => { if (document.visibilityState === 'visible') void registration.update() }
        pageShowHandler = () => { void registration.update() }
        document.addEventListener('visibilitychange', visibilityHandler)
        window.addEventListener('pageshow', pageShowHandler)
      }
    })
    setUpdateSW(() => applyUpdate)
    return () => {
      if (interval !== undefined) window.clearInterval(interval)
      if (focusHandler) window.removeEventListener('focus', focusHandler)
      if (visibilityHandler) document.removeEventListener('visibilitychange', visibilityHandler)
      if (pageShowHandler) window.removeEventListener('pageshow', pageShowHandler)
    }
  }, [])

  async function handleUpdate() {
    if (!updateSW || updating) return
    setUpdating(true)
    try { await updateSW(true) }
    catch { setUpdating(false) }
  }

  if (!updateAvailable) return null

  return (
    <aside className="pwa-update-banner" role="status" aria-live="polite">
      <span className="pwa-update-icon" aria-hidden="true">↻</span>
      <span className="pwa-update-copy"><strong>A new version is ready</strong><small>Update tradR. to get the latest improvements.</small></span>
      <button type="button" onClick={() => void handleUpdate()} disabled={updating}>{updating ? 'Updating…' : 'Update now'}</button>
    </aside>
  )
}
