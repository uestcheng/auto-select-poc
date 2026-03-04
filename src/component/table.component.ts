import type { Locator } from '@playwright/test'

class BaseTableComponent {
  private readonly root: Locator
  readonly componentName: string

  constructor(root: Locator, componentName: string) {
    this.root = root
    this.componentName = componentName
  }

  getRoot(): Locator {
    return this.root
  }

  getHeaderCells(): Locator {
    return this.root.locator('thead th')
  }

  getRows(): Locator {
    return this.root.locator('tbody tr')
  }

  getRowByIndex(index: number): Locator {
    return this.getRows().nth(index)
  }

  getRowByTestId(testId: string): Locator {
    return this.root.getByTestId(testId)
  }

  getCell(rowIndex: number, colIndex: number): Locator {
    return this.getRowByIndex(rowIndex).locator('td').nth(colIndex)
  }

  getButtonInRow(rowIndex: number, buttonName: string): Locator {
    return this.getRowByIndex(rowIndex).getByRole('button', { name: buttonName })
  }
}

export class UsersTableComponent extends BaseTableComponent {
  constructor(root: Locator, componentName = 'src/components/UsersTable.jsx') {
    super(root, componentName)
  }
}

export class ProductsTableComponent extends BaseTableComponent {
  constructor(root: Locator, componentName = 'src/components/ProductsTable.jsx') {
    super(root, componentName)
  }
}
