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
registerSW({ immediate: true })
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
