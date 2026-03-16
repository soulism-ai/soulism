# HF Space Cognitive AI adapter

The adapter exposes a production-like integration surface for end-to-end policy mediation.

## Available endpoints
- `GET /` — metadata and endpoint catalog
- `GET /health` — health check
- `GET /ready` — readiness check
- `GET /personas` — list available personas from persona registry
- `GET /personas/{personaId}/effective` — resolved persona payload
- `POST /run` — policy check + tool dispatch

## `/run` workflow
`POST /run` requires:
- `personaId`, `userId`, `tenantId`
- `tool`:
  - `tool:webfetch`
  - `memory:write` / `memory:read`
  - `filesystem:read` / `filesystem:write`
- `action`
- `riskClass`

Optional:
- `confirm=true` (sends `x-policy-confirmed`)
- `scope`, `value`, `ttlMs`, `path`, `content`

Response always includes:
- `traceId`
- `policy` decision
- `toolResult` with tool response shape
- `serviceHealth` snapshot
