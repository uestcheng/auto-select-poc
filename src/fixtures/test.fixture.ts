import { test as base, expect } from '@playwright/test'
import { ProductsPage } from '../page/products.page.js'
import { UsersPage } from '../page/users.page.js'

type AppFixtures = {
  usersPage: UsersPage
  productsPage: ProductsPage
}

export const test = base.extend<AppFixtures>({
  usersPage: async ({ page }, use) => {
    const usersPage = new UsersPage(page)
    await use(usersPage)
  },
  productsPage: async ({ page }, use) => {
    const productsPage = new ProductsPage(page)
    await use(productsPage)
  },
})

export { expect }
