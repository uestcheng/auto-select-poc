import { expect, test } from '../src/fixtures/test.fixture.js'

const appBaseURL = process.env.APP_BASE_URL ?? 'http://localhost:5172'

test.use({ baseURL: appBaseURL })

test.describe('users flow', { tag: '@flow' }, () => {
  test('create user only', async ({ page, usersPage }) => {
    const uniqueSuffix = Date.now()
    const userName = `Flow User ${uniqueSuffix}`
    const userEmail = `flow-${uniqueSuffix}@test.com`

    await usersPage.open()
    await expect(usersPage.heading).toBeVisible()

    await usersPage.addUser(userName, userEmail)

    const userRow = page.locator('tbody tr', { hasText: userName }).first()
    await expect(userRow).toBeVisible()
    await expect(userRow).toContainText(userEmail)
  })
})
