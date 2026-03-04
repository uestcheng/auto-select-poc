import { expect, test } from '../src/fixtures/test.fixture.js'

const appBaseURL = process.env.APP_BASE_URL ?? 'http://localhost:5172'

test.use({ baseURL: appBaseURL })

test.describe('smoke users->products flow', { tag: '@smoke' }, () => {
  test('users to products order flow', async ({ page, usersPage, productsPage }) => {
    await usersPage.open()
    await expect(usersPage.heading).toBeVisible()
    await usersPage.selectUser(1)

    await productsPage.open()
    await expect(productsPage.heading).toBeVisible()
    await expect(productsPage.activeUserHint).toContainText('Alice')

    await productsPage.placeOrder(0, 1)
    await expect(productsPage.notice).toContainText('Order placed successfully.')
    await expect(page.getByText(/Alice ordered 1 x/i)).toBeVisible()
  })
})
