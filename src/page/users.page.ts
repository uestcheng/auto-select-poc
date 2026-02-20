import type { Locator, Page } from '@playwright/test'
import { TableComponent } from '../component/table.component.js'
import { BasePage } from './base.page.js'

export class UsersPage extends BasePage {
  readonly heading: Locator
  readonly nameInput: Locator
  readonly emailInput: Locator
  readonly saveUserButton: Locator
  readonly userTable: TableComponent

  constructor(page: Page) {
    super(page)

    this.heading = page.getByRole('heading', { name: 'User Management'})
    this.nameInput = page.getByTestId('user-name-input')
    this.emailInput = page.getByTestId('user-email-input')
    this.saveUserButton = page.getByTestId('save-user-btn')
    this.userTable = new TableComponent(page.getByTestId('user-table'))
  }

  async open(): Promise<void> {
    await this.visit('/users')
  }

  async fillUserForm(name: string, email: string): Promise<void> {
    await this.nameInput.fill(name)
    await this.emailInput.fill(email)
  }

  async submitUser(): Promise<void> {
    await this.saveUserButton.click()
  }

  async addUser(name: string, email: string): Promise<void> {
    await this.fillUserForm(name, email)
    await this.submitUser()
  }

  selectUserButtonById(userId: number): Locator {
    return this.page.getByTestId(`select-user-${userId}`)
  }

  editUserButtonById(userId: number): Locator {
    return this.page.getByTestId(`edit-user-${userId}`)
  }

  deleteUserButtonById(userId: number): Locator {
    return this.page.getByTestId(`delete-user-${userId}`)
  }

  async selectUser(userId: number): Promise<void> {
    await this.selectUserButtonById(userId).click()
  }

  async editUser(userId: number): Promise<void> {
    await this.editUserButtonById(userId).click()
  }

  async deleteUser(userId: number): Promise<void> {
    await this.deleteUserButtonById(userId).click()
  }
}
