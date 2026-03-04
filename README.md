# Auto-select POC - Frontend QA

Phase 3 dynamic E2E selection：自动生成 `frontend file -> spec files` 映射，只运行受影响测试。

## Quick Start

```bash
# 1. Start frontend app (from frontend/)
npm install && npm run dev

# 2. Install QA dependencies (from frontend/qa/)
npm install && npx playwright install

# 3. Run all tests
npm test

# 4. Run Phase 3 dynamic selection
npm run test:dynamic

# 5. Dry run (only resolve list, do not execute tests)
DRY_RUN=true npm run test:dynamic
```

## How Dynamic Selection Works (Phase 3)

```
git diff -> changed frontend files
  ↓
generate-mapping.ts scans:
  src/page/*.ts       (super(page, 'src/pages/xxx'))
  src/fixtures/*.ts   (new PageClass(page) -> fixture prop)
  specs/**/*.spec.ts  (async ({ fixtureProp }))
  ↓
.tmp/mapping.json (pattern -> spec paths)
  ↓
resolve-tests.ts:
  - load suites.yaml tags
  - static scan spec source for test.describe(..., { tag: ... })
  - union(suite specs, mapped specs)
  - playwright --list + --test-list
```

## Config

- `src/config/suites.yaml`: 定义 suite 与 tag
- `.tmp/mapping.json`: 运行时自动生成，不提交代码库

## Env Vars

| Variable | Default | Description |
|---|---|---|
| `TARGET_REPO_PATH` | `..` | `git diff` 所在 frontend repo 路径 |
| `DIFF_RANGE` | _(auto)_ | 指定 diff 区间，例如 `origin/main...HEAD` |
| `SUITE` | from yaml | 覆盖默认 suite |
| `DRY_RUN` | `false` | `true` 时不执行 Playwright，仅输出选择结果 |
| `MAPPING_FILE` | `.tmp/mapping.json` | 映射文件路径 |
| `TEST_LIST_FILE` | `.tmp/dynamic-test-list.txt` | 输出 test-list 路径 |

## npm Scripts

| Script | Command |
|---|---|
| `test` | `playwright test` |
| `test:unit` | 运行 `resolve-tests.unit.spec.ts` |
| `generate:mapping` | 生成 `.tmp/mapping.json` |
| `test:dynamic` | `generate:mapping` + 动态选择执行 |
| `test:ui` | `playwright test --ui` |
| `test:headed` | `playwright test --headed` |


