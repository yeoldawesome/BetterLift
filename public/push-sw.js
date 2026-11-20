// Push notifications + app-icon badge. Loaded into the generated service worker via workbox importScripts
// (see vite.config.ts). The server sends: { title, body, path, badge, tag }.

self.addEventListener('push', (event) => {
  let d = {}
  try { d = event.data ? event.data.json() : {} } catch (_) { d = { body: event.data && event.data.text() } }
  const badge = Number(d.badge) || 0
  event.waitUntil(Promise.all([
    self.registration.showNotification(d.title || 'Better Lift', {
      body: d.body || '',
      icon: '/pwa-192.png',
      badge: '/pwa-192.png',
      tag: d.tag || undefined,
      data: { path: d.path || '/' },
    }),
    // Red number on the home-screen icon (iOS 16.4+ home-screen apps, Android/desktop installed apps).
    'setAppBadge' in self.navigator
      ? (badge > 0 ? self.navigator.setAppBadge(badge) : self.navigator.clearAppBadge()).catch(() => {})
      : Promise.resolve(),
  ]))
})

// Tapping a notification opens the app on the right screen (reusing an open window if there is one).
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL('/#' + (event.notification.data && event.notification.data.path || '/'), self.location.origin).href
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const w of wins) {
      if (new URL(w.url).origin === self.location.origin) {
        await w.focus()
        return w.navigate ? w.navigate(url).catch(() => w.postMessage({ type: 'open', path: event.notification.data.path })) : undefined
      }
    }
    return self.clients.openWindow(url)
  })())
})
