#!/usr/bin/env tsx

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const qaRoot = resolve(__dirname, '..')
const frontendRoot = resolve(qaRoot, '..')
const pagesDir = resolve(qaRoot, 'src/page')
const componentsDir = resolve(qaRoot, 'src/component')

function walkFiles(dirPath: string, predicate: (filePath: string) => boolean): string[] {
  if (!existsSync(dirPath)) return []
  const result: string[] = []

  for (const entry of readdirSync(dirPath)) {
    const fullPath = resolve(dirPath, entry)
    const stat = statSync(fullPath)

    if (stat.isDirectory()) {
      result.push(...walkFiles(fullPath, predicate))
      continue
    }

    if (predicate(fullPath)) {
      result.push(fullPath)
    }
  }

  return result
}

function readUtf8(filePath: string): string {
  return readFileSync(filePath, 'utf-8')
}

function toPosixPath(value: string): string {
  return value.replaceAll('\\\\', '/')
}

interface TestIdUsage {
  testId: string
  poFile: string
  frontendPaths: string[]
}

/**
 * Scan component files: build className → frontendPath map.
 */
function scanComponentFrontendPaths(): Map<string, string> {
  const files = walkFiles(componentsDir, (f) => f.endsWith('.ts') && !f.endsWith('.spec.ts'))
  const result = new Map<string, string>()

  for (const file of files) {
    const source = readUtf8(file)
    const classRegex = /export\s+class\s+([A-Za-z0-9_]+)/g
    const componentNameRegex = /componentName\s*=\s*['"]([^'"]+)['"]/g

    const classNames = [...source.matchAll(classRegex)].map((m) => m[1])
    const paths = [...source.matchAll(componentNameRegex)].map((m) => toPosixPath(m[1]))

    const count = Math.min(classNames.length, paths.length)
    for (let i = 0; i < count; i++) {
      result.set(classNames[i], paths[i])
    }
  }

  return result
}

/**
 * Extract imported class names from a PO source file.
 */
function extractImportedClassNames(source: string): Set<string> {
  const names = new Set<string>()
  const importRegex = /import\s+\{([^}]+)\}\s+from\s+['"][^'"]+['"]/g
  let match: RegExpExecArray | null

  while ((match = importRegex.exec(source)) !== null) {
    match[1].split(',').forEach((entry) => {
      const name = entry.trim().replace(/\s+as\s+\w+/, '').trim()
      if (name) names.add(name)
    })
  }

  return names
}

/**
 * Scan PO page files: extract pageName from super() and all getByTestId calls.
 * For each page PO, the search scope includes the page's own frontend file
 * plus any component frontend files imported by that PO.
 */
function collectPageTestIds(componentPaths: Map<string, string>): TestIdUsage[] {
  const files = walkFiles(pagesDir, (f) => f.endsWith('.ts') && !f.endsWith('.spec.ts'))
  const usages: TestIdUsage[] = []

  for (const file of files) {
    const source = readUtf8(file)
    const superMatch = source.match(/super\(\s*page\s*,\s*['"]([^'"]+)['"]\s*\)/)
    if (!superMatch) continue

    const pageFrontendPath = toPosixPath(superMatch[1])
    const poFile = toPosixPath(relative(qaRoot, file))

    // Collect frontend paths: page itself + imported components
    const frontendPaths = [pageFrontendPath]
    const imports = extractImportedClassNames(source)
    for (const className of imports) {
      const componentPath = componentPaths.get(className)
      if (componentPath) frontendPaths.push(componentPath)
    }

    const testIdRegex = /getByTestId\(\s*['"]([^'"]+)['"]\s*\)/g
    let match: RegExpExecArray | null
    while ((match = testIdRegex.exec(source)) !== null) {
      usages.push({ testId: match[1], poFile, frontendPaths })
    }
  }

  return usages
}

/**
 * Scan component files: extract componentName and all getByTestId calls.
 */
function collectComponentTestIds(): TestIdUsage[] {
  const files = walkFiles(componentsDir, (f) => f.endsWith('.ts') && !f.endsWith('.spec.ts'))
  const usages: TestIdUsage[] = []

  for (const file of files) {
    const source = readUtf8(file)
    const componentNameRegex = /componentName\s*=\s*['"]([^'"]+)['"]/g
    let componentMatch: RegExpExecArray | null

    const componentPaths: string[] = []
    while ((componentMatch = componentNameRegex.exec(source)) !== null) {
      componentPaths.push(toPosixPath(componentMatch[1]))
    }

    if (componentPaths.length === 0) continue

    const poFile = toPosixPath(relative(qaRoot, file))

    const testIdRegex = /getByTestId\(\s*['"]([^'"]+)['"]\s*\)/g
    let match: RegExpExecArray | null
    while ((match = testIdRegex.exec(source)) !== null) {
      usages.push({ testId: match[1], poFile, frontendPaths: componentPaths })
    }
  }

  return usages
}

/**
 * Check whether a frontend file contains data-testid="<id>" (or dynamic pattern).
 * Returns true if the testid is present.
 */
function frontendHasTestId(frontendFilePath: string, testId: string): boolean {
  if (!existsSync(frontendFilePath)) return false

  const source = readUtf8(frontendFilePath)

  // Exact static match: data-testid="xxx"
  if (source.includes(`data-testid="${testId}"`)) return true

  // Dynamic testid pattern: data-testid={`prefix-${...}`}
  // If the PO testId contains a pattern like "select-user-1", check if frontend
  // has a data-testid template with the prefix portion
  const prefixMatch = testId.match(/^(.+?)-?\d+$/)
  if (prefixMatch) {
    const prefix = prefixMatch[1]
    if (source.includes(`data-testid={\`${prefix}`)) return true
    if (source.includes(`data-testid={\`${prefix}-`)) return true
  }

  return false
}

function main(): void {
  const componentPaths = scanComponentFrontendPaths()
  const allUsages = [...collectPageTestIds(componentPaths), ...collectComponentTestIds()]

  if (allUsages.length === 0) {
    console.log('No getByTestId usages found in PO files.')
    process.exit(0)
  }

  const missing: TestIdUsage[] = []

  for (const usage of allUsages) {
    const found = usage.frontendPaths.some((fp) => {
      const fullPath = resolve(frontendRoot, fp)
      return existsSync(fullPath) && frontendHasTestId(fullPath, usage.testId)
    })

    if (!found) {
      missing.push(usage)
    }
  }

  // Report
  console.log('┌─── TestID Contract Validation ───')
  console.log(`│ PO testid usages scanned: ${allUsages.length}`)
  console.log(`│ Missing in frontend:      ${missing.length}`)
  console.log('└──────────────────────────────────')

  if (missing.length > 0) {
    console.error('')
    console.error('❌ Missing data-testid attributes in frontend files:')
    for (const m of missing) {
      console.error(`   data-testid="${m.testId}"`)
      console.error(`     PO:       ${m.poFile}`)
      console.error(`     Checked:  ${m.frontendPaths.join(', ')}`)
    }
    process.exit(1)
  }

  console.log('✅ All testid contracts satisfied.')
}

main()
