import { expect, test } from '@playwright/test'
import { ProductsPage } from '../src/page/products.page.js'
import { UsersPage } from '../src/page/users.page.js'

const appBaseURL = process.env.APP_BASE_URL ?? 'http://localhost:5172'

test.use({ baseURL: appBaseURL })

test('flow - create user only TC_USERS_CREATE @flow', async ({ page }) => {
  const usersPage = new UsersPage(page)
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

test('flow - place order with current active user TC_PRODUCTS_ORDER @flow', async ({ page }) => {
  const productsPage = new ProductsPage(page)

  await productsPage.open()
  await expect(productsPage.heading).toBeVisible()
  await expect(productsPage.activeUserHint).toContainText('Alice')

  await productsPage.placeOrder(0, 1)
  await expect(productsPage.notice).toContainText('Order placed successfully.')
  await expect(page.getByText(/Alice ordered 1 x/i)).toBeVisible()
})
