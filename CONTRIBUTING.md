# Contributing

## Dev environment
- Node.js LTS
- pnpm
- Docker

## Setup
```bash
pnpm install
pnpm -r build
```

## Local verification (required before PR)
```bash
pnpm lint
pnpm typecheck
pnpm -r test
pnpm verify
pnpm smoke
```

## Adding a new service
Do not hand-roll new services.

Use the scaffolder:
- `tools/repo/scaffold-service.ts` (or CLI wrapper)

Every service must include:
- Dockerfile
- Helm chart + templates
- K8s manifests
- `.env.example`
- OpenAPI/AsyncAPI contracts (or explicit “none” in docs)
- scripts `dev.sh` and `test.sh`
- layered src structure
- test folders (contract/unit/integration/e2e)

## Pull requests
- Use the PR template.
- Keep PRs small and scoped.
- Add/update docs and ADRs when changing architecture.

## Code style
- TypeScript strict mode
- No `any` in exported APIs
- Schema validation at boundaries (Zod/JSON Schema)

## Security
- Never commit secrets
- Prefer env vars for configuration
- Follow the patterns in `docs/architecture/security-model.md`
