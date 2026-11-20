// Better Lift push sidecar. PocketBase (pb_hooks/lib.js → push) POSTs { subscriptions, payload } to /send on
// localhost; this answers at once, sends the Web Push messages, and tells PocketBase which subscriptions are gone.
// Settings come from the environment (/etc/betterlift/push.env, see pb/deploy/betterlift-push.service).
import http from 'node:http'
import webpush from 'web-push'

const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, PUSH_SECRET } = process.env
const PORT = Number(process.env.PUSH_PORT || 8092)
const PB_URL = process.env.PB_URL || 'http://127.0.0.1:8090'
if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !PUSH_SECRET) {
  console.error('Missing VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY or PUSH_SECRET')
  process.exit(1)
}
webpush.setVapidDetails(VAPID_SUBJECT || 'mailto:admin@localhost', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

async function send(subscriptions, payload) {
  const body = JSON.stringify(payload)
  const gone = []
  await Promise.all(subscriptions.map(async (sub) => {
    try {
      await webpush.sendNotification(sub, body, { TTL: 86400, urgency: 'high', timeout: 10000 })
    } catch (err) {
      // 404/410: the device unsubscribed or the app was removed. Anything else is worth a log line.
      if (err.statusCode === 404 || err.statusCode === 410) gone.push(sub.endpoint)
      else console.error('push failed', err.statusCode || '', String(err.body || err.message).slice(0, 200))
    }
  }))
  if (gone.length) {
    await fetch(PB_URL + '/api/betterlift/push-gone', {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-push-secret': PUSH_SECRET }, body: JSON.stringify({ endpoints: gone }),
    }).catch((e) => console.error('could not report gone subscriptions', e.message))
  }
}

// Scheduled pushes (rest timers), by key. In memory: a sidecar restart drops pending ones, which is fine for rest timers.
const timers = new Map()
const MAX_DELAY = 3600 * 1000

http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') return res.end('ok')
  if (req.method !== 'POST' || (req.url !== '/send' && req.url !== '/cancel')) { res.statusCode = 404; return res.end() }
  if (req.headers['x-push-secret'] !== PUSH_SECRET) { res.statusCode = 403; return res.end() }
  let raw = ''
  req.on('data', (c) => { raw += c; if (raw.length > 1e6) req.destroy() })
  req.on('end', () => {
    let msg
    try { msg = JSON.parse(raw) } catch { res.statusCode = 400; return res.end() }
    res.statusCode = 202; res.end()
    const key = typeof msg.key === 'string' ? msg.key.slice(0, 100) : ''
    if (key && timers.has(key)) { clearTimeout(timers.get(key)); timers.delete(key) }
    if (req.url === '/cancel') return
    if (!Array.isArray(msg.subscriptions) || !msg.payload) return
    const go = () => send(msg.subscriptions.slice(0, 20), msg.payload).catch((e) => console.error(e))
    const delay = Number(msg.at) - Date.now()
    if (key && delay > 0 && delay <= MAX_DELAY) timers.set(key, setTimeout(() => { timers.delete(key); go() }, delay))
    else go()
  })
}).listen(PORT, '127.0.0.1', () => console.log(`push sidecar on 127.0.0.1:${PORT}`))
