import { me, pb } from './pb'

/**
 * Phone/desktop push notifications. On iPhone this only works once the app is added to the Home Screen (iOS 16.4+);
 * the subscription is stored in `push_subscriptions` and the server pushes every new in-app notification to it.
 */
export type PushState = 'unsupported' | 'needs-install' | 'denied' | 'off' | 'on'

const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

async function registration() {
  return navigator.serviceWorker.ready
}

export async function pushState(): Promise<PushState> {
  if (!supported()) return isIos() && !isStandalone() ? 'needs-install' : 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  const sub = await (await registration()).pushManager.getSubscription()
  return sub && Notification.permission === 'granted' ? 'on' : 'off'
}

function keyBytes(base64url: string) {
  const b64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
}

async function save(sub: PushSubscription) {
  const j = sub.toJSON()
  await pb.collection('push_subscriptions').create({ user: me(), endpoint: sub.endpoint, p256dh: j.keys?.p256dh, auth: j.keys?.auth, ua: navigator.userAgent.slice(0, 200) })
}

/** Must be called from a tap (browsers only show the permission prompt in response to one). */
export async function enablePush(): Promise<PushState> {
  if (!supported()) return pushState()
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') return perm === 'denied' ? 'denied' : 'off'
  const { key } = await pb.send<{ key: string }>('/api/betterlift/push-key', {})
  if (!key) throw new Error("Push notifications aren't set up on the server yet.")
  const reg = await registration()
  let sub = await reg.pushManager.getSubscription()
  // A subscription made with a different server key can't receive our pushes: replace it.
  const old = sub?.options.applicationServerKey
  if (sub && old && btoa(String.fromCharCode(...new Uint8Array(old))) !== btoa(String.fromCharCode(...keyBytes(key)))) { await sub.unsubscribe(); sub = null }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) })
  await save(sub)
  return 'on'
}

/** Stop pushes to this device (also used on log out, so the next person on this phone doesn't get yours). */
export async function disablePush(): Promise<void> {
  if (!supported()) return
  const sub = await (await registration()).pushManager.getSubscription().catch(() => null)
  if (!sub) return
  if (pb.authStore.isValid) {
    await pb.collection('push_subscriptions').getFirstListItem(pb.filter('endpoint = {:e}', { e: sub.endpoint }))
      .then((r) => pb.collection('push_subscriptions').delete(r.id)).catch(() => {})
  }
  await sub.unsubscribe().catch(() => {})
}

/** Keep the server's copy of this device's subscription current (browsers occasionally rotate it). */
export async function refreshPush(): Promise<void> {
  if (!supported() || Notification.permission !== 'granted' || !pb.authStore.isValid) return
  const sub = await (await registration()).pushManager.getSubscription()
  if (sub) await save(sub).catch(() => {}) // the server ignores a subscription it already has
}

/** The red number on the home-screen icon. */
export function setBadge(count: number) {
  const n = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> }
  if (!n.setAppBadge) return
  ;(count > 0 ? n.setAppBadge(count) : n.clearAppBadge?.())?.catch(() => {})
}
