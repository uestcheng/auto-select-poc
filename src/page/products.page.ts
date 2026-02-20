import type { Locator, Page } from '@playwright/test'
import { TableComponent } from '../component/table.component.js'
import { BasePage } from './base.page.js'

export class ProductsPage extends BasePage {
  readonly heading: Locator
  readonly productNameInput: Locator
  readonly productPriceInput: Locator
  readonly productStockInput: Locator
  readonly saveProductButton: Locator
  readonly activeUserHint: Locator
  readonly notice: Locator
  readonly productsTable: TableComponent
  readonly recentOrdersHeading: Locator

  constructor(page: Page) {
    super(page)

    this.heading = page.getByRole('heading', { name: 'Product & Order Workflow' })
    this.productNameInput = page.getByTestId('product-name-input')
    this.productPriceInput = page.getByTestId('product-price-input')
    this.productStockInput = page.getByTestId('product-stock-input')
    this.saveProductButton = page.getByTestId('save-product-btn')
    this.activeUserHint = page.locator('.hint')
    this.notice = page.locator('.notice')
    this.productsTable = new TableComponent(page.getByTestId('product-list'))
    this.recentOrdersHeading = page.getByRole('heading', { name: 'Recent Orders' })
  }

  async open(): Promise<void> {
    await this.visit('/products')
  }

  async fillProductForm(name: string, price: number, stock: number): Promise<void> {
    await this.productNameInput.fill(name)
    await this.productPriceInput.fill(String(price))
    await this.productStockInput.fill(String(stock))
  }

  async submitProduct(): Promise<void> {
    await this.saveProductButton.click()
  }

  async addProduct(name: string, price: number, stock: number): Promise<void> {
    await this.fillProductForm(name, price, stock)
    await this.submitProduct()
  }

  quantityInputByRowIndex(rowIndex: number): Locator {
    return this.productsTable.getRowByIndex(rowIndex).locator('input[type="number"]').first()
  }

  placeOrderButtonByRowIndex(rowIndex: number): Locator {
    return this.productsTable.getButtonInRow(rowIndex, 'Place Order')
  }

  async setOrderQuantity(rowIndex: number, quantity: number): Promise<void> {
    await this.quantityInputByRowIndex(rowIndex).fill(String(quantity))
  }

  async placeOrder(rowIndex: number, quantity = 1): Promise<void> {
    await this.setOrderQuantity(rowIndex, quantity)
    await this.placeOrderButtonByRowIndex(rowIndex).click()
  }
}
