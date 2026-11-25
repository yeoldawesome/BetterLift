import { defineConfig } from '@playwright/test'

/**
 * Foldable iPhone ("iPhone Duo") tests: closed (cover screen) and open (inner screen).
 * The cover screen keeps its status strip — time, signal, Now Playing — in a pill down the right edge, which iOS
 * reports to web apps as a right safe-area inset. Anything tappable under it can't be tapped.
 *
 * WebKit can't simulate safe-area insets, so these run in Chromium with the insets set through DevTools
 * (Emulation.setSafeAreaInsetsOverride); the iPhone suite covers WebKit itself.
 * Sizes measured from real screenshots (3× scale): closed = 458×667 pt with the status pill ~83 pt wide down the top
 * 250 pt of the right edge; open = 951×669 pt with the pill ~72 pt wide down the top ~283 pt of the right edge.
 *
 * Same local setup as the iPhone suite (PocketBase on :8090, admin login in .env.development.local). Run: npm run test:duo
 */
const API = process.env.VITE_API_URL || 'http://127.0.0.1:8090'
const PORT = 4174

export type Duo = {
  /** What iOS reports as safe-area insets (env(safe-area-inset-*)). */
  insets: { top: number; right: number; bottom: number; left: number }
  /** The cover screen's status pill at the top of the right edge: nothing tappable may sit under it. */
  pill?: { width: number; height: number }
}

export default defineConfig<Duo>({
  testDir: '.',
  outputDir: './.results',
  globalSetup: './global-setup.ts',
  globalTeardown: '../iphone/global-teardown.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 8_000 },
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`, trace: 'retain-on-failure', screenshot: 'only-on-failure',
    // Point at a Chromium that doesn't match this Playwright version (e.g. a preinstalled one): PW_CHROMIUM=/path/to/chrome
    ...(process.env.PW_CHROMIUM ? { launchOptions: { executablePath: process.env.PW_CHROMIUM } } : {}),
  },
  projects: [
    { name: 'iPhone Duo closed', use: { browserName: 'chromium', viewport: { width: 458, height: 667 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, insets: { top: 0, right: 83, bottom: 20, left: 0 }, pill: { width: 83, height: 250 } } },
    { name: 'iPhone Duo open', use: { browserName: 'chromium', viewport: { width: 951, height: 669 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, insets: { top: 0, right: 76, bottom: 20, left: 0 }, pill: { width: 76, height: 290 } } },
  ],
  webServer: {
    command: `npx vite build --mode production && npx vite preview --port ${PORT} --strictPort`,
    cwd: '../..',
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: { VITE_API_URL: API },
  },
})
