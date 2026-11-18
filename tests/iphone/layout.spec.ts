import { expect, horizontalOverflow, test } from './fixtures'

// Every screen you can reach. HashRouter, so routes live after "#".
const SCREENS = ['/feed', '/workout', '/routines', '/stats', '/profile', '/calendar', '/reactions', '/history',
  '/notifications', '/friends', '/exercises', '/settings', '/themes', '/import', '/profile/edit', '/feedback']

test.describe('Every screen fits an iPhone', () => {
  for (const path of SCREENS) {
    test(`${path}: no sideways scroll, no zoom-on-tap inputs`, async ({ app }) => {
      await app.goto('/#' + path)
      await expect(app.locator('main')).toBeVisible()
      await app.waitForLoadState('networkidle')
      await app.waitForTimeout(400) // let lists/charts render

      expect(await horizontalOverflow(app), 'page must not scroll sideways').toEqual([])

      // iOS Safari zooms the whole page when you tap a text field smaller than 16px — a classic PWA annoyance.
      const small = await app.evaluate(() => [...document.querySelectorAll('input, textarea, select')]
        .filter((el) => {
          const i = el as HTMLInputElement
          if (['checkbox', 'radio', 'file', 'hidden', 'range', 'color'].includes(i.type)) return false
          const r = el.getBoundingClientRect()
          return r.width > 0 && r.height > 0 && parseFloat(getComputedStyle(el).fontSize) < 16
        })
        .map((el) => `${el.tagName.toLowerCase()}[${(el as HTMLInputElement).placeholder || (el as HTMLInputElement).name || (el as HTMLInputElement).type}] ${getComputedStyle(el).fontSize}`))
      expect(small, 'text fields must be at least 16px or iOS zooms in on tap').toEqual([])
    })
  }

  test('content clears the notch and the home bar (safe areas)', async ({ app }) => {
    await app.goto('/#/feed')
    await expect(app.locator('nav')).toBeVisible()
    // The CSS for these classes must use env(safe-area-inset-*), which is what iOS fills in for the notch / home bar.
    const rules = await app.evaluate(() => {
      const css = [...document.styleSheets].flatMap((s) => { try { return [...s.cssRules].map((r) => r.cssText) } catch { return [] } }).join('\n')
      const find = (cls: string) => css.split('\n').find((l) => l.includes(`.${cls}`) && l.includes('safe-area-inset')) ?? ''
      return { top: find('pt-safe'), bottom: find('pb-safe') }
    })
    expect(rules.top, '.pt-safe uses safe-area-inset-top').toContain('safe-area-inset-top')
    expect(rules.bottom, '.pb-safe uses safe-area-inset-bottom').toContain('safe-area-inset-bottom')
    expect(await app.locator('main').evaluate((e) => e.className), 'pages start below the status bar').toContain('pt-safe')
    expect(await app.locator('nav').evaluate((e) => e.className), 'tab bar sits above the home indicator').toContain('pb-safe')
  })

  test('tab bar buttons are thumb-sized (≥ 44pt, Apple guideline)', async ({ app }) => {
    await app.goto('/#/feed')
    for (const name of ['Feed', 'Routines', 'Workout', 'Stats', 'Profile']) {
      const box = await app.locator('nav').getByRole('link', { name, exact: true }).boundingBox()
      expect(box!.height, `${name} tab height`).toBeGreaterThanOrEqual(44)
      expect(box!.width, `${name} tab width`).toBeGreaterThanOrEqual(44)
    }
  })

  test('tab bar stays pinned while the page scrolls', async ({ app }) => {
    await app.goto('/#/profile')
    await expect(app.getByText('Memories')).toBeVisible()
    const before = await app.locator('nav').boundingBox()
    await app.locator('main').evaluate((m) => { m.scrollTop = m.scrollHeight })
    const after = await app.locator('nav').boundingBox()
    expect(after!.y).toBe(before!.y)
    const vh = app.viewportSize()!.height
    expect(Math.round(after!.y + after!.height)).toBeLessThanOrEqual(vh)
  })
})
