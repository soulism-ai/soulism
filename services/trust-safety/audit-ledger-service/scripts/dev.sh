#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

if pnpm run --silent dev >/dev/null 2>&1; then
  pnpm run dev
else
  pnpm run build
fi
