import { existsSync, rmSync } from 'node:fs'
import '../../scripts/env.mjs'
import { seed, STATE_FILE } from './fixtures'

/** Deletes the two test users (their workouts, reactions, custom reactions etc. cascade with them). */
export default async function teardown() {
  if (!existsSync(STATE_FILE)) return
  const s = seed()
  const su = await fetch(s.api + '/api/collections/_superusers/auth-with-password', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ identity: process.env.PB_ADMIN_EMAIL, password: process.env.PB_ADMIN_PASSWORD }),
  }).then((r) => r.json())
  for (const id of [s.me.id, s.friend.id]) {
    const r = await fetch(`${s.api}/api/collections/users/records/${id}`, { method: 'DELETE', headers: { Authorization: su.token } })
    if (!r.ok && r.status !== 404) console.warn(`Couldn't delete test user ${id}: ${r.status} ${await r.text()}`)
  }
  rmSync(STATE_FILE, { force: true })
}
