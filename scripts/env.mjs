// Loads local-only settings (admin login for tests/seeding) from .env.development.local into process.env.
// That file is gitignored; real environment variables always win.
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const file = join(dirname(fileURLToPath(import.meta.url)), '..', '.env.development.local')
if (existsSync(file)) {
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line)
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2]
  }
}
if (!process.env.PB_ADMIN_EMAIL || !process.env.PB_ADMIN_PASSWORD) {
  console.error('Set PB_ADMIN_EMAIL and PB_ADMIN_PASSWORD (env vars or .env.development.local) to your PocketBase admin login.')
  process.exit(1)
}
