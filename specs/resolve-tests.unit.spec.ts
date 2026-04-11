import { expect, test } from '@playwright/test'
import {
  filterTrivialChanges,
  isTrivialLine,
  parseListOutput,
  resolveMappedSpecs,
  resolveSelectedTests,
  type MappingConfig,
} from '../scripts/resolve-tests.js'

test.describe('resolve-tests unit', () => {
  test('parseListOutput should keep only valid list lines', async () => {
    const raw = [
      'Listing tests:',
      '  [chromium] › specs/example.spec.ts:10:1 › users to products order flow',
      '  [chromium] › specs/example.create-order.spec.ts:27:1 › create user then place order',
      'Total: 2 tests in 1 file',
      '',
    ].join('\n')

    const result = parseListOutput(raw)

    expect(result).toEqual([
      'specs/example.spec.ts › users to products order flow',
      'specs/example.create-order.spec.ts › create user then place order',
    ])
  })

  test('resolveMappedSpecs should map changed files to unique spec paths', async () => {
    const mapping: MappingConfig = {
      rules: [
        { pattern: '^src/pages/UsersPage\\.jsx$', specs: ['specs/example.spec.ts'] },
        { pattern: '^src/pages/ProductsPage\\.jsx$', specs: ['specs/example.create-order.spec.ts'] },
        { pattern: '^src/components/.+', specs: ['specs/example.spec.ts', 'specs/example.flow.spec.ts'] },
      ],
    }

    const changedFiles = [
      'src/pages/UsersPage.jsx',
      'src/components/Layout.jsx',
      'src/components/Layout.jsx',
    ]

    const result = resolveMappedSpecs(mapping, changedFiles)

    expect([...result].sort()).toEqual([
      'specs/example.flow.spec.ts',
      'specs/example.spec.ts',
    ])
  })

  test('resolveSelectedTests should include suite-spec and mapped-spec matches', async () => {
    const listedTests = [
      'specs/example.spec.ts › users to products order flow',
      'example.create-order.spec.ts › create user then place order',
      'specs/example.flow.spec.ts › create user only',
      'example.flow.spec.ts › place order with current active user',
      'specs/other.spec.ts › should not match',
    ]

    const suiteSpecs = new Set(['specs/example.spec.ts'])
    const mappedSpecs = new Set(['specs/example.flow.spec.ts'])

    const result = resolveSelectedTests(listedTests, suiteSpecs, mappedSpecs)

    expect(result).toEqual([
      'specs/example.spec.ts › users to products order flow',
      'specs/example.flow.spec.ts › create user only',
      'example.flow.spec.ts › place order with current active user',
    ])
  })

  test.describe('isTrivialLine', () => {
    const trivialLines = [
      '',
      '   ',
      '// this is a comment',
      '  // indented comment',
      '/* block comment */',
      '/** JSDoc open */',
      ' * JSDoc body line',
      ' */ block close',
      '*/',
      '{/* JSX comment */}',
      '  {/* spaced JSX comment */}  ',
      '<!-- HTML comment -->',
      '<!-- opening HTML comment',
      '--> closing HTML comment',
    ]

    for (const line of trivialLines) {
      test(`trivial: "${line}"`, () => {
        expect(isTrivialLine(line)).toBe(true)
      })
    }

    const meaningfulLines = [
      'const x = 1',
      'import { Foo } from "./bar"',
      'return <div>hello</div>',
      'export default App',
      '  console.log("test")',
      'function handleClick() {',
      '.container { display: flex; }',
    ]

    for (const line of meaningfulLines) {
      test(`meaningful: "${line}"`, () => {
        expect(isTrivialLine(line)).toBe(false)
      })
    }
  })

  test.describe('filterTrivialChanges', () => {
    test('keeps file when diff contains at least one meaningful line', () => {
      const files = ['src/pages/UsersPage.jsx']
      const diffContent = new Map([
        ['src/pages/UsersPage.jsx', [
          '// added comment',
          'const newVar = true',
        ]],
      ])

      expect(filterTrivialChanges(files, diffContent)).toEqual(files)
    })

    test('drops file when diff is only comments and blanks', () => {
      const files = ['src/pages/UsersPage.jsx']
      const diffContent = new Map([
        ['src/pages/UsersPage.jsx', [
          '// probe',
          '',
          '/* another comment */',
        ]],
      ])

      expect(filterTrivialChanges(files, diffContent)).toEqual([])
    })

    test('keeps non-source-code files regardless of content', () => {
      const files = ['README.md']
      const diffContent = new Map([
        ['README.md', ['// looks like a comment but md']],
      ])

      expect(filterTrivialChanges(files, diffContent)).toEqual(['README.md'])
    })

    test('keeps file when no diff content is available', () => {
      const files = ['src/pages/NewPage.jsx']
      const diffContent = new Map<string, string[]>()

      expect(filterTrivialChanges(files, diffContent)).toEqual(files)
    })

    test('mixed: keeps meaningful, drops trivial', () => {
      const files = [
        'src/components/UsersTable.jsx',
        'src/components/ProductsTable.jsx',
      ]
      const diffContent = new Map([
        ['src/components/UsersTable.jsx', ['// just a comment']],
        ['src/components/ProductsTable.jsx', ['export const name = "products"']],
      ])

      expect(filterTrivialChanges(files, diffContent)).toEqual([
        'src/components/ProductsTable.jsx',
      ])
    })
  })
})

test.describe('phase4 script integration', () => {
  const { execSync } = require('node:child_process')
  const qaRoot = require('node:path').resolve(__dirname, '..')

  test('generate-mapping exits 0 (pageName lint passes)', () => {
    expect(() => {
      execSync('npx tsx scripts/generate-mapping.ts', { cwd: qaRoot, stdio: 'pipe' })
    }).not.toThrow()
  })

  test('validate-testids exits 0 (testid contracts pass)', () => {
    expect(() => {
      execSync('npx tsx scripts/validate-testids.ts', { cwd: qaRoot, stdio: 'pipe' })
    }).not.toThrow()
  })
})
