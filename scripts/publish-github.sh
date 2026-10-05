#!/usr/bin/env bash
set -euo pipefail
REPO="${1:-xuda1979/a6gp}"
VISIBILITY="${2:-private}"
if ! command -v gh >/dev/null 2>&1; then
  echo "GitHub CLI (gh) is required." >&2
  exit 2
fi
if ! gh auth status >/dev/null 2>&1; then
  echo "Authenticate GitHub CLI before publishing." >&2
  exit 3
fi
if [[ "$VISIBILITY" != "public" && "$VISIBILITY" != "private" ]]; then
  echo "visibility must be public or private" >&2
  exit 4
fi
if [[ ! -d .git ]]; then git init -b main; fi
git add .
if ! git diff --cached --quiet; then
  git commit -m "Initial A6GP v0.4 protocol, reference runtime, and TCK"
fi
if gh repo view "$REPO" >/dev/null 2>&1; then
  git remote get-url origin >/dev/null 2>&1 || git remote add origin "https://github.com/${REPO}.git"
else
  gh repo create "$REPO" "--$VISIBILITY" --source=. --remote=origin --description "A6GP Agent-Native 6G Protocol: specification, reference runtime, schemas, and conformance tests"
fi
git push -u origin main
