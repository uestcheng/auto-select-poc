#!/usr/bin/env tsx

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

interface MappingRule {
  pattern: string
  specs: string[]
}

interface MappingConfig {
  rules: MappingRule[]
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const qaRoot = resolve(__dirname, '..')
const pagesDir = resolve(qaRoot, 'src/page')
const qaComponentsDir = resolve(qaRoot, 'src/component')
const fixturesDir = resolve(qaRoot, 'src/fixtures')
const specsDir = resolve(qaRoot, 'specs')
const outputPath = resolve(qaRoot, '.tmp/mapping.json')

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
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

function toPosixPath(value: string): string {
  return value.replaceAll('\\\\', '/')
}

function readUtf8(filePath: string): string {
  return readFileSync(filePath, 'utf-8')
}

function scanPageClassToFrontendPath(): Map<string, string> {
  const files = walkFiles(pagesDir, (filePath) => filePath.endsWith('.ts'))
  const result = new Map<string, string>()

  for (const file of files) {
    const source = readUtf8(file)
    const classNameMatch = source.match(/export\s+class\s+([A-Za-z0-9_]+)\s+extends\s+BasePage/)
    const superMatch = source.match(/super\(\s*page\s*,\s*['\"]([^'\"]+)['\"]\s*\)/)

    if (!classNameMatch || !superMatch) {
      continue
    }

    const className = classNameMatch[1]
    const frontendPath = toPosixPath(superMatch[1])
    result.set(className, frontendPath)
  }

  return result
}

function scanFixturePropToClassName(): Map<string, string> {
  const files = walkFiles(fixturesDir, (filePath) => filePath.endsWith('.ts'))
  const result = new Map<string, string>()

  for (const file of files) {
    const source = readUtf8(file)
    const regex = /([A-Za-z0-9_]+)\s*:\s*async[\s\S]*?new\s+([A-Za-z0-9_]+)\s*\(\s*page\s*\)/g
    let match: RegExpExecArray | null

    while ((match = regex.exec(source)) !== null) {
      const fixtureProp = match[1]
      const className = match[2]
      result.set(fixtureProp, className)
    }
  }

  return result
}

function parseFixturePropsFromAsyncParam(raw: string): string[] {
  return raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => part.replace(/\s*=.*$/, '').trim())
    .map((part) => {
      const aliasMatch = part.match(/^([A-Za-z0-9_]+)\s*:/)
      return aliasMatch ? aliasMatch[1] : part
    })
    .filter((part) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(part))
}

function scanSpecToFixtureProps(): Map<string, Set<string>> {
  const files = walkFiles(specsDir, (filePath) => filePath.endsWith('.spec.ts'))
  const result = new Map<string, Set<string>>()

  for (const file of files) {
    const source = readUtf8(file)
    const specPath = toPosixPath(relative(qaRoot, file))
    const props = new Set<string>()
    const regex = /test\s*\(\s*['\"][^'\"]+['\"]\s*,\s*async\s*\(\s*\{([^}]*)\}/g
    let match: RegExpExecArray | null

    while ((match = regex.exec(source)) !== null) {
      parseFixturePropsFromAsyncParam(match[1]).forEach((prop) => props.add(prop))
    }

    result.set(specPath, props)
  }

  return result
}

type FrontendComponent = {
  className: string
  frontendPath: string
}

function parseNamedImports(namedClause: string): string[] {
  return namedClause
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const asMatch = entry.match(/^([A-Za-z0-9_]+)\s+as\s+([A-Za-z0-9_]+)$/)
      if (asMatch) {
        return asMatch[2]
      }

      return entry
    })
}

function scanPoClassToImportedNames(): Map<string, Set<string>> {
  const files = walkFiles(pagesDir, (filePath) => filePath.endsWith('.ts'))
  const result = new Map<string, Set<string>>()

  for (const file of files) {
    const source = readUtf8(file)
    const classNameMatch = source.match(/export\s+class\s+([A-Za-z0-9_]+)\s+extends\s+BasePage/)

    if (!classNameMatch) {
      continue
    }

    const className = classNameMatch[1]
    const imports = new Set<string>()
    const importRegex = /import\s+([^;]+?)\s+from\s+['\"][^'\"]+['\"]/g
    let importMatch: RegExpExecArray | null

    while ((importMatch = importRegex.exec(source)) !== null) {
      const clause = importMatch[1].trim()

      if (clause.startsWith('{') && clause.endsWith('}')) {
        parseNamedImports(clause.slice(1, -1)).forEach((name) => imports.add(name))
        continue
      }

      if (clause.includes('{')) {
        const [defaultImport, namedPart] = clause.split('{')
        const defaultName = defaultImport.replace(',', '').trim()
        if (defaultName) {
          imports.add(defaultName)
        }

        const namedClause = namedPart.replace('}', '').trim()
        parseNamedImports(namedClause).forEach((name) => imports.add(name))
        continue
      }

      const defaultName = clause.trim()
      if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(defaultName)) {
        imports.add(defaultName)
      }
    }

    result.set(className, imports)
  }

  return result
}

function scanFrontendComponents(): FrontendComponent[] {
  if (!existsSync(qaComponentsDir)) {
    return []
  }

  const files = walkFiles(qaComponentsDir, (filePath) => /\.(tsx?|jsx?)$/.test(filePath))

  return files.flatMap((file) => {
    const source = readUtf8(file)
    const classNames = [...source.matchAll(/export\s+class\s+([A-Za-z0-9_]+)/g)].map(
      (match) => match[1],
    )
    const frontendPaths = [...source.matchAll(/componentName\s*=\s*['\"]([^'\"]+)['\"]/g)].map(
      (match) => toPosixPath(match[1]),
    )

    const pairCount = Math.min(classNames.length, frontendPaths.length)
    if (pairCount === 0) {
      return []
    }

    const pairs: FrontendComponent[] = []
    for (let index = 0; index < pairCount; index += 1) {
      pairs.push({
        className: classNames[index] || basename(file).replace(/\.[^.]+$/, ''),
        frontendPath: frontendPaths[index],
      })
    }

    return pairs
  })
}

function buildMappingConfig(
  classToFrontendPath: Map<string, string>,
  fixturePropToClassName: Map<string, string>,
  specToFixtureProps: Map<string, Set<string>>,
  poClassToImports: Map<string, Set<string>>,
  frontendComponents: FrontendComponent[],
): MappingConfig {
  const classToSpecs = new Map<string, Set<string>>()
  const frontendToSpecs = new Map<string, Set<string>>()

  for (const [specPath, fixtureProps] of specToFixtureProps.entries()) {
    for (const fixtureProp of fixtureProps) {
      const className = fixturePropToClassName.get(fixtureProp)
      if (!className) {
        continue
      }

      if (!classToSpecs.has(className)) {
        classToSpecs.set(className, new Set<string>())
      }
      classToSpecs.get(className)!.add(specPath)

      const frontendPath = classToFrontendPath.get(className)
      if (!frontendPath) {
        continue
      }

      if (!frontendToSpecs.has(frontendPath)) {
        frontendToSpecs.set(frontendPath, new Set<string>())
      }

      frontendToSpecs.get(frontendPath)!.add(specPath)
    }
  }

  for (const component of frontendComponents) {
    const specs = new Set<string>()

    for (const [poClassName, imports] of poClassToImports.entries()) {
      if (!imports.has(component.className)) {
        continue
      }

      const poSpecs = classToSpecs.get(poClassName)
      if (!poSpecs) {
        continue
      }

      for (const spec of poSpecs) {
        specs.add(spec)
      }
    }

    if (specs.size === 0) {
      continue
    }

    frontendToSpecs.set(component.frontendPath, specs)
  }

  const rules: MappingRule[] = [...frontendToSpecs.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([frontendPath, specs]) => ({
      pattern: `^${escapeRegex(frontendPath)}$`,
      specs: [...specs].sort((left, right) => left.localeCompare(right)),
    }))

  return { rules }
}

function main(): void {
  const classToFrontendPath = scanPageClassToFrontendPath()
  const fixturePropToClassName = scanFixturePropToClassName()
  const specToFixtureProps = scanSpecToFixtureProps()
  const poClassToImports = scanPoClassToImportedNames()
  const frontendComponents = scanFrontendComponents()
  const mapping = buildMappingConfig(
    classToFrontendPath,
    fixturePropToClassName,
    specToFixtureProps,
    poClassToImports,
    frontendComponents,
  )

  mkdirSync(dirname(outputPath), { recursive: true })
  writeFileSync(outputPath, `${JSON.stringify(mapping, null, 2)}\n`, 'utf-8')

  console.log('┌─── Generate Mapping (Phase 3) ───')
  console.log(`│ Page classes:    ${classToFrontendPath.size}`)
  console.log(`│ Fixture props:   ${fixturePropToClassName.size}`)
  console.log(`│ Specs scanned:   ${specToFixtureProps.size}`)
  console.log(`│ Components:      ${frontendComponents.length}`)
  console.log(`│ Mapping rules:   ${mapping.rules.length}`)
  console.log(`│ Output:          ${outputPath}`)
  console.log('└──────────────────────────────────')
}

main()
