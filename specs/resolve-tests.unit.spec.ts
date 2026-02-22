import { expect, test } from '@playwright/test'
import {
  parseListOutput,
  resolveMappedTests,
  resolveSelectedTests,
  type MappingConfig,
} from '../scripts/resolve-tests.js'

test.describe('resolve-tests unit', () => {
  test('parseListOutput should keep only valid list lines', async () => {
    const raw = [
      'Listing tests:',
      '  [chromium] › example.spec.ts:10:1 › users to products order flow TC_SMOKE_USERS_TO_PRODUCTS @smoke',
      '  [chromium] › example.spec.ts:27:1 › create user then place order TC_SMOKE_CREATE_USER_ORDER @smoke',
      'Total: 2 tests in 1 file',
      '',
    ].join('\n')

    const result = parseListOutput(raw)

    expect(result).toEqual([
      'example.spec.ts › users to products order flow TC_SMOKE_USERS_TO_PRODUCTS @smoke',
      'example.spec.ts › create user then place order TC_SMOKE_CREATE_USER_ORDER @smoke',
    ])
  })

  test('resolveMappedTests should map changed files to unique TC ids', async () => {
    const mapping: MappingConfig = {
      rules: [
        { pattern: 'src/pages/UsersPage\\.', tests: ['TC_USERS_CREATE'] },
        { pattern: 'src/pages/ProductsPage\\.', tests: ['TC_PRODUCTS_ORDER'] },
        { pattern: 'src/components/', tests: ['TC_USERS_CREATE', 'TC_PRODUCTS_ORDER'] },
      ],
    }

    const changedFiles = [
      'src/pages/UsersPage.jsx',
      'src/components/Layout.jsx',
      'src/components/Layout.jsx',
    ]

    const result = resolveMappedTests(mapping, changedFiles)

    expect([...result].sort()).toEqual(['TC_PRODUCTS_ORDER', 'TC_USERS_CREATE'])
  })

  test('resolveSelectedTests should include suite-tag and mapped-TC matches', async () => {
    const listedTests = [
      'example.spec.ts › users to products order flow TC_SMOKE_USERS_TO_PRODUCTS @smoke',
      'example.spec.ts › create user then place order TC_SMOKE_CREATE_USER_ORDER @smoke',
      'example.spec.ts › flow - create user only TC_USERS_CREATE',
      'example.spec.ts › flow - place order with current active user TC_PRODUCTS_ORDER',
      'example.spec.ts › should not match TC_PRODUCTS_ORDER_EXTENDED',
    ]

    const suiteTags = new Set(['@smoke'])
    const mappedTests = new Set(['TC_PRODUCTS_ORDER'])

    const result = resolveSelectedTests(listedTests, suiteTags, mappedTests)

    expect(result).toEqual([
      'example.spec.ts › users to products order flow TC_SMOKE_USERS_TO_PRODUCTS @smoke',
      'example.spec.ts › create user then place order TC_SMOKE_CREATE_USER_ORDER @smoke',
      'example.spec.ts › flow - place order with current active user TC_PRODUCTS_ORDER',
    ])
  })
})
