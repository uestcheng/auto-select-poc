import { expect, test } from '../src/fixtures/test.fixture.js'

const appBaseURL = process.env.APP_BASE_URL ?? 'http://localhost:5172'

test.use({ baseURL: appBaseURL })

test.describe('products flow', { tag: '@flow' }, () => {
  test('place order with current active user', async ({ page, productsPage }) => {
    await productsPage.open()
    await expect(productsPage.heading).toBeVisible()
    await expect(productsPage.activeUserHint).toContainText('Alice')

    await productsPage.placeOrder(0, 1)
    await expect(productsPage.notice).toContainText('Order placed successfully.')
    await expect(page.getByText(/Alice ordered 1 x/i)).toBeVisible()
  })
})
