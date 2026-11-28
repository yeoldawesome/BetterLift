import type { Page } from '@playwright/test'
import { expect, horizontalOverflow, main, seed, tab, test } from './fixtures'

const sheet = (p: Page, name: string | RegExp) => p.getByRole('dialog', { name })
const api = async (path: string, init: RequestInit = {}) => {
  const s = seed()
  const r = await fetch(`${s.api}/api${path}`, { ...init, headers: { Authorization: s.me.token, 'content-type': 'application/json', ...(init.headers ?? {}) } })
  return r.status === 204 ? null : r.json()
}

/** Every iPhone project shares one seeded user: start each test with nutrition on and no food, goals, workouts or weigh-ins. */
async function resetNutrition() {
  const s = seed()
  await api(`/collections/users/records/${s.me.id}`, { method: 'PATCH', body: JSON.stringify({ nutrition_on: true, nutrition_seen: true }) })
  for (const c of ['food_logs', 'nutrition_profiles', 'workouts', 'body_metrics']) {
    const res = await api(`/collections/${c}/records?perPage=500&fields=id&filter=${encodeURIComponent(`user="${s.me.id}"`)}`)
    for (const { id } of res.items ?? []) await api(`/collections/${c}/records/${id}`, { method: 'DELETE' })
  }
}

/** A finished 30-minute, 5 km run today, logged the way the Workout screen saves it. */
async function seedRun() {
  const s = seed()
  const run = (await api(`/collections/exercises/records?filter=${encodeURIComponent("owner='' && name='Running'")}`)).items[0]
  const start = new Date(Date.now() - 40 * 60e3).toISOString()
  const w = await api('/collections/workouts/records', { method: 'POST', body: JSON.stringify({ user: s.me.id, name: 'Morning run', started_at: start, ended_at: start, duration_s: 1800, visibility: 'private' }) })
  await api('/collections/workout_sets/records', { method: 'POST', body: JSON.stringify({ workout: w.id, user: s.me.id, exercise: run.id, performed_at: start, position: 0, set_index: 0, seconds: 1800, distance_km: 5, completed: true, rpe: 7 }) })
}

const kcalOf = async (p: Page, label: string) => parseInt((await main(p).locator('dt', { hasText: label }).locator('xpath=following-sibling::dd').innerText()).replace(/[^\d]/g, ''))

test.describe.configure({ mode: 'serial' })

