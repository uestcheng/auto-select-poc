import { expect, test } from '../src/fixtures/test.fixture.js'

const appBaseURL = process.env.APP_BASE_URL ?? 'http://localhost:5172'

test.use({ baseURL: appBaseURL })

test.describe('smoke create-order flow', { tag: '@smoke' }, () => {
  test('create user then place order', async ({ page, usersPage, productsPage }) => {
    const uniqueSuffix = Date.now()
    const userName = `E2E User ${uniqueSuffix}`
    const userEmail = `e2e-${uniqueSuffix}@test.com`

    await usersPage.open()
    await expect(usersPage.heading).toBeVisible()
    await usersPage.addUser(userName, userEmail)

    const userRow = page.locator('tbody tr', { hasText: userName }).first()
    await expect(userRow).toBeVisible()
    await userRow.getByRole('button', { name: 'Select' }).click()

    await page.getByTestId('main-nav').getByRole('link', { name: 'Products' }).click()
    await expect(page).toHaveURL(/\/products$/)
    await expect(productsPage.activeUserHint).toContainText(userName)

    await productsPage.placeOrder(1, 1)
    await expect(productsPage.notice).toContainText('Order placed successfully.')
    await expect(page.getByText(new RegExp(`${userName} ordered 1 x`, 'i'))).toBeVisible()
  })
})
