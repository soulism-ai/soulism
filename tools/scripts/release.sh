#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/../.."

pnpm run lint
pnpm run typecheck
pnpm run build
pnpm tsx tools/sbom/cyclonedx.ts
if [[ -n "${AUDIT_LEDGER_URL:-}" ]]; then
  pnpm tsx tools/scripts/export-audit-evidence.ts
fi
pnpm run smoke
