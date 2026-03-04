#!/usr/bin/env tsx

import { execSync } from 'node:child_process'
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { load as loadYaml } from 'js-yaml'

export interface SuiteConfig {
  defaultSuite: string
  suites: Record<string, { tags: string[] }>
}

export interface MappingRule {
  pattern: string
  specs: string[]
}

export interface MappingConfig {
  rules: MappingRule[]
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const configDir = resolve(__dirname, '../src/config')
const qaRoot = resolve(__dirname, '..')
const specsDir = resolve(qaRoot, 'specs')

const REPO_PATH = process.env.TARGET_REPO_PATH ?? '..'
const DIFF_RANGE = process.env.DIFF_RANGE ?? ''
const DRY_RUN = process.env.DRY_RUN === 'true'
const SUITE_OVERRIDE = process.env.SUITE ?? ''
const MAPPING_FILE =
  process.env.MAPPING_FILE ?? resolve(__dirname, '../.tmp/mapping.json')
const TEST_LIST_FILE =
  process.env.TEST_LIST_FILE ?? resolve(__dirname, '../.tmp/dynamic-test-list.txt')

function loadConfig<T>(filename: string): T {
  const filepath = resolve(configDir, filename)
  const raw = readFileSync(filepath, 'utf-8')
  return loadYaml(raw) as T
}

function loadMappingConfig(filePath: string): MappingConfig {
  const raw = readFileSync(filePath, 'utf-8')
  return JSON.parse(raw) as MappingConfig
}

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

export function resolveMappedSpecs(
  config: MappingConfig,
  changedFiles: string[],
): Set<string> {
  const specs = new Set<string>()

  for (const file of changedFiles) {
    for (const rule of config.rules) {
      if (new RegExp(rule.pattern).test(file)) {
        rule.specs.forEach((spec) => specs.add(spec))
      }
    }
  }

  return specs
}

export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function toPosixPath(value: string): string {
  return value.replaceAll('\\\\', '/')
}

// ── Trivial-change filter ────────────────────────────────

const TRIVIAL_CHANGE_EXTENSIONS = new Set([
  '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs',
  '.css', '.scss', '.less', '.sass',
  '.html', '.vue', '.svelte',
])

/**
 * Returns true when the trimmed line contains no functional code –
 * e.g. blank, single-line comment, block-comment body, JSX comment,
 * HTML comment, or JSDoc.
 */
export function isTrivialLine(line: string): boolean {
  const trimmed = line.trim()
  if (trimmed === '') return true
  // JS / TS single-line comment
  if (trimmed.startsWith('//')) return true
  // Block-comment open / close / body  (/*  */  * )
  if (/^(\/\*|\*\/|\*)/.test(trimmed)) return true
  // JSX comment  {/* … */}
  if (/^\{\s*\/\*.*\*\/\s*\}$/.test(trimmed)) return true
  // HTML comment  <!-- … -->
  if (trimmed.startsWith('<!--') || trimmed.startsWith('-->')) return true
  // CSS / SCSS single-line comment handled by  //  above
  return false
}

function extOf(filePath: string): string {
  const dot = filePath.lastIndexOf('.')
  return dot === -1 ? '' : filePath.substring(dot)
}

/**
 * Run `git diff -U0` (full patch, no context lines) and extract the
 * added / removed source lines per file path.
 */
export function collectDiffContent(
  repoPath: string,
  diffRange: string,
): Map<string, string[]> {
  const run = (cmd: string): string => {
    try {
      return execSync(cmd, { encoding: 'utf-8' }).trim()
    } catch {
      return ''
    }
  }

  const rawDiffs: string[] = []

  if (diffRange) {
    rawDiffs.push(run(`git -C "${repoPath}" diff -U0 ${diffRange}`))
  } else {
    rawDiffs.push(
      run(`git -C "${repoPath}" diff -U0`),
      run(`git -C "${repoPath}" diff -U0 --cached`),
      run(
        `git -C "${repoPath}" rev-parse --verify HEAD~1 >/dev/null 2>&1 ` +
        `&& git -C "${repoPath}" diff -U0 HEAD~1 HEAD`,
      ),
    )
  }

  const result = new Map<string, string[]>()

  for (const raw of rawDiffs) {
    if (!raw) continue
    let currentFile: string | null = null

    for (const line of raw.split('\n')) {
      const fileMatch = line.match(/^diff --git a\/.+ b\/(.+)$/)
      if (fileMatch) {
        currentFile = fileMatch[1]
        if (!result.has(currentFile)) result.set(currentFile, [])
        continue
      }

      if (
        currentFile &&
        (line.startsWith('+') || line.startsWith('-')) &&
        !line.startsWith('+++') &&
        !line.startsWith('---')
      ) {
        result.get(currentFile)!.push(line.slice(1))
      }
    }
  }

  return result
}

/**
 * Keep only files whose changes are *non-trivial*.
 * A file is considered trivially-changed when **every** added/removed line
 * is a comment, blank, or whitespace-only change.
 *
 * Files with unknown extensions or missing diff content are kept (safe default).
 */
export function filterTrivialChanges(
  files: string[],
  diffContent: Map<string, string[]>,
): string[] {
  return files.filter((file) => {
    if (!TRIVIAL_CHANGE_EXTENSIONS.has(extOf(file))) return true
    const lines = diffContent.get(file)
    if (!lines || lines.length === 0) return true
    return !lines.every((l) => isTrivialLine(l))
  })
}

function walkFiles(dirPath: string, predicate: (filePath: string) => boolean): string[] {
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

function normalizeSpecPath(specPath: string): string {
  return toPosixPath(specPath).replace(/^\.\//, '')
}

function scanTagsFromSpecSource(source: string): Set<string> {
  const tags = new Set<string>()
  const stringTagRegex = /tag\s*:\s*['\"](@[^'\"]+)['\"]/g
  const arrayTagRegex = /tag\s*:\s*\[([^\]]+)\]/g

  let match: RegExpExecArray | null

  while ((match = stringTagRegex.exec(source)) !== null) {
    tags.add(match[1])
  }

  while ((match = arrayTagRegex.exec(source)) !== null) {
    const listText = match[1]
    const itemRegex = /['\"](@[^'\"]+)['\"]/g
    let itemMatch: RegExpExecArray | null

    while ((itemMatch = itemRegex.exec(listText)) !== null) {
      tags.add(itemMatch[1])
    }
  }

  return tags
}

export function resolveSuiteSpecsByStaticScan(suiteTags: Set<string>): Set<string> {
  const specs = new Set<string>()
  const files = walkFiles(specsDir, (filePath) => filePath.endsWith('.spec.ts'))

  for (const file of files) {
    const source = readFileSync(file, 'utf-8')
    const specTags = scanTagsFromSpecSource(source)
    const hit = [...suiteTags].some((tag) => specTags.has(tag))

    if (hit) {
      specs.add(normalizeSpecPath(toPosixPath(relative(qaRoot, file))))
    }
  }

  return specs
}

function normalizeListEntry(line: string): string {
  const withoutProject = line.replace(/^\[[^\]]+\]\s*[›>]\s*/, '').trim()
  const segments = withoutProject
    .split(/\s*[›>]\s*/)
    .map((part) => part.trim())
    .filter(Boolean)

  if (segments.length === 0) {
    return ''
  }

  segments[0] = segments[0].replace(/:(\d+)(?::\d+)?$/, '')

  return segments.join(' › ')
}

export function parseListOutput(output: string): string[] {
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => !line.startsWith('Listing tests:'))
    .filter((line) => !line.startsWith('Total:'))
    .filter((line) => line.includes('›') || line.includes('>'))
    .map((line) => normalizeListEntry(line))
    .filter((line) => line.length > 0)
}

function collectAllListedTests(extraArgs: string): string[] {
  const cmd = `npx playwright test --list ${extraArgs}`.trim()
  const output = execSync(cmd, { encoding: 'utf-8' })
  return parseListOutput(output)
}

function matchSpecPathPrefix(line: string, specPath: string): boolean {
  const normalizedSpecPath = normalizeSpecPath(specPath)
  const filename = basename(normalizedSpecPath)

  return line.startsWith(`${normalizedSpecPath} ›`) || line.startsWith(`${filename} ›`)
}

export function resolveSelectedTests(
  listedTests: string[],
  suiteSpecs: Set<string>,
  mappedSpecs: Set<string>,
): string[] {
  return listedTests.filter((line) => {
    const hitSuite = [...suiteSpecs].some((specPath) => matchSpecPathPrefix(line, specPath))
    const hitMapped = [...mappedSpecs].some((specPath) => matchSpecPathPrefix(line, specPath))

    return hitSuite || hitMapped
  })
}

function writeTestListFile(filePath: string, selectedTests: string[]): void {
  mkdirSync(dirname(filePath), { recursive: true })

  const content = [
    '# Auto-generated by scripts/resolve-tests.ts',
    '# Source: git diff + suites.yaml + .tmp/mapping.json',
    '',
    ...selectedTests,
    '',
  ].join('\n')

  writeFileSync(filePath, content, 'utf-8')
}

function main(): void {
  const suitesConfig = loadConfig<SuiteConfig>('suites.yaml')
  const mappingConfig = loadMappingConfig(MAPPING_FILE)

  const changedFiles = collectChangedFiles()
  const diffContent = collectDiffContent(REPO_PATH, DIFF_RANGE)
  const meaningfulFiles = filterTrivialChanges(changedFiles, diffContent)
  const skippedFiles = changedFiles.filter((f) => !meaningfulFiles.includes(f))

  const suiteTags = resolveSuiteTags(suitesConfig)
  const suiteSpecs = resolveSuiteSpecsByStaticScan(suiteTags)
  const mappedSpecs = resolveMappedSpecs(mappingConfig, meaningfulFiles)

  const extraArgs = process.argv.slice(2).join(' ')
  const listedTests = collectAllListedTests(extraArgs)
  const selectedTests = resolveSelectedTests(listedTests, suiteSpecs, mappedSpecs)

  if (selectedTests.length === 0) {
    console.log('No tests selected. Exiting.')
    process.exit(0)
  }

  writeTestListFile(TEST_LIST_FILE, selectedTests)

  // Report
  console.log('┌─── Dynamic Test Selection (Phase 3) ───')
  console.log(`│ Repository:   ${REPO_PATH}`)
  console.log(`│ Changed files:`)
  if (changedFiles.length > 0) {
    meaningfulFiles.forEach((f) => console.log(`│   ${f}`))
    skippedFiles.forEach((f) => console.log(`│   ${f}  (trivial – skipped)`))
  } else {
    console.log('│   (none)')
  }
  console.log(`│ Suite tags:   ${[...suiteTags].join(' ') || '(none)'}`)
  console.log(`│ Suite specs:  ${[...suiteSpecs].join(' ') || '(none)'}`)
  console.log(`│ Mapped specs: ${[...mappedSpecs].join(' ') || '(none)'}`)
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
