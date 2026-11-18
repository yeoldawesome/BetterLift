import { join } from 'node:path'
import { expect, HERE, main, seed, tab, test } from './fixtures'

const IMAGE = join(HERE, '..', '..', 'public', 'pwa-192.png')
const CHECK = 'button:has(svg path[d^="M5 12.5"])' // the ✓ button on a set row

// These run in order and build on each other (log a workout, then see it in the feed, streak, calendar...).
test.describe.configure({ mode: 'serial' })

test.describe('Real taps on an iPhone', () => {
  const liftName = () => `iPhone lift ${test.info().project.name}`

  test('log in with the form', async ({ page }) => {
    const s = seed()
    await page.goto('/')
    await page.getByPlaceholder('Email').fill(s.me.email)
    await page.getByPlaceholder(/^Password/).fill(s.me.password)
    await page.getByRole('button', { name: 'Log in' }).last().tap()
    await expect(page.locator('nav').getByRole('link', { name: 'Feed', exact: true })).toBeVisible()
  })

  test('log a workout start to finish', async ({ app }) => {
    await app.goto('/#/workout')
    await app.getByRole('button', { name: 'Start empty workout' }).tap()
    await app.getByRole('button', { name: /Add exercises/ }).tap()
    await app.getByPlaceholder('Search exercises').fill('Barbell Bench Press')
    await app.getByText('Barbell Bench Press', { exact: true }).first().tap()
    await app.getByRole('button', { name: /^Add 1 exercise/ }).tap()

    const weight = app.locator('input[inputmode="decimal"]').first()
    const reps = app.locator('input[inputmode="numeric"]').first()
    await weight.tap(); await weight.fill('135')
    await reps.tap(); await reps.fill('8')
    // Number pads: iOS shows the right keyboard from inputmode, and 16px+ text stops the zoom-on-tap.
    expect(await weight.evaluate((e) => parseFloat(getComputedStyle(e).fontSize)), 'weight box font size').toBeGreaterThanOrEqual(16)
    await app.locator(CHECK).first().tap()

    await app.getByRole('button', { name: 'Finish', exact: true }).tap()
    await app.getByLabel('Post name').fill(liftName())
    await app.getByRole('button', { name: /finish workout/ }).tap()
    await expect(app).toHaveURL(/#\/recap\//)

    await tab(app, 'Feed')
    await expect(app.getByRole('heading', { name: liftName() })).toBeVisible()
  })

  test('feed shows body graphs in each lifter\'s own color', async ({ app }) => {
    const s = seed()
    await app.goto('/#/feed')
    const card = app.locator('.space-y-3.p-3').filter({ hasText: s.friend.workoutName })
    await expect(card).toBeVisible()
    const accent = await card.locator('svg[aria-label="front muscles"]').first().evaluate((svg) => getComputedStyle(svg.parentElement!.parentElement!).getPropertyValue('--color-accent').trim())
    expect(accent, "friend's graph uses the color they logged with").toBe('#38bdf8')
  })

  test('react with an emoji and take it back', async ({ app }) => {
    const s = seed()
    await app.goto('/#/feed')
    const card = app.locator('.space-y-3.p-3').filter({ hasText: s.friend.workoutName })
    await card.getByRole('button', { name: 'React' }).tap()
    await app.getByTitle('fire').tap()
    await expect(card.getByRole('button', { name: '1 reactions' })).toBeVisible()
    await card.getByRole('button', { name: 'React' }).tap()
    await app.getByTitle('fire').tap()
    await expect(card.getByRole('button', { name: /reactions$/ })).toHaveCount(0)
  })

  test('make a custom reaction from a photo, use it, then delete it', async ({ app }) => {
    const s = seed()
    const name = `Pump ${test.info().project.name.replace(/\W/g, '')}`.slice(0, 24)
    app.on('dialog', (d) => d.accept())
    await app.goto('/#/feed')
    const card = app.locator('.space-y-3.p-3').filter({ hasText: s.friend.workoutName })
    await card.getByRole('button', { name: 'React' }).tap()
    await app.getByRole('button', { name: 'Custom reaction' }).tap()
    const file = app.locator('input[type=file]')
    expect(await file.getAttribute('accept'), 'iPhone offers Photo Library / Camera / Files').toContain('image/')
    await file.setInputFiles(IMAGE)
    await app.getByPlaceholder(/^Name it/).fill(name)
    await app.getByRole('button', { name: 'Add reaction' }).tap()
    await expect(app.getByText(name, { exact: true })).toBeVisible()
    await app.getByRole('button', { name: 'Close' }).tap()
    await app.getByTitle(name).tap()
    await expect(card.getByRole('button', { name: '1 reactions' })).toBeVisible()
    await expect(card.locator(`img[alt="${name}"]`)).toBeVisible()

    // Manage it from Profile → Reactions; deleting removes it from the post too.
    await tab(app, 'Profile')
    await app.getByRole('link', { name: /Reactions/ }).tap()
    await expect(app).toHaveURL(/#\/reactions/)
    await app.getByRole('button', { name: `Delete ${name}` }).tap()
    await expect(app.getByText(name, { exact: true })).toHaveCount(0)
    await tab(app, 'Feed')
    await expect(card.getByRole('button', { name: /reactions$/ })).toHaveCount(0)
  })

  test('switching tabs opens each page at the top', async ({ app }) => {
    await app.goto('/#/feed')
    await expect(app.getByRole('heading', { name: liftName() })).toBeVisible()
    await main(app).evaluate((m) => { m.scrollTop = m.scrollHeight })
    await tab(app, 'Profile')
    await expect(app.getByText('iPhone Tester')).toBeInViewport()
    expect(await main(app).evaluate((m) => m.scrollTop)).toBe(0)
  })

  test('streak card opens a live countdown', async ({ app }) => {
    await app.goto('/#/profile')
    await app.getByText(/day streak/).tap()
    await expect(app.getByText('Time left to keep it')).toBeVisible()
    const first = await app.locator('text=/\\d+d \\d+h \\d+m|\\d+h \\d+m \\d+s/').first().textContent()
    await app.waitForTimeout(1500)
    const second = await app.locator('text=/\\d+d \\d+h \\d+m|\\d+h \\d+m \\d+s/').first().textContent()
    expect(first).toBeTruthy()
    if (/s$/.test(first!)) expect(second, 'countdown ticks').not.toBe(first)
  })

  test('Memories opens the calendar with today\'s workout', async ({ app }) => {
    await app.goto('/#/profile')
    await app.getByText('Memories').tap()
    await expect(app).toHaveURL(/#\/calendar/)
    const now = new Date()
    const month = now.toLocaleString('en-US', { month: 'long' }) + ' ' + now.getFullYear()
    await expect(app.getByRole('heading', { name: month })).toBeInViewport()
    await app.getByRole('button', { name: new RegExp(`^${now.toDateString()}`) }).tap()
    await expect(app.getByText(liftName())).toBeVisible()
  })

  test('tapping a bar in Total opens that day', async ({ app }) => {
    await app.goto('/#/profile')
    const bars = app.locator('a[href*="calendar?d="]')
    await bars.last().scrollIntoViewIfNeeded()
    await bars.last().tap()
    await expect(app).toHaveURL(/#\/calendar\?d=/)
    await expect(app.getByText(liftName())).toBeVisible()
  })

  test('Stats: ⓘ next to a lift opens its info, with other names in grey', async ({ app }) => {
    await app.goto('/#/stats')
    await app.getByRole('button', { name: 'About Barbell Bench Press' }).first().tap()
    await expect(app.getByRole('heading', { name: 'Barbell Bench Press' })).toBeVisible()
    await expect(app.getByText('Also called Bench Press, Flat Bench')).toBeVisible()
  })

  test('searching an alternative name finds the lift ("pec deck" → Machine Chest Fly)', async ({ app }) => {
    await app.goto('/#/exercises')
    await app.getByPlaceholder('Search exercises').fill('pec deck')
    await expect(app.getByText('Machine Chest Fly', { exact: true })).toBeVisible()
  })

  test('profile photo picker accepts iPhone photos', async ({ app }) => {
    await app.goto('/#/profile')
    await app.getByRole('button', { name: 'Change profile picture' }).tap()
    expect(await app.locator('input[type=file]').getAttribute('accept')).toContain('image/')
    await app.getByRole('button', { name: 'Cancel' }).tap()
  })
})
