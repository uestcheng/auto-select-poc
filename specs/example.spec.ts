import { expect, test } from '@playwright/test'
import { ProductsPage } from '../src/page/products.page.js'
import { UsersPage } from '../src/page/users.page.js'

const appBaseURL = process.env.APP_BASE_URL ?? 'http://localhost:5172'

test.use({ baseURL: appBaseURL })


test('users to products order flow TC_SMOKE_USERS_TO_PRODUCTS @smoke', async ({ page }) => {
  const usersPage = new UsersPage(page)
  const productsPage = new ProductsPage(page)

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
