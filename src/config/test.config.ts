export type TestMappingRule = {
  sourcePattern: RegExp
  tests: string[]
}

export const testMappings: TestMappingRule[] = []

export function resolveTestsByChangedFiles(changedFiles: string[]): string[] {
  const selected = new Set<string>()

  for (const file of changedFiles) {
    for (const rule of testMappings) {
      if (rule.sourcePattern.test(file)) {
        rule.tests.forEach((testFile) => selected.add(testFile))
      }
    }
  }

  return [...selected]
}
