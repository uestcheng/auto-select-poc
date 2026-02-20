import type { Locator } from '@playwright/test'

export class TableComponent {
  private readonly root: Locator

  constructor(root: Locator) {
    this.root = root
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
