#!/usr/bin/env tsx
// ─────────────────────────────────────────────────────────────
// resolve-tests.ts  –  Phase 2 Config-Driven Dynamic Selection
// ─────────────────────────────────────────────────────────────
//
// Reads suites.yaml + mapping.yaml, gets git diff from the
// parent frontend repo, validates tag separation, deduplicates,
// and runs Playwright with a generated --test-list file.
//
// Env vars:
//   TARGET_REPO_PATH  – path to the frontend repo   (default: "..")
//   DIFF_RANGE        – explicit git diff range      (default: "")
//   SUITE             – override default suite name  (default: from yaml)
//   DRY_RUN           – "true" to skip Playwright    (default: "false")
// ─────────────────────────────────────────────────────────────

import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { load as loadYaml } from 'js-yaml'

// ─── Types ───────────────────────────────────────────────────

export interface SuiteConfig {
  defaultSuite: string
  suites: Record<string, { tags: string[] }>
}

export interface MappingRule {
  pattern: string
  tests: string[]
}

export interface MappingConfig {
  rules: MappingRule[]
}

// ─── Paths & Env ─────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const configDir = resolve(__dirname, '../src/config')

const REPO_PATH = process.env.TARGET_REPO_PATH ?? '..'
const DIFF_RANGE = process.env.DIFF_RANGE ?? ''
const DRY_RUN = process.env.DRY_RUN === 'true'
const SUITE_OVERRIDE = process.env.SUITE ?? ''
const TEST_LIST_FILE =
  process.env.TEST_LIST_FILE ?? resolve(__dirname, '../.tmp/dynamic-test-list.txt')

// ─── 1. Load YAML configs ───────────────────────────────────

function loadConfig<T>(filename: string): T {
  const filepath = resolve(configDir, filename)
  const raw = readFileSync(filepath, 'utf-8')
  return loadYaml(raw) as T
}

// ─── 2. Collect changed files via git ────────────────────────

function collectChangedFiles(): string[] {
  const run = (cmd: string): string => {
    try {
      return execSync(cmd, { encoding: 'utf-8' }).trim()
    } catch {
      return ''
    }
  }

  let output: string

  if (DIFF_RANGE) {
    output = run(`git -C "${REPO_PATH}" diff --name-only ${DIFF_RANGE}`)
  } else {
    const parts = [
      run(`git -C "${REPO_PATH}" diff --name-only`),
      run(`git -C "${REPO_PATH}" diff --name-only --cached`),
      run(
        `git -C "${REPO_PATH}" rev-parse --verify HEAD~1 >/dev/null 2>&1 ` +
        `&& git -C "${REPO_PATH}" diff --name-only HEAD~1 HEAD`
      ),
    ]
    output = parts.filter(Boolean).join('\n')
  }

  return [...new Set(output.split('\n').filter(Boolean))].sort()
}

// ─── 3. Resolve suite tags ───────────────────────────────────

function resolveSuiteTags(config: SuiteConfig): Set<string> {
  const name = SUITE_OVERRIDE || config.defaultSuite
  const suite = config.suites[name]

  if (!suite) {
    console.error(`❌ Suite "${name}" not found in suites.yaml`)
    console.error(`   Available suites: ${Object.keys(config.suites).join(', ')}`)
    process.exit(1)
  }

  return new Set(suite.tags)
}

// ─── 4. Resolve mapped test ids from changed files ──────────

export function resolveMappedTests(
  config: MappingConfig,
  changedFiles: string[],
): Set<string> {
  const tests = new Set<string>()

  for (const file of changedFiles) {
    for (const rule of config.rules) {
      if (new RegExp(rule.pattern).test(file)) {
        rule.tests.forEach((testId) => tests.add(testId))
      }
    }
  }

  return tests
}

// ─── 5. Regex helper ─────────────────────────────────────────

export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// ─── 6. Playwright list helpers ──────────────────────────────

export function parseListOutput(output: string): string[] {
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => !line.startsWith('Listing tests:'))
    .filter((line) => !line.startsWith('Total:'))
    .filter((line) => line.includes('›') || line.includes('>'))
}

function collectAllListedTests(extraArgs: string): string[] {
  const cmd = `npx playwright test --list ${extraArgs}`.trim()
  const output = execSync(cmd, { encoding: 'utf-8' })
  return parseListOutput(output)
}

export function resolveSelectedTests(
  listedTests: string[],
  suiteTags: Set<string>,
  mappedTests: Set<string>,
): string[] {
  return listedTests.filter((line) => {
    const hitSuite = [...suiteTags].some((tag) => line.includes(tag))
    const hitMapped = [...mappedTests].some((testId) =>
      new RegExp(`(?:^|\\W)${escapeRegex(testId)}(?:$|\\W)`).test(line)
    )

    return hitSuite || hitMapped
  })
}

function writeTestListFile(filePath: string, selectedTests: string[]): void {
  mkdirSync(dirname(filePath), { recursive: true })

  const content = [
    '# Auto-generated by scripts/resolve-tests.ts',
    '# Source: git diff + suites.yaml + mapping.yaml',
    '',
    ...selectedTests,
    '',
  ].join('\n')

  writeFileSync(filePath, content, 'utf-8')
}

// ─── 7. Main ─────────────────────────────────────────────────

function main(): void {
  // Load
  const suitesConfig = loadConfig<SuiteConfig>('suites.yaml')
  const mappingConfig = loadConfig<MappingConfig>('mapping.yaml')

  // Collect
  const changedFiles = collectChangedFiles()

  // Resolve
  const suiteTags = resolveSuiteTags(suitesConfig)
  const mappedTests = resolveMappedTests(mappingConfig, changedFiles)

  // Collect all tests once, then filter by suite tags + mapped test ids
  const extraArgs = process.argv.slice(2).join(' ')
  const listedTests = collectAllListedTests(extraArgs)
  const selectedTests = resolveSelectedTests(listedTests, suiteTags, mappedTests)

  if (selectedTests.length === 0) {
    console.log('No tests selected. Exiting.')
    process.exit(0)
  }

  writeTestListFile(TEST_LIST_FILE, selectedTests)

  // Report
  console.log('┌─── Dynamic Test Selection (Phase 2) ───')
  console.log(`│ Repository:   ${REPO_PATH}`)
  console.log(`│ Changed files:`)
  if (changedFiles.length > 0) {
    changedFiles.forEach((f) => console.log(`│   ${f}`))
  } else {
    console.log('│   (none)')
  }
  console.log(`│ Suite tags:   ${[...suiteTags].join(' ')}`)
  console.log(`│ Mapped tests: ${[...mappedTests].join(' ') || '(none)'}`)
  console.log(`│ Test list:    ${TEST_LIST_FILE}`)
  console.log(`│ Selected:     ${selectedTests.length} tests`)
  console.log('└────────────────────────────────────────')

  if (DRY_RUN) {
    console.log('DRY_RUN=true → skipping Playwright execution')
    process.exit(0)
  }

  const cmd = `npx playwright test --test-list "${TEST_LIST_FILE}" ${extraArgs}`.trim()

  execSync(cmd, { stdio: 'inherit' })
}

function isDirectExecution(): boolean {
  if (!process.argv[1]) {
    return false
  }

  return import.meta.url === pathToFileURL(process.argv[1]).href
}

if (isDirectExecution()) {
  main()
}
