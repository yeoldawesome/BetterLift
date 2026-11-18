import { expect, test } from './fixtures'

/** PNG width/height straight from the file header (bytes 16-23). */
const pngSize = (b: Buffer) => ({ w: b.readUInt32BE(16), h: b.readUInt32BE(20) })

test.describe('Add to Home Screen', () => {
  test('iOS home-screen tags are in the page', async ({ page }) => {
    await page.goto('/')
    const meta = (name: string) => page.locator(`meta[name="${name}"]`).getAttribute('content')
    expect(await meta('apple-mobile-web-app-capable'), 'opens full screen, no Safari bars').toBe('yes')
    expect(await meta('apple-mobile-web-app-status-bar-style')).toBe('black-translucent')
    expect(await meta('apple-mobile-web-app-title'), 'name under the home-screen icon').toBe('Better Lift')
    expect(await meta('viewport'), 'content can use the notch area (safe areas)').toContain('viewport-fit=cover')
    expect(await meta('theme-color')).toBeTruthy()
  })

  test('home-screen icon is a 180×180 PNG', async ({ page, request }) => {
    await page.goto('/')
    const href = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href')
    const r = await request.get(href!)
    expect(r.ok()).toBe(true)
    expect(r.headers()['content-type']).toContain('image/png')
    expect(pngSize(await r.body())).toEqual({ w: 180, h: 180 })
  })

  test('web app manifest says standalone with 192 + 512 icons', async ({ page, request }) => {
    await page.goto('/')
    const href = await page.locator('link[rel="manifest"]').getAttribute('href')
    expect(href, 'manifest link is injected by the production build').toBeTruthy()
    const m = await (await request.get(href!)).json()
    expect(m.display).toBe('standalone')
    expect(m.start_url).toBe('/')
    expect(m.name).toBe('Better Lift')
    for (const size of [192, 512]) {
      const icon = m.icons.find((i: { sizes: string }) => i.sizes === `${size}x${size}`)
      expect(icon, `${size}px icon listed`).toBeTruthy()
      const r = await request.get('/' + icon.src.replace(/^\//, ''))
      expect(r.ok(), `${icon.src} loads`).toBe(true)
      expect(pngSize(await r.body())).toEqual({ w: size, h: size })
    }
  })

  test('service worker installs and the app opens offline', async ({ page, context, browserName }) => {
    await page.goto('/')
    const hasSW = await page.evaluate(() => 'serviceWorker' in navigator)
    test.skip(!hasSW, `This ${browserName} build has no service worker support (real iOS Safari does)`)
    const ready = await page.evaluate(() => Promise.race([
      navigator.serviceWorker.ready.then(() => true), new Promise<boolean>((r) => setTimeout(() => r(false), 15_000)),
    ]))
    expect(ready, 'service worker activated').toBe(true)
    await page.reload() // now controlled by the service worker
    await context.setOffline(true)
    await page.reload()
    await expect(page.locator('#root')).not.toBeEmpty() // app shell came from the cache, not the network
    await context.setOffline(false)
  })
})
