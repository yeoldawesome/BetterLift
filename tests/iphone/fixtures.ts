import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test as base, expect, type Page } from '@playwright/test'

export const HERE = dirname(fileURLToPath(import.meta.url))
export const STATE_FILE = join(HERE, '.auth', 'state.json')
export type Seed = {
  api: string
  me: { id: string; email: string; password: string; username: string; token: string; record: unknown }
  friend: { id: string; email: string; password: string; username: string; workoutId: string; workoutName: string }
}
export const seed = (): Seed => JSON.parse(readFileSync(STATE_FILE, 'utf8'))

/** Signed in as the seeded test user (auth goes in localStorage, exactly as the app stores it). */
export const test = base.extend<{ app: Page }>({
  app: async ({ page }, use) => {
    const s = seed()
    await page.addInitScript((auth) => { localStorage.setItem('pocketbase_auth', auth) }, JSON.stringify({ token: s.me.token, record: s.me.record }))
    await use(page)
  },
})
export { expect }

/** The scrolling area every page lives in. */
export const main = (p: Page) => p.locator('main')

/** Tap a bottom tab like a thumb would. */
export async function tab(p: Page, name: 'Feed' | 'Routines' | 'Workout' | 'Nutrition' | 'Stats' | 'Profile') {
  await p.locator('nav').getByRole('link', { name, exact: true }).tap()
}

/** Horizontal overflow anywhere = sideways wobble on iPhone. Returns offending elements (if any). */
export async function horizontalOverflow(p: Page) {
  return p.evaluate(() => {
    const vw = document.documentElement.clientWidth
    const bad: string[] = []
    if (document.documentElement.scrollWidth > vw + 1) bad.push(`page scrollWidth ${document.documentElement.scrollWidth} > ${vw}`)
    const m = document.querySelector('main')
    if (m && m.scrollWidth > m.clientWidth + 1) bad.push(`main scrollWidth ${m.scrollWidth} > ${m.clientWidth}`)
    return bad
  })
}
