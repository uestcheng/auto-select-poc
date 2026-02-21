#!/usr/bin/env bash
set -euo pipefail

REPO_PATH="${TARGET_REPO_PATH:-..}"
DIFF_RANGE="${DIFF_RANGE:-}"
DRY_RUN="${DRY_RUN:-false}"

add_tag() {
  local tag="$1"
  case " ${TAGS} " in
    *" ${tag} "*) ;;
    *) TAGS="${TAGS} ${tag}" ;;
  esac
}

collect_changed_files() {
  if [[ -n "${DIFF_RANGE}" ]]; then
    git -C "${REPO_PATH}" diff --name-only "${DIFF_RANGE}" | sed '/^$/d' | sort -u
    return
  fi

  {
    git -C "${REPO_PATH}" diff --name-only || true
    git -C "${REPO_PATH}" diff --name-only --cached || true
    if git -C "${REPO_PATH}" rev-parse --verify HEAD~1 >/dev/null 2>&1; then
      git -C "${REPO_PATH}" diff --name-only HEAD~1 HEAD || true
    fi
  } | sed '/^$/d' | sort -u
}

CHANGED_FILES="$(collect_changed_files)"
TAGS="@smoke"

if [[ -n "${CHANGED_FILES}" ]]; then
  while IFS= read -r file; do
    case "$file" in
      src/pages/UsersPage.jsx|src/pages/UsersPage.ts|src/pages/UsersPage.tsx)
        add_tag "@UsersPage"
        ;;
      src/pages/ProductsPage.jsx|src/pages/ProductsPage.ts|src/pages/ProductsPage.tsx)
        add_tag "@ProductsPage"
        ;;
      src/components/*)
        add_tag "@UsersPage"
        add_tag "@ProductsPage"
        ;;
    esac
  done <<< "${CHANGED_FILES}"
fi

GREP_PATTERN="$(echo "${TAGS}" | xargs | sed 's/ /|/g')"

echo "Changed files (from ${REPO_PATH}):"
if [[ -n "${CHANGED_FILES}" ]]; then
  echo "${CHANGED_FILES}"
else
  echo "(none)"
fi

echo "Selected tags: $(echo "${TAGS}" | xargs)"
echo "Grep pattern: ${GREP_PATTERN}"

if [[ "${DRY_RUN}" == "true" ]]; then
  exit 0
fi

npx playwright test --grep "${GREP_PATTERN}" "$@"
