import { test as base, expect, type Page } from '@playwright/test'
import { horizontalOverflow, seed } from '../iphone/fixtures'
import type { Duo } from './playwright.config'

/** Signed in as the seeded user, with this project's safe-area insets applied before the app loads. */
const test = base.extend<Duo & { app: Page }>({
  insets: [{ top: 0, right: 0, bottom: 0, left: 0 }, { option: true }],
  app: async ({ page, insets }, use) => {
    const s = seed()
    await page.addInitScript((auth) => { localStorage.setItem('pocketbase_auth', auth) }, JSON.stringify({ token: s.me.token, record: s.me.record }))
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Emulation.setSafeAreaInsetsOverride' as never, { insets } as never)
    await use(page)
  },
})

/**
 * Tappable things (buttons, links, fields) that sit in a no-go edge: under the cover screen's status pill (right) or
 * any other inset. Left/right edges are checked for everything; top/bottom only for things pinned to the screen
 * (fixed/sticky), since scrolled content passing under the edges is normal.
 */
async function blocked(p: Page, insets: Duo['insets']) {
  return p.evaluate((ins) => {
    const vw = innerWidth, vh = innerHeight
    const pinned = (el: Element | null): boolean => {
      for (let e = el; e; e = e.parentElement) { const pos = getComputedStyle(e).position; if (pos === 'fixed' || pos === 'sticky') return true }
      return false
    }
    const sel = 'button, a[href], input:not([type=hidden]), select, textarea, [role=button], [role=link], [role=radio], [role=tab], [role=switch]'
    const out: string[] = []
    for (const el of document.querySelectorAll(sel)) {
      const r = el.getBoundingClientRect()
      if (r.width < 2 || r.height < 2) continue
      const cs = getComputedStyle(el)
      if (cs.visibility === 'hidden' || cs.pointerEvents === 'none' || Number(cs.opacity) === 0) continue
      // Only what's actually on screen and on top (not scrolled away, not covered by a sheet).
      const cx = Math.min(vw - 1, Math.max(0, r.left + r.width / 2)), cy = Math.min(vh - 1, Math.max(0, r.top + r.height / 2))
      if (r.bottom <= 0 || r.top >= vh || r.right <= 0 || r.left >= vw) continue
      const hit = document.elementFromPoint(cx, cy)
      if (!hit || (hit !== el && !el.contains(hit) && !hit.contains(el))) continue
      const why: string[] = []
      if (ins.right && r.right > vw - ins.right + 1) why.push(`right edge ${Math.round(r.right)} > ${vw - ins.right}`)
      if (ins.left && r.left < ins.left - 1) why.push(`left edge ${Math.round(r.left)} < ${ins.left}`)
      if (pinned(el) && ins.top && r.top < ins.top - 1) why.push(`top ${Math.round(r.top)} < ${ins.top}`)
      if (pinned(el) && ins.bottom && r.bottom > vh - ins.bottom + 1) why.push(`bottom ${Math.round(r.bottom)} > ${vh - ins.bottom}`)
      if (why.length) {
        const name = (el.getAttribute('aria-label') || (el as HTMLElement).innerText || (el as HTMLInputElement).placeholder || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 40)
        out.push(`${el.tagName.toLowerCase()} "${name}": ${why.join(', ')}`)
      }
    }
    return out
  }, insets)
}

async function settle(p: Page) {
  await expect(p.locator('main .animate-spin')).toHaveCount(0, { timeout: 15_000 })
  await p.waitForTimeout(500)
}

/** Fails with a list of everything that can't be tapped, plus a screenshot. */
async function expectClear(p: Page, insets: Duo['insets'], where: string) {
  const bad = await blocked(p, insets)
  if (bad.length) await test.info().attach(`${where}.png`, { body: await p.screenshot(), contentType: 'image/png' })
  expect(bad, `${where}: tappable things under a screen edge`).toEqual([])
  expect(await horizontalOverflow(p), `${where}: no sideways scroll`).toEqual([])
}

// Some lifting history so Stats has cards, charts and the strength graph.
test.beforeAll(async () => {
  const s = seed()
  const call = async (path: string, json?: unknown) => {
    const r = await fetch(s.api + '/api' + path, { method: json ? 'POST' : 'GET', headers: { Authorization: s.me.token, ...(json ? { 'content-type': 'application/json' } : {}) }, body: json ? JSON.stringify(json) : undefined })
    if (!r.ok) throw new Error(`${path} -> ${r.status} ${await r.text()}`)
    return r.json()
  }
  if ((await call(`/collections/workouts/records?filter=${encodeURIComponent(`user='${s.me.id}'`)}`)).totalItems) return
  const bench = (await call(`/collections/exercises/records?filter=${encodeURIComponent("owner='' && name='Barbell Bench Press'")}`)).items[0]
  const run = (await call(`/collections/exercises/records?filter=${encodeURIComponent("owner='' && name='Running'")}`)).items[0]
  for (let wk = 6; wk >= 1; wk--) {
    const at = new Date(Date.now() - wk * 7 * 864e5).toISOString()
    const w = await call('/collections/workouts/records', { user: s.me.id, name: 'Push', started_at: at, ended_at: at, duration_s: 3000, volume_kg: 1500, visibility: 'private' })
    for (let i = 0; i < 3; i++) await call('/collections/workout_sets/records', { user: s.me.id, workout: w.id, exercise: bench.id, performed_at: at, position: 0, set_index: i, weight_kg: 80 + (6 - wk) * 2.5, reps: 5, completed: true, e1rm_kg: (80 + (6 - wk) * 2.5) * 1.1667 })
    await call('/collections/workout_sets/records', { user: s.me.id, workout: w.id, exercise: run.id, performed_at: at, position: 1, set_index: 0, distance_km: 5, seconds: 1500 - wk * 10, completed: true })
  }
})

