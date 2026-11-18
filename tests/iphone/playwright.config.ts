import { defineConfig, devices } from '@playwright/test'

/**
 * iPhone home-screen web app tests. Runs the real production build (same as what gets installed from Safari's
 * "Add to Home Screen") in WebKit — Safari's engine — with iPhone screen sizes, touch, and Safari's user agent.
 *
 * Needs the local PocketBase running on :8090 (powershell -File pb\start-local.ps1) and the admin login in
 * .env.development.local. Run: npm run test:iphone
 */
const API = process.env.VITE_API_URL || 'http://127.0.0.1:8090'
const PORT = 4173

export default defineConfig({
  testDir: '.',
  outputDir: './.results',
  globalSetup: './global-setup.ts',
  globalTeardown: './global-teardown.ts',
  fullyParallel: false,
  workers: 1, // tests share two seeded users
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 8_000 },
  reporter: [['list'], ['html', { outputFolder: './.report', open: 'never' }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    // Small, current, and big iPhones. All WebKit with touch + mobile Safari UA.
    { name: 'iPhone SE', use: { ...devices['iPhone SE'] } },
    { name: 'iPhone 15', use: { ...devices['iPhone 15'] } },
    { name: 'iPhone 15 Pro Max', use: { ...devices['iPhone 15 Pro Max'] } },
  ],
  webServer: {
    // Production build + preview: real service worker, manifest and icons, like the installed app.
    command: `npx vite build --mode production && npx vite preview --port ${PORT} --strictPort`,
    cwd: '../..',
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: { VITE_API_URL: API },
  },
})
