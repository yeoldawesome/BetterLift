import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import '../../scripts/env.mjs'
import { STATE_FILE, type Seed } from './fixtures'

/**
 * Creates two throwaway users who are friends, plus a public workout for the friend so there's something to react to.
 * Everything is deleted again in global-teardown (deleting the users cascades to their data).
 */
export default async function setup() {
  const api = process.env.VITE_API_URL || 'http://127.0.0.1:8090'
  const call = async (path: string, init: RequestInit & { token?: string; json?: unknown } = {}) => {
    const headers: Record<string, string> = { ...(init.token ? { Authorization: init.token } : {}) }
    if (init.json !== undefined) headers['content-type'] = 'application/json'
    const r = await fetch(api + '/api' + path, { ...init, headers, body: init.json !== undefined ? JSON.stringify(init.json) : init.body })
    const body = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(`${init.method || 'GET'} ${path} -> ${r.status} ${JSON.stringify(body)}`)
    return body
  }
  try { await fetch(api + '/api/health') } catch { throw new Error(`PocketBase isn't running at ${api}. Start it with: powershell -File pb\\start-local.ps1`) }

  const tag = Math.random().toString(36).slice(2, 8)
  const password = 'iphone-test-123'
  const created: string[] = []
  // The API hides email addresses, so keep the one we generated.
  const mk = async (who: string) => {
    const email = `iphone_${who}_${tag}@test.local`
    const u = await call('/collections/users/records', { method: 'POST', json: {
      email, password, passwordConfirm: password, username: `iphone_${who}_${tag}`,
      name: who === 'me' ? 'iPhone Tester' : 'Test Friend', nutrition_on: who === 'me', nutrition_seen: who === 'me', bodyweight_kg: 80, height_cm: 180, sex: 'male', unit: 'lb',
    } })
    created.push(u.id)
    return { ...u, email }
  }
  const login = (email: string) => call('/collections/users/auth-with-password', { method: 'POST', json: { identity: email, password } })
  try {
  const me = await mk('me'), friend = await mk('friend')
  // New accounts must verify their email before using the app; mark the test users verified (as the admin), and
  // answered the notifications prompt, so tests open straight into the app.
  const su = await call('/collections/_superusers/auth-with-password', { method: 'POST', json: { identity: process.env.PB_ADMIN_EMAIL, password: process.env.PB_ADMIN_PASSWORD } })
  for (const u of [me, friend]) await call(`/collections/users/records/${u.id}`, { method: 'PATCH', token: su.token, json: { verified: true, push_asked: true } })
  const meAuth = await login(me.email), frAuth = await login(friend.email)

  // Friend request + accept, the same way the app does it.
  const f = await call('/collections/friendships/records', { method: 'POST', token: meAuth.token, json: { requester: me.id, addressee: friend.id, status: 'pending' } })
  await call(`/collections/friendships/records/${f.id}`, { method: 'PATCH', token: frAuth.token, json: { status: 'accepted' } })

  // A public workout for the friend, from yesterday, with real sets so it has a body graph.
  const bench = (await call(`/collections/exercises/records?filter=${encodeURIComponent("owner='' && name='Barbell Bench Press'")}`, { token: frAuth.token })).items[0]
  const when = new Date(Date.now() - 20 * 3600_000).toISOString()
  const w = await call('/collections/workouts/records', { method: 'POST', token: frAuth.token, json: {
    user: friend.id, name: 'Friend Push Day', started_at: when, ended_at: when, duration_s: 3000, volume_kg: 1500, pr_count: 1, visibility: 'public', accent: '#38bdf8',
  } })
  for (let i = 0; i < 3; i++) {
    await call('/collections/workout_sets/records', { method: 'POST', token: frAuth.token, json: {
      workout: w.id, user: friend.id, exercise: bench.id, performed_at: when, position: 0, set_index: i, weight_kg: 100, reps: 5, completed: true, e1rm_kg: 116,
    } })
  }

  const meFresh = await login(me.email) // token issued after the friendship so its record includes it
  const state: Seed = {
    api,
    me: { id: me.id, email: me.email, password, username: me.username, token: meFresh.token, record: meFresh.record },
    friend: { id: friend.id, email: friend.email, password, username: friend.username, workoutId: w.id, workoutName: 'Friend Push Day' },
  }
  mkdirSync(dirname(STATE_FILE), { recursive: true })
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2))
  } catch (e) {
    // Don't leave half-made test users behind.
    const su = await call('/collections/_superusers/auth-with-password', { method: 'POST', json: { identity: process.env.PB_ADMIN_EMAIL, password: process.env.PB_ADMIN_PASSWORD } }).catch(() => null)
    if (su) for (const id of created) await fetch(`${api}/api/collections/users/records/${id}`, { method: 'DELETE', headers: { Authorization: su.token } })
    throw e
  }
}
