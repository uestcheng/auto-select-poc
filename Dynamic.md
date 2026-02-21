# Dynamic Test Selection (Phase 1)

This document describes the current dynamic test-selection strategy.

## Goal

Run only a focused subset of tests in CI by combining:

- Default smoke coverage (`@smoke`)
- Extra page tags based on frontend file changes from `git diff`

## Scope (Phase 1)

In Phase 1, dynamic tag selection is based on file changes in `frontend/src/pages` and `frontend/src/components`:

- `src/pages/UsersPage.*` -> add `@UsersPage`
- `src/pages/ProductsPage.*` -> add `@ProductsPage`
- `src/components/*` -> add both `@UsersPage` and `@ProductsPage`

If no mapping is matched, tests still run with `@smoke`.

## How it works

Script: `qa/scripts/run-dynamic-selection.sh`

1. Read changed files from the frontend repo (`..`) using `git diff`
2. Start with `@smoke`
3. Append mapped tags by changed paths
4. Build grep pattern, e.g. `@smoke|@ProductsPage`
5. Run:

```bash
npx playwright test --grep "<pattern>"
```

## Commands

From `frontend/qa`:

- Dry run (preview tags only):

```bash
DRY_RUN=true npm run test:dynamic
```

- Execute dynamic selection:

```bash
npm run test:dynamic
```

- Optional diff range:

```bash
DIFF_RANGE="origin/main...HEAD" npm run test:dynamic
```

## CI

Workflow: `.github/workflows/e2e-playwright.yml`

- Trigger: `push`
- Browser: Chromium only
- Test command: `npm run test:dynamic`

## Notes

This is **Phase 1** and intentionally simple.
Next phases can extend mappings and support more granular component-to-page ownership.
