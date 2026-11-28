import { useEffect, useState } from 'react'
import { applyPwaUpdate } from './pwaRegistration'

export default function PWAUpdatePrompt() {
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [updating, setUpdating] = useState(false)

  useEffect(() => {
    const onUpdateAvailable = () => setUpdateAvailable(true)
    window.addEventListener('tradr-pwa-update-available', onUpdateAvailable)
    return () => window.removeEventListener('tradr-pwa-update-available', onUpdateAvailable)
  }, [])

  async function handleUpdate() {
    if (updating) return
    setUpdating(true)
    try {
      await applyPwaUpdate()
    } catch {
      setUpdating(false)
    }
  }

  if (!updateAvailable) return null

  const path = window.location.pathname.endsWith('/')
    ? window.location.pathname.slice(0, -1)
    : window.location.pathname
  const host = window.location.hostname.toLowerCase()
  const appLabel = host === 'errand.tradrr.store' || path === '/errand'
    ? 'Errand'
    : host === 'admin.tradrr.store' || path === '/admin'
      ? 'tradR Admin'
      : 'tradR.'

  return (
    <aside className="pwa-update-banner" role="status" aria-live="polite">
      <span className="pwa-update-icon" aria-hidden="true">↻</span>
      <span className="pwa-update-copy"><strong>A new version is ready</strong><small>Update {appLabel} to get the latest improvements.</small></span>
      <button type="button" onClick={() => void handleUpdate()} disabled={updating}>{updating ? 'Updating…' : 'Update now'}</button>
    </aside>
  )
}