test.describe('Nutrition', () => {
  test.beforeEach(resetNutrition)

  test('set a goal, log food four ways, edit, log weight, workouts count automatically, calendar', async ({ app }) => {
    await app.goto('/#/feed')
    // First tap after a cold start can land while the service worker takes over; retry until it navigates.
    await expect(async () => {
      await tab(app, 'Nutrition')
      await expect(main(app).getByRole('heading', { name: 'Nutrition' })).toBeVisible({ timeout: 2000 })
    }).toPass()
    await expect(main(app).getByRole('button', { name: '+ Log cardio' })).toHaveCount(0)

    // Goals are a draft until confirmed.
    await main(app).getByText('Set your goal').tap()
    await expect(main(app).getByRole('heading', { name: 'Goals' })).toBeVisible()
    await main(app).getByRole('button', { name: 'Cut', exact: true }).tap()
    await expect(main(app).getByText('Moderate')).toBeVisible()
    await main(app).getByLabel('Age').fill('30')
    await expect(main(app).getByText(/Lose [\d.]+ lb\/week/)).toBeVisible()
    await expect(main(app).getByRole('button', { name: 'None', exact: true })).toHaveClass(/bg-accent/) // add-back defaults to none
    expect(await horizontalOverflow(app)).toEqual([])
    await main(app).getByRole('button', { name: 'Confirm goals' }).tap()
    await expect(main(app).getByRole('heading', { name: 'Nutrition' })).toBeVisible()
    await expect(main(app).getByText('Set your goal')).toHaveCount(0)

    // 1) Describe a meal → estimate → log.
    const log = sheet(app, 'Log food')
    await main(app).getByRole('button', { name: 'Describe' }).tap()
    await log.getByPlaceholder(/Describe what you ate/).fill('two chicken tacos with cheese and salsa and a diet soda')
    await expect(log.getByText('Chicken taco', { exact: true })).toBeVisible()
    await log.getByRole('button', { name: /Log 4 items · 493 kcal/ }).tap()
    await expect(log).toBeHidden()

    // 2) Exact macros from a sentence.
    await main(app).getByRole('button', { name: 'Describe' }).tap()
    await log.getByPlaceholder(/Describe what you ate/).fill('I ate 36g of protein, 26g carbs, and 48g fat at 680 calories')
    await log.getByRole('button', { name: 'Log 680 kcal' }).tap()
    await expect(log).toBeHidden()
    await expect(main(app).getByText('1,173', { exact: true })).toBeVisible()

    // 3) Quick macros.
    await main(app).getByRole('button', { name: 'Macros' }).tap()
    await log.getByLabel('Name (optional)').fill('Shake')
    await log.locator('label', { hasText: 'Protein' }).locator('input').fill('30')
    await log.getByRole('button', { name: 'Log 120 kcal' }).tap()
    await expect(log).toBeHidden()

    // 4) Search, one-tap add; Scan offers manual entry without a camera.
    await main(app).getByRole('button', { name: 'Search' }).tap()
    await log.getByPlaceholder('Search foods, brands & restaurants').fill('banana')
    await log.getByRole('button', { name: 'Add Banana' }).first().tap()
    await expect(log.getByText(/Added Banana · 105 kcal/)).toBeVisible()
    await log.getByRole('button', { name: 'Scan' }).tap()
    await expect(log.getByPlaceholder('Or type the barcode number')).toBeVisible()
    await log.getByRole('button', { name: 'Close' }).tap()
    await expect(log).toBeHidden()
    await expect(main(app).getByText('1,398', { exact: true })).toBeVisible()

    // Edit, delete.
    await main(app).getByRole('button', { name: /^Banana/ }).tap()
    const edit = sheet(app, 'Edit food')
    await edit.getByRole('button', { name: 'More' }).tap()
    await edit.getByRole('button', { name: 'More' }).tap()
    await edit.getByRole('button', { name: /Save · 210 kcal/ }).tap()
    await expect(edit).toBeHidden()
    await main(app).getByRole('button', { name: /^Shake/ }).tap()
    await edit.getByRole('button', { name: 'Delete', exact: true }).tap()
    await sheet(app, /Delete Shake/).getByRole('button', { name: 'Delete' }).tap()
    await expect(main(app).getByRole('button', { name: /^Shake/ })).toHaveCount(0)

    // Weight: the button, and "I weigh …" in Describe.
    await main(app).getByRole('button', { name: 'Log weight' }).tap()
    await sheet(app, 'Log weight').getByLabel('Weight (lb)').fill('181')
    await sheet(app, 'Log weight').getByRole('button', { name: 'Save weight' }).tap()
    await expect(main(app).getByText('181 lb', { exact: true })).toBeVisible()
    await main(app).getByRole('button', { name: 'Describe' }).tap()
    await log.getByPlaceholder(/Describe what you ate/).fill('I weigh 180.5')
    await log.getByRole('button', { name: /Log weight · Today/ }).tap()
    await expect(log).toBeHidden()
    await expect(main(app).getByText('180.5 lb', { exact: true })).toBeVisible()

    // A run logged in the workout tracker shows up by itself; with add-back off the target doesn't move.
    const targetBefore = await kcalOf(app, 'Target')
    await seedRun()
    await app.reload()
    await expect(main(app).getByText(/Running · 30 min · from pace/)).toBeVisible()
    expect(await kcalOf(app, 'Burned')).toBeGreaterThan(250)
    expect(await kcalOf(app, 'Target')).toBe(targetBefore)
    expect(await horizontalOverflow(app)).toEqual([])

    // Calendar.
    await main(app).getByRole('link', { name: 'Calendar' }).tap()
    await expect(main(app).getByRole('heading', { name: 'Food calendar' })).toBeVisible()
    await expect(main(app).getByText('1.4k')).toBeVisible() // 1,383 after deleting the shake
  })

  test('"Just track" has no targets', async ({ app }) => {
    await app.goto('/#/nutrition/goals')
    await main(app).getByRole('button', { name: 'Just track', exact: true }).tap()
    await expect(main(app).getByText('Just tracking')).toBeVisible()
    await expect(main(app).getByText('Macros', { exact: true })).toHaveCount(0)
    await main(app).getByRole('button', { name: 'Confirm goals' }).tap()
    await expect(main(app).getByRole('heading', { name: 'Nutrition' })).toBeVisible()
    await expect(main(app).getByText('Est. burn')).toBeVisible()
    await expect(main(app).getByText(/kcal left|kcal over/)).toHaveCount(0)
    await expect(main(app).getByText('Weekly pace check')).toHaveCount(0)
  })

  test('weekly pace check: bulking with no gain suggests eating more', async ({ app }) => {
    const s = seed()
    await api('/collections/nutrition_profiles/records', { method: 'POST', body: JSON.stringify({ user: s.me.id, settings: { setUp: true, goal: 'bulk', rate: 0.25 } }) })
    for (let d = 8; d >= 0; d--) {
      const when = new Date(Date.now() - d * 864e5 - 3600e3).toISOString()
      await api('/collections/body_metrics/records', { method: 'POST', body: JSON.stringify({ user: s.me.id, measured_at: when, weight_kg: 80, source: 'manual' }) })
    }
    await app.goto('/#/nutrition')
    const card = main(app).locator('div', { hasText: /^Weekly pace check/ })
    await expect(card.getByText(/gaining slower than planned/)).toBeVisible()
    const before = await kcalOf(app, 'Target')
    const btn = card.getByRole('button', { name: /^\+\d+ kcal$/ })
    const delta = parseInt((await btn.innerText()).replace(/[^\d]/g, ''))
    expect(delta).toBeGreaterThanOrEqual(100)
    await btn.tap()
    await expect(main(app).getByText('Weekly pace check')).toHaveCount(0)
    await expect.poll(() => kcalOf(app, 'Target')).toBe(before + delta)
  })

  test("lifting burn comes from each workout's time and sets", async ({ app }) => {
    const s = seed()
    const bench = (await api(`/collections/exercises/records?filter=${encodeURIComponent("owner='' && name='Barbell Bench Press'")}`)).items[0]
    // An hour ago, but never before midnight: run just after 00:00 and "an hour ago" would land on yesterday.
    const midnight = new Date(); midnight.setHours(0, 1, 0, 0)
    const start = new Date(Math.max(Date.now() - 60 * 60e3, midnight.getTime())).toISOString()
    const w = await api('/collections/workouts/records', { method: 'POST', body: JSON.stringify({ user: s.me.id, name: 'Push day', started_at: start, ended_at: start, duration_s: 40 * 60, visibility: 'private' }) })
    for (let i = 0; i < 10; i++) {
      await api('/collections/workout_sets/records', { method: 'POST', body: JSON.stringify({ workout: w.id, user: s.me.id, exercise: bench.id, performed_at: start, position: 0, set_index: i, weight_kg: 80, reps: 8, completed: true }) })
    }
    await app.goto('/#/nutrition')
    await expect(main(app).getByText(/Push day · 40 min · 10 sets, steady pace/)).toBeVisible()
    await app.goto('/#/nutrition/goals')
    const list = main(app).locator('div', { hasText: /^Your lifting, last 7 days/ })
    await expect(list.getByText(/Today · Push day · 40 min · 10 sets, steady pace/)).toBeVisible()
  })

  test('weigh-ins keep their time; Physique filters morning / night', async ({ app }) => {
    const s = seed()
    const at = (daysAgo: number, h: number) => { const d = new Date(); d.setDate(d.getDate() - daysAgo); d.setHours(h, 0, 0, 0); return d.toISOString() }
    for (const [d, h, kg] of [[3, 7, 80], [3, 21, 81.5], [2, 7, 79.8], [2, 22, 81.2], [1, 13, 80.5]] as const)
      await api('/collections/body_metrics/records', { method: 'POST', body: JSON.stringify({ user: s.me.id, measured_at: at(d, h), weight_kg: kg, source: 'manual' }) })

    // Log one at a chosen time from the Nutrition page.
    await app.goto('/#/nutrition')
    await main(app).getByRole('button', { name: 'Log weight' }).tap()
    const w = sheet(app, 'Log weight')
    await w.getByLabel('Weight (lb)').fill('178')
    await w.getByLabel('Time').fill('21:30')
    await w.getByRole('button', { name: 'Save weight' }).tap()
    await expect(w).toBeHidden()
    // Saved on the phone first and uploaded in the background (offline-first), so wait for it to reach the server.
    await expect.poll(async () => {
      const rows = await api(`/collections/body_metrics/records?sort=-created&perPage=1&filter=${encodeURIComponent(`user="${s.me.id}" && weight_kg > 80.7 && weight_kg < 80.8`)}`)
      const saved = rows.items[0] && new Date(rows.items[0].measured_at)
      return saved ? [saved.getHours(), saved.getMinutes()] : null
    }, { timeout: 10_000 }).toEqual([21, 30])

    await app.goto('/#/stats')
    await main(app).getByRole('button', { name: /Physique/ }).tap()
    const filter = main(app).getByRole('group', { name: 'Time of day' })
    await expect(filter.getByRole('button', { name: 'All 6' })).toBeVisible()
    await expect(filter.getByRole('button', { name: 'Morning 2' })).toBeVisible()
    await expect(filter.getByRole('button', { name: 'Night 4' })).toBeVisible() // 1 PM counts as night (10 AM and later)
    await filter.getByRole('button', { name: /Morning/ }).tap()
    await expect(main(app).getByText('Morning: before 10 AM')).toBeVisible()
    await expect(main(app).getByText(/9:30/)).toBeVisible() // header shows the latest reading's time
  })

  test('swipe a food entry right to delete it, with undo', async ({ app }) => {
    const s = seed()
    for (const [name, kcal] of [['Apple', 95], ['Bagel', 280]] as const)
      await api('/collections/food_logs/records', { method: 'POST', body: JSON.stringify({ user: s.me.id, day: new Date().toLocaleDateString('en-CA'), meal: 'snack', name, servings: 1, kcal, source: 'quick' }) })
    await app.goto('/#/nutrition')
    await expect(main(app).locator('[data-swipe-row]').filter({ hasText: 'Bagel' })).toBeVisible()
    // SwipeRow listens to touch events (and the mouse, for desktop); pointer events aren't used (see SwipeRow).
    const swipe = async (name: string) => {
      const row = main(app).locator('[data-swipe-row]').filter({ hasText: name })
      await row.scrollIntoViewIfNeeded()
      const b = (await row.boundingBox())!
      await app.mouse.move(b.x + 20, b.y + 15)
      await app.mouse.down()
      for (let dx = 20; dx <= 260; dx += 20) await app.mouse.move(b.x + 20 + dx, b.y + 16)
      await app.mouse.up()
    }
    await swipe('Bagel')
    await expect(main(app).locator('[data-swipe-row]').filter({ hasText: 'Bagel' })).toHaveCount(0)
    await expect(main(app).getByText('Deleted Bagel')).toBeVisible()
    await expect.poll(async () => (await api(`/collections/food_logs/records?filter=${encodeURIComponent(`name="Bagel"`)}`)).totalItems).toBe(0)
    await main(app).getByRole('button', { name: 'Undo' }).tap()
    await expect(main(app).locator('[data-swipe-row]').filter({ hasText: 'Bagel' })).toBeVisible()
    await swipe('Apple')
    await expect(main(app).locator('[data-swipe-row]').filter({ hasText: 'Apple' })).toHaveCount(0)
    await app.reload()
    await expect(main(app).locator('[data-swipe-row]').filter({ hasText: 'Bagel' })).toBeVisible()
    await expect(main(app).locator('[data-swipe-row]').filter({ hasText: 'Apple' })).toHaveCount(0)
  })

  test('basketball and other timed cardio use minutes', async ({ app }) => {
    // Live workout: Min column, and 45 means 45 minutes (a real burn, not 45 seconds).
    await app.goto('/#/workout')
    await app.getByRole('button', { name: 'Start empty workout' }).tap()
    await app.getByRole('button', { name: /Add exercises/ }).tap()
    await app.getByPlaceholder('Search exercises').fill('Basketball')
    await app.getByText('Basketball', { exact: true }).first().tap()
    await app.getByRole('button', { name: /^Add 1 exercise/ }).tap()
    await expect(main(app).getByText('Min', { exact: true })).toBeVisible()
    await expect(main(app).getByText('Sec', { exact: true })).toHaveCount(0)
    await main(app).locator('input[inputmode="decimal"]').first().fill('45')
    const kcal = parseInt((await main(app).getByText(/≈ \d+ kcal/).first().innerText()).replace(/[^\d]/g, ''))
    expect(kcal).toBeGreaterThan(300)

    // Saved workout: detail shows minutes; the editor shows 45 and saves 2700 s.
    const s = seed()
    const bb = (await api(`/collections/exercises/records?filter=${encodeURIComponent("owner='' && name='Basketball'")}`)).items[0]
    const start = new Date(Date.now() - 3 * 3600e3).toISOString()
    const w = await api('/collections/workouts/records', { method: 'POST', body: JSON.stringify({ user: s.me.id, name: 'Pickup game', started_at: start, ended_at: start, duration_s: 2700, visibility: 'private' }) })
    await api('/collections/workout_sets/records', { method: 'POST', body: JSON.stringify({ workout: w.id, user: s.me.id, exercise: bb.id, performed_at: start, position: 0, set_index: 0, seconds: 2700, completed: true }) })
    await app.goto(`/#/w/${w.id}`)
    await expect(main(app).getByText(/45 min · ≈ \d+ kcal/)).toBeVisible()
    await app.goto(`/#/w/${w.id}/edit`)
    await expect(main(app).getByText('Min', { exact: true })).toBeVisible()
    const field = main(app).locator('input[inputmode="decimal"]').last()
    await expect(field).toHaveValue('45')
    await field.fill('50')
    await main(app).getByRole('button', { name: 'Save changes' }).tap()
    await expect(main(app).getByText(/50 min · ≈ \d+ kcal/)).toBeVisible()
    const saved = await api(`/collections/workout_sets/records?filter=${encodeURIComponent(`workout="${w.id}"`)}`)
    expect(saved.items[0].seconds).toBe(3000)
  })

  test('nutrition off: no tab, no calories; cardio still tracks effort as a stat', async ({ app }) => {
    const s = seed()
    // Two past basketball sessions with effort + heart rate.
    const bb = (await api(`/collections/exercises/records?filter=${encodeURIComponent("owner='' && name='Basketball'")}`)).items[0]
    for (const [daysAgo, rpe, hr] of [[3, 6, 140], [1, 8, 158]] as const) {
      const t = new Date(Date.now() - daysAgo * 864e5).toISOString()
      const w = await api('/collections/workouts/records', { method: 'POST', body: JSON.stringify({ user: s.me.id, name: 'Hoops', started_at: t, ended_at: t, duration_s: 3600, visibility: 'private' }) })
      await api('/collections/workout_sets/records', { method: 'POST', body: JSON.stringify({ workout: w.id, user: s.me.id, exercise: bb.id, performed_at: t, position: 0, set_index: 0, seconds: 3600, completed: true, rpe, avg_hr: hr }) })
    }

    await app.goto('/#/settings')
    const toggle = main(app).getByRole('button', { name: /Nutrition tracking/ })
    await toggle.tap()
    await expect(toggle).toContainText('Off: no Nutrition tab or calorie estimates')
    await expect(app.locator('nav').getByRole('link', { name: 'Nutrition' })).toHaveCount(0)
    await app.goto('/#/nutrition')
    await expect(main(app).getByRole('heading', { name: 'Nutrition' })).toHaveCount(0) // redirected home

    await app.goto('/#/workout')
    await app.getByRole('button', { name: 'Start empty workout' }).tap()
    await app.getByRole('button', { name: /Add exercises/ }).tap()
    await app.getByPlaceholder('Search exercises').fill('Basketball')
    await app.getByText('Basketball', { exact: true }).first().tap()
    await app.getByRole('button', { name: /^Add 1 exercise/ }).tap()
    await main(app).locator('input[inputmode="decimal"]').first().fill('45')
    await expect(main(app).getByRole('button', { name: /Add effort/ }).first()).toBeVisible()
    await expect(main(app).getByText(/≈ \d+ kcal/)).toHaveCount(0)
    await main(app).getByRole('button', { name: /Add effort/ }).first().tap()
    const effort = sheet(app, 'Basketball effort')
    await expect(effort.getByText('Avg heart rate')).toBeVisible()
    await expect(effort.getByText('Watch calories')).toHaveCount(0)
    await expect(effort.getByText(/Estimated burn/)).toHaveCount(0)
    await effort.getByRole('button', { name: '7', exact: true }).tap()
    await effort.getByRole('button', { name: 'Done' }).tap()
    await expect(main(app).getByText('RPE 7 · hard')).toBeVisible()

    // Effort as a stat, like est. 1RM for a lift.
    await main(app).getByRole('button', { name: 'Basketball', exact: true }).tap()
    const info = sheet(app, /Basketball/)
    await expect(info.getByText('Avg effort (RPE)')).toBeVisible()
    await expect(info.getByText('7', { exact: true }).first()).toBeVisible() // avg of 6 and 8
    await expect(info.getByText('Hardest (RPE)')).toBeVisible()
    await expect(info.getByText('149 bpm')).toBeVisible()
    await expect(info.getByText('Effort per session (RPE 1–10)')).toBeVisible()
    await expect(info.getByText('Est. kcal burned')).toHaveCount(0)

    // Back on: calories return.
    await app.goto('/#/settings')
    await main(app).getByRole('button', { name: /Nutrition tracking/ }).tap()
    await expect(app.locator('nav').getByRole('link', { name: 'Nutrition' })).toBeVisible()
    await app.goto('/#/workout')
    await expect(main(app).getByText(/≈ \d+ kcal/).first()).toBeVisible()
  })

  test("friends' stats: lifting shared by default, physique and insights only when opted in", async ({ app }) => {
    const s = seed()
    // Act as the friend through the API.
    const fr = await fetch(`${s.api}/api/collections/users/auth-with-password`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identity: s.friend.email, password: s.friend.password }) }).then((r) => r.json())
    const asFriend = (path: string, init: RequestInit = {}) => fetch(`${s.api}/api${path}`, { ...init, headers: { Authorization: fr.token, 'content-type': 'application/json' } }).then((r) => (r.status === 204 ? null : r.json()))
    await asFriend(`/collections/users/records/${s.friend.id}`, { method: 'PATCH', body: JSON.stringify({ share_physique: false, share_insights: false, hide_stats: false }) })
    const old = await asFriend(`/collections/body_metrics/records?perPage=200&filter=${encodeURIComponent(`user="${s.friend.id}"`)}`)
    for (const r of old.items ?? []) await asFriend(`/collections/body_metrics/records/${r.id}`, { method: 'DELETE' })
    for (const [d, kg] of [[5, 82], [1, 81.4]] as const)
      await asFriend('/collections/body_metrics/records', { method: 'POST', body: JSON.stringify({ user: s.friend.id, measured_at: new Date(Date.now() - d * 864e5).toISOString(), weight_kg: kg, body_fat_pct: 18, source: 'manual' }) })
    const theirBody = () => api(`/collections/body_metrics/records?filter=${encodeURIComponent(`user="${s.friend.id}"`)}`).then((r) => r.totalItems)

    // Defaults: lifting visible; physique + insights private (and the server agrees).
    await app.goto(`/#/u/${s.friend.id}`)
    await expect(main(app).getByText(/Lifting Journey/)).toBeVisible()
    await expect(main(app).getByText(`@${s.friend.username} keeps Physique and Insights private.`)).toBeVisible()
    await expect(main(app).getByRole('button', { name: /Physique/ })).toHaveCount(0)
    expect(await theirBody()).toBe(0)

    // Friend shares both.
    await asFriend(`/collections/users/records/${s.friend.id}`, { method: 'PATCH', body: JSON.stringify({ share_physique: true, share_insights: true }) })
    expect(await theirBody()).toBe(2)
    await app.reload()
    await main(app).getByRole('button', { name: /Physique/ }).tap()
    await expect(main(app).getByRole('heading', { name: "Test Friend's Physique" })).toBeVisible()
    await expect(main(app).getByText(/^2 readings/)).toBeVisible()
    await expect(main(app).getByRole('button', { name: 'Import CSV' })).toHaveCount(0)
    await main(app).getByRole('button', { name: /Insights/ }).tap()
    await expect(main(app).getByRole('button', { name: 'Set goal' })).toHaveCount(0)
    await expect(main(app).getByText(/keeps .* private/)).toHaveCount(0)

    // Hiding lifting also hides insights (they're built from lifts).
    await asFriend(`/collections/users/records/${s.friend.id}`, { method: 'PATCH', body: JSON.stringify({ hide_stats: true }) })
    await app.reload()
    await expect(main(app).getByText(`@${s.friend.username} keeps Lifting and Insights private.`)).toBeVisible()
    await expect(main(app).getByRole('heading', { name: "Test Friend's Physique" })).toBeVisible()
    await asFriend(`/collections/users/records/${s.friend.id}`, { method: 'PATCH', body: JSON.stringify({ hide_stats: false, share_physique: false, share_insights: false }) })

    // Your own settings: three switches, physique + insights off by default.
    await app.goto('/#/settings')
    await expect(main(app).getByRole('button', { name: /Lifting stats/ })).toContainText('On: friends can see')
    await expect(main(app).getByRole('button', { name: /^Physique/ })).toContainText('Off: your weight')
    await expect(main(app).getByRole('button', { name: /^Insights/ })).toContainText('Off: your insights')
  })

  test('new accounts: nutrition starts off, with dots leading to the Settings switch', async ({ app }) => {
    const s = seed()
    await api(`/collections/users/records/${s.me.id}`, { method: 'PATCH', body: JSON.stringify({ nutrition_on: false, nutrition_seen: false }) })
    await app.goto('/#/feed')
    const nav = app.locator('nav')
    await expect(nav.getByRole('link', { name: 'Nutrition' })).toHaveCount(0)
    const profileTab = nav.getByRole('link', { name: 'Profile' })
    await expect(profileTab.locator('.bg-danger').first()).toBeVisible() // "New" dot, or the alerts count if there is one

    await nav.getByRole('link', { name: 'Profile' }).tap()
    await expect(main(app).getByRole('link', { name: 'Settings' }).first().locator('.bg-danger')).toBeVisible()
    await main(app).getByRole('link', { name: /Settings/ }).last().tap()
    await expect(main(app).getByText('New', { exact: true })).toBeVisible()
    const toggle = main(app).getByRole('button', { name: /Nutrition tracking/ })
    await expect(toggle).toContainText('Track food, calories and macros')
    await toggle.tap()

    await expect(toggle).toContainText('On: food logging')
    await expect(main(app).getByText('New', { exact: true })).toHaveCount(0)
    await expect(nav.getByRole('link', { name: 'Nutrition' })).toBeVisible()
    await expect(nav.getByLabel('New in Settings')).toHaveCount(0)
    const meNow = await api(`/collections/users/records/${s.me.id}`)
    expect([meNow.nutrition_on, meNow.nutrition_seen]).toEqual([true, true])

    // Turning it off again keeps the dots away (they're about discovering it, not its state).
    await toggle.tap()
    await expect(nav.getByRole('link', { name: 'Nutrition' })).toHaveCount(0)
    await expect(nav.getByLabel('New in Settings')).toHaveCount(0)
  })

  test('a Finish workout button sits after the exercises', async ({ app }) => {
    await app.goto('/#/workout')
    await app.getByRole('button', { name: 'Start empty workout' }).tap()
    await expect(main(app).getByRole('button', { name: 'Finish workout' })).toHaveCount(0) // nothing to finish yet
    await app.getByRole('button', { name: /Add exercises/ }).tap()
    await app.getByPlaceholder('Search exercises').fill('Barbell Bench Press')
    await app.getByText('Barbell Bench Press', { exact: true }).first().tap()
    await app.getByRole('button', { name: /^Add 1 exercise/ }).tap()
    const bottom = main(app).getByRole('button', { name: 'Finish workout' })
    await bottom.scrollIntoViewIfNeeded()
    const [b, add] = [(await bottom.boundingBox())!, (await main(app).getByRole('button', { name: /Add exercises/ }).boundingBox())!]
    expect(b.y).toBeGreaterThan(add.y) // below the exercises and "Add exercises"
    const vw = app.viewportSize()!.width
    expect(Math.abs(b.x + b.width / 2 - vw / 2)).toBeLessThan(4) // centered
    await bottom.tap()
    await expect(sheet(app, 'Finish workout')).toBeVisible()
  })

  test('swipe a set right to delete it', async ({ app }) => {
    await app.goto('/#/workout')
    await app.getByRole('button', { name: 'Start empty workout' }).tap()
    await app.getByRole('button', { name: /Add exercises/ }).tap()
    await app.getByPlaceholder('Search exercises').fill('Barbell Bench Press')
    await app.getByText('Barbell Bench Press', { exact: true }).first().tap()
    await app.getByRole('button', { name: /^Add 1 exercise/ }).tap()
    const reps = app.locator('main input[inputmode="numeric"]')
    // A new exercise starts with one set; add two more.
    await expect(reps).toHaveCount(1)
    await app.getByRole('button', { name: /Add set/i }).tap()
    await app.getByRole('button', { name: /Add set/i }).tap()
    await expect(reps).toHaveCount(3)
    await reps.nth(0).fill('5'); await reps.nth(1).fill('6'); await reps.nth(2).fill('7')

    // Drag the second set's row to the right (SwipeRow listens to touch and mouse, not pointer events).
    const swipe = async (i: number, dist: number) => {
      const row = app.locator('[data-swipe-row]').nth(i)
      await row.scrollIntoViewIfNeeded()
      const b = (await row.boundingBox())!
      const x0 = b.x + 30, y = b.y + 20
      await app.mouse.move(x0, y)
      await app.mouse.down()
      // At finger speed: an instant jump reads as a flick, which deletes even on a short drag.
      for (let dx = 20; dx <= dist; dx += 20) { await app.mouse.move(x0 + dx, y + 2); await app.waitForTimeout(90) }
      await app.mouse.up()
    }
    await swipe(1, 240)
    await expect(reps).toHaveCount(2)
    await expect(reps.nth(0)).toHaveValue('5')
    await expect(reps.nth(1)).toHaveValue('7')

    // A short drag snaps back and deletes nothing.
    await swipe(0, 60)
    await app.waitForTimeout(300)
    await expect(reps).toHaveCount(2)
    await expect(reps.nth(0)).toHaveValue('5')
  })
})
