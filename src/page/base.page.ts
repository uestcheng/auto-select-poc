import { expect, type Locator, type Page } from '@playwright/test'

export class BasePage {
  protected readonly page: Page
  readonly pageName?: string

  constructor(page: Page, pageName?: string) {
    this.page = page
    this.pageName = pageName
  }

  async visit(url: string) {
    await this.page.goto(url)
    await this.page.waitForLoadState('domcontentloaded')
  }
  
}
