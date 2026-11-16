#!/bin/sh
# Vercel "Ignored Build Step" shared by every project in this repo.
# Exit 0 skips the build; any other exit code builds.
# Usage (from a project's vercel.json): sh <path to this file> <folder> [<folder>...]
# Folders are relative to the repository root. The build is skipped only when we can prove
# that none of them changed since this project's last deployment; anything unexpected
# (first deploy, the previous commit missing from Vercel's shallow clone, git errors) builds.

prev="${VERCEL_GIT_PREVIOUS_SHA:-}"
if [ -z "$prev" ]; then
  echo "No previous deployment: build."
  exit 1
fi
cd "$(git rev-parse --show-toplevel)" || exit 1
if ! git cat-file -e "$prev^{commit}" 2>/dev/null; then
  if ! git fetch --quiet --depth=1 origin "$prev" 2>/dev/null; then
    echo "Previous deployment commit $prev is not available: build."
    exit 1
  fi
fi
if git diff --quiet "$prev" HEAD -- "$@"; then
  echo "No changes in $* since $prev: skip build."
  exit 0
fi
echo "Changes in $* since $prev: build."
exit 1
