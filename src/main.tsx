import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import { ActiveProvider } from './lib/active'
import { NotificationsProvider } from './lib/notifications'
import { applyTheme, localTheme } from './lib/theme'
import './index.css'

applyTheme(localTheme())
registerSW({ immediate: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <ActiveProvider>
        <NotificationsProvider>
          <App />
        </NotificationsProvider>
      </ActiveProvider>
    </HashRouter>
  </StrictMode>,
)
