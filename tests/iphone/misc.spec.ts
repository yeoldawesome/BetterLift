import { expect, main, seed, test } from './fixtures'

const api = async (path: string, init: RequestInit = {}) => {
  const s = seed()
  const r = await fetch(`${s.api}/api${path}`, { ...init, headers: { Authorization: s.me.token, 'content-type': 'application/json' } })
  return r.status === 204 ? null : r.json()
}

test('routines have a multi-line description', async ({ app }) => {
  const s = seed()
  const r = await api('/collections/routines/records', { method: 'POST', body: JSON.stringify({ user: s.me.id, name: 'Upper A', position: 99 }) })
  await app.goto(`/#/routines/${r.id}`)
  const box = main(app).getByLabel('Description')
  await box.fill('Upper body, heavy day.\nRun it Mondays and Thursdays.')
  await box.blur()
  await expect.poll(async () => (await api(`/collections/routines/records/${r.id}`)).notes).toBe('Upper body, heavy day.\nRun it Mondays and Thursdays.')
  await app.goto('/#/routines')
  await expect(main(app).getByText(/Upper body, heavy day\.\s+Run it Mondays/)).toBeVisible()
  await app.screenshot({ path: 'tests/iphone/.results/zz-routines.png' })
  await api(`/collections/routines/records/${r.id}`, { method: 'DELETE' })
})

test('stats tabs have plain labels; reaction button is a blank circle with a plus', async ({ app }) => {
  await app.goto('/#/stats')
  for (const l of ['Lifting', 'Physique', 'Insights']) await expect(main(app).getByRole('button', { name: l, exact: true })).toBeVisible()
  await app.goto('/#/feed')
  const react = main(app).getByRole('button', { name: 'React', exact: true }).first()
  await expect(react).toBeVisible()
  expect((await react.innerText()).trim()).toBe('')
  await react.scrollIntoViewIfNeeded()
  await app.screenshot({ path: 'tests/iphone/.results/zz-feed.png' })
})