// Every screen you can reach.
const SCREENS = ['/feed', '/workout', '/routines', '/stats', '/profile', '/calendar', '/reactions', '/history',
  '/notifications', '/friends', '/exercises', '/settings', '/themes', '/import', '/profile/edit', '/feedback',
  '/nutrition', '/nutrition/goals', '/nutrition/calendar', '/nutrition/meals']

test.describe('iPhone Duo: nothing tappable under the screen edges', () => {
  for (const path of SCREENS) {
    test(`screen ${path}`, async ({ app, insets }) => {
      await app.goto('/#' + path)
      await expect(app.locator('main')).toBeVisible()
      await settle(app)
      await expectClear(app, insets, path)
      // Scrolled to the bottom too (sticky bars, last buttons).
      await app.locator('main').evaluate((m) => { m.scrollTop = m.scrollHeight })
      await app.waitForTimeout(300)
      await expectClear(app, insets, `${path} (scrolled)`)
    })
  }

  test('stats: enlarged graph view', async ({ app, insets }) => {
    await app.goto('/#/stats')
    await settle(app)
    const tabs = app.getByRole('button', { name: 'Lifting', exact: true })
    if (await tabs.count()) await tabs.click()
    const chart = app.locator('main canvas').nth(1)
    await chart.scrollIntoViewIfNeeded()
    await app.waitForTimeout(600)
    const box = (await chart.boundingBox())!
    // Opens the enlarged card (tap the chart).
    await app.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
    await app.waitForTimeout(800)
    await expectClear(app, insets, 'enlarged graph')
  })

  test('stats: exercise info sheet', async ({ app, insets }) => {
    await app.goto('/#/stats')
    await settle(app)
    await app.getByRole('button', { name: /info|about/i }).first().click().catch(async () => { await app.locator('main button:has(svg)').filter({ hasText: '' }).first().click() })
    await app.waitForTimeout(800)
    await expectClear(app, insets, 'exercise info')
  })

  test('feed: bodyweight and records sheets', async ({ app, insets }) => {
    await app.goto('/#/feed')
    await settle(app)
    await app.locator('[data-bodyweight]').click()
    await app.waitForTimeout(800)
    await expectClear(app, insets, 'bodyweight sheet')
    await app.locator('[data-add-weight]').click()
    await expectClear(app, insets, 'bodyweight sheet (adding)')
    await app.keyboard.press('Escape')
    await app.goto('/#/feed')
    await settle(app)
    await app.locator('[data-records]').click()
    await app.waitForTimeout(800)
    await expectClear(app, insets, 'records sheet')
  })

  test('workout: in progress, rest timer, finish screen', async ({ app, insets }) => {
    await app.goto('/#/workout')
    await settle(app)
    const discard = app.getByRole('button', { name: 'Discard workout' })
    if (await discard.count()) { await discard.click(); await app.getByRole('button', { name: 'Discard' }).last().click() }
    await app.getByRole('button', { name: /start empty workout/i }).click()
    await app.getByRole('button', { name: /add exercises/i }).first().click()
    await app.waitForTimeout(500)
    await expectClear(app, insets, 'exercise picker')
    await app.locator('input[type=search], input[placeholder*=earch]').first().fill('Barbell Bench Press')
    await app.waitForTimeout(500)
    await app.getByText('Barbell Bench Press', { exact: true }).first().click()
    const add = app.getByRole('button', { name: /^add/i }).last()
    if (await add.count()) await add.click()
    await app.waitForTimeout(1200)
    const inputs = app.locator('main input[inputmode="decimal"], main input[inputmode="numeric"]')
    await inputs.nth(0).fill('100'); await inputs.nth(1).fill('5')
    await app.getByRole('button', { name: 'Mark set 1 done' }).click()
    await app.waitForTimeout(600)
    await expectClear(app, insets, 'workout with rest timer')
    await app.getByRole('button', { name: 'Barbell Bench Press options' }).click()
    await expectClear(app, insets, 'exercise menu')
    await app.keyboard.press('Escape')
    await app.mouse.click(5, 300)
    await app.getByRole('button', { name: 'Finish', exact: true }).first().click()
    await app.waitForTimeout(800)
    await expectClear(app, insets, 'finish screen')
    // Leave it running elsewhere: the "workout in progress" bar on other tabs.
    await app.goto('/#/feed')
    await settle(app)
    await expectClear(app, insets, 'feed with workout dock')
    await app.goto('/#/workout')
    await app.getByRole('button', { name: 'Discard workout' }).click()
    await app.getByRole('button', { name: 'Discard' }).last().click()
  })

  test('nutrition: add food sheet (every tab)', async ({ app, insets }) => {
    await app.goto('/#/nutrition')
    await settle(app)
    await app.getByRole('button', { name: /^Add to /i }).first().click()
    await app.waitForTimeout(600)
    for (const t of ['Describe', 'Search', 'Quick']) {
      await app.getByRole('button', { name: t, exact: true }).click()
      await app.waitForTimeout(400)
      await expectClear(app, insets, `add food: ${t}`)
    }
  })
})
