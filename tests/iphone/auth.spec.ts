import { expect, seed, test } from './fixtures'

// Login is rate-limited (10 attempts/minute per IP), so these run on one device size only.
test.beforeEach(({}, info) => test.skip(info.project.name !== 'iPhone 15', 'auth flows: one device is enough (login is rate-limited)'))

const newUser = async () => {
  const s = seed()
  const u = `auth_${Math.random().toString(36).slice(2, 8)}`
  const r = await fetch(`${s.api}/api/collections/users/records`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: `${u}@test.local`, username: u, password: 'Granite-Squats-1', passwordConfirm: 'Granite-Squats-1', bodyweight_kg: 80, height_cm: 180, unit: 'lb' }),
  })
  expect(r.ok).toBeTruthy()
  return u
}

test('log in with a username; wrong password gives a generic message', async ({ page }) => {
  const u = await newUser()
  await page.goto('/')
  await page.getByLabel('Email or username').fill(u.toUpperCase()) // usernames are case-insensitive here
  await page.getByLabel('Password', { exact: true }).fill('not-the-password')
  await page.locator('form').getByRole('button', { name: 'Log in' }).tap()
  await expect(page.getByText('Wrong email/username or password.')).toBeVisible()
  await page.getByRole('button', { name: 'Show password' }).tap()
  await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'text')
  await page.getByLabel('Password', { exact: true }).fill('Granite-Squats-1')
  await page.locator('form').getByRole('button', { name: 'Log in' }).tap()
  await expect(page.locator('nav')).toBeVisible()
})

test('sign up blocks weak, common and mismatched passwords', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Sign up' }).tap()
  await page.getByPlaceholder('Email').fill('someone@test.local')
  await page.getByPlaceholder(/^Username/).fill('someone_new')
  const pw = page.getByLabel('Password (10+ characters)')
  const create = page.getByRole('button', { name: 'Create account' })
  await pw.fill('short1')
  await expect(page.getByText('Use at least 10 characters.')).toBeVisible()
  await pw.fill('password123')
  await expect(page.getByText(/too common/)).toBeVisible()
  await pw.fill('someone_new_lifts')
  await expect(page.getByText("Don't use your username or email in your password.")).toBeVisible()
  await pw.fill('Granite-Squats-9')
  await expect(page.getByText(/^Strength: /)).toBeVisible()
  await page.getByLabel('Confirm password').fill('Granite-Squats-8')
  await expect(page.getByText("Passwords don't match.")).toBeVisible()
  await expect(create).toBeDisabled()
  await page.getByLabel('Confirm password').fill('Granite-Squats-9')
  await expect(create).toBeEnabled()
})

test('forgot password: asks for email or username, and an expired link explains itself', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Forgot password?' }).tap()
  await expect(page.getByRole('heading', { name: 'Reset your password' })).toBeVisible()
  await page.getByLabel('Email or username').fill('someone')
  await page.getByRole('button', { name: 'Email me a reset link' }).tap()
  // The test server has no email set up, so it says so (a configured server says "If that account exists…").
  await expect(page.getByText(/emails aren't set up|If that account exists/)).toBeVisible()
  await page.getByRole('button', { name: 'Back to log in' }).tap()
  await expect(page.locator('form').getByRole('button', { name: 'Log in' })).toBeVisible()

  await page.goto('/#/reset-password/not-a-real-token')
  await expect(page.getByRole('heading', { name: 'Choose a new password' })).toBeVisible()
  await page.getByLabel('New password (10+ characters)').fill('Granite-Squats-5')
  await page.getByLabel('Confirm new password').fill('Granite-Squats-5')
  await page.getByRole('button', { name: 'Save new password' }).tap()
  await expect(page.getByText(/expired or was already used/)).toBeVisible()
})

test('change password in Settings keeps you signed in here', async ({ page }) => {
  const u = await newUser()
  await page.goto('/')
  await page.getByLabel('Email or username').fill(u)
  await page.getByLabel('Password', { exact: true }).fill('Granite-Squats-1')
  await page.locator('form').getByRole('button', { name: 'Log in' }).tap()
  await expect(page.locator('nav')).toBeVisible()
  await page.goto('/#/settings')
  await page.getByRole('button', { name: /Change password/ }).tap()
  const sheet = page.getByRole('dialog', { name: 'Change password' })
  await sheet.getByLabel('Current password').fill('wrong-current-pw')
  await sheet.getByLabel('New password', { exact: true }).fill('Granite-Deadlift-2')
  await sheet.getByLabel('Confirm new password').fill('Granite-Deadlift-2')
  await sheet.getByRole('button', { name: 'Change password' }).tap()
  await expect(sheet.getByText('Your current password is wrong.')).toBeVisible()
  await sheet.getByLabel('Current password').fill('Granite-Squats-1')
  await sheet.getByRole('button', { name: 'Change password' }).tap()
  await expect(page.getByText('Password changed. Your other devices have been signed out.')).toBeVisible()
  await page.reload()
  await expect(page.locator('nav')).toBeVisible() // still signed in on this device
  const s = seed()
  const login = (password: string) => fetch(`${s.api}/api/collections/users/auth-with-password`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identity: u, password }) }).then((r) => r.status)
  expect(await login('Granite-Squats-1')).toBe(400)
  expect(await login('Granite-Deadlift-2')).toBe(200)
})
