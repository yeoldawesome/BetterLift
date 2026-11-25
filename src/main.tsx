import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import { DialogHost } from './components/Dialog'
import { ActiveProvider } from './lib/active'
import { NotificationsProvider } from './lib/notifications'
import { applyTheme, localTheme } from './lib/theme'
import './index.css'

applyTheme(localTheme())
// New versions: the app checks when it opens, but an installed iPhone app mostly resumes from the background and would
// keep running the old copy. So also check every time it comes back to the screen (and every 30 minutes while open);
// when a new version is found it installs and the page reloads into it (autoUpdate).
registerSW({
  immediate: true,
  onRegisteredSW(_url, reg) {
    if (!reg) return
    let last = 0
    const check = () => {
      if (Date.now() - last < 60_000 || !navigator.onLine) return
      last = Date.now()
      reg.update().catch(() => {})
    }
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check() })
    addEventListener('focus', check)
    addEventListener('online', check)
    setInterval(check, 30 * 60_000)
  },
})
// iOS ignores user-scalable=no for pinches: block the pinch gesture itself.
for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false })
document.addEventListener('touchmove', (e) => { if (e.touches.length > 1) e.preventDefault() }, { passive: false })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <ActiveProvider>
        <NotificationsProvider>
          <App />
          <DialogHost />
        </NotificationsProvider>
      </ActiveProvider>
    </HashRouter>
  </StrictMode>,
)
