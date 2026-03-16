# Open-source Quick Start

This project is intended to be runnable as an open-source application, not just read as architecture.

## Fastest local path

Prereqs:
- Docker
- Node.js LTS
- pnpm

Run from the repository root:

```bash
pnpm install
pnpm oss:up
```

Open:
- `http://localhost:3000` for the web app and admin console
- `http://localhost:8080/health` for the API gateway
- `http://localhost:3000/ready` to verify the web surface can reach the gateway

Default local operator credentials:
- username: `operator`
- password: `localdev`

These credentials exist only for the local open-source stack. Change them before using the project outside local development.

## What the local stack starts

- web control plane
- API gateway
- policy gate
- risk budget service
- audit ledger
- persona registry
- memory service
- file tool service
- webfetch tool service
- Redis

## Product framing

The admin console is not the primary product surface. Treat it as operator tooling for:
- health checks
- audit inspection
- policy debugging
- persona inspection

If you want a Soulism-style product posture, the main story should be:
- self-hosting
- source ownership
- persistent memory
- real tool integrations
- optional admin tooling

## Common commands

```bash
pnpm oss:logs
pnpm oss:down
pnpm run test
pnpm run smoke
```
