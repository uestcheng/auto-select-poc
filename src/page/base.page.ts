import { expect, type Locator, type Page } from '@playwright/test'

export class BasePage {
  protected readonly page: Page

  constructor(page: Page) {
    this.page = page;
  }

  async visit(url: string) {
    await this.page.goto(url);
    await this.page.waitForLoadState('domcontentloaded')
  }
  
}
