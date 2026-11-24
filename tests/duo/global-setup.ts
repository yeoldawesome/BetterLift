import { readFileSync, writeFileSync } from 'node:fs'
import '../../scripts/env.mjs'
import iphoneSetup from '../iphone/global-setup'
import { STATE_FILE, type Seed } from '../iphone/fixtures'

/**
 * Same throwaway users as the iPhone suite, but email-verified (as the admin), so the app opens past the
 * "Verify your email" screen and every page can be checked.
 */
export default async function setup() {
  await iphoneSetup()
  const s: Seed = JSON.parse(readFileSync(STATE_FILE, 'utf8'))
  const post = async (path: string, json: unknown, token?: string, method = 'POST') => {
    const r = await fetch(s.api + '/api' + path, { method, headers: { 'content-type': 'application/json', ...(token ? { Authorization: token } : {}) }, body: JSON.stringify(json) })
    if (!r.ok) throw new Error(`${method} ${path} -> ${r.status} ${await r.text()}`)
    return r.json()
  }
  const su = await post('/collections/_superusers/auth-with-password', { identity: process.env.PB_ADMIN_EMAIL, password: process.env.PB_ADMIN_PASSWORD })
  for (const id of [s.me.id, s.friend.id]) await post(`/collections/users/records/${id}`, { verified: true, push_asked: true }, su.token, 'PATCH')
  const me = await post('/collections/users/auth-with-password', { identity: s.me.email, password: s.me.password })
  s.me.token = me.token; s.me.record = me.record
  writeFileSync(STATE_FILE, JSON.stringify(s, null, 2))
}
