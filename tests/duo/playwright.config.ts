import { defineConfig } from '@playwright/test'

/**
 * Foldable iPhone ("iPhone Duo") tests: closed (cover screen) and open (inner screen).
 * The cover screen keeps its status strip — time, signal, Now Playing — in a pill down the right edge, which iOS
 * reports to web apps as a right safe-area inset. Anything tappable under it can't be tapped.
 *
 * WebKit can't simulate safe-area insets, so these run in Chromium with the insets set through DevTools
 * (Emulation.setSafeAreaInsetsOverride); the iPhone suite covers WebKit itself.
 * Sizes: closed = measured from real screenshots (458×667 pt, ~83 pt pill on the right). Open = 790 pt wide
 * (published estimates; update once measured on a device).
 *
 * Same local setup as the iPhone suite (PocketBase on :8090, admin login in .env.development.local). Run: npm run test:duo
 */
const API = process.env.VITE_API_URL || 'http://127.0.0.1:8090'
const PORT = 4174

export type Duo = { insets: { top: number; right: number; bottom: number; left: number } }

export default defineConfig<Duo>({
  testDir: '.',
  outputDir: './.results',
  globalSetup: '../iphone/global-setup.ts',
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
    { name: 'iPhone Duo closed', use: { browserName: 'chromium', viewport: { width: 458, height: 667 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, insets: { top: 0, right: 83, bottom: 20, left: 0 } } },
    { name: 'iPhone Duo open', use: { browserName: 'chromium', viewport: { width: 790, height: 1000 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, insets: { top: 24, right: 0, bottom: 20, left: 0 } } },
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
