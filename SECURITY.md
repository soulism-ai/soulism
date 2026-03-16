# Security Policy

## Reporting a vulnerability
If you believe you’ve found a security vulnerability:

1. Do **not** open a public GitHub issue.
2. Send a report to the security contact listed in your organization process.

Include:
- affected component(s)
- reproduction steps / PoC
- expected impact
- suggested mitigation (if any)

## Scope
In scope:
- all `services/**`
- all `packages/**`
- persona pack loading and signing
- policy gating and audit logging
- MCP transports (stdio + HTTP)

Out of scope:
- vulnerabilities in third-party dependencies (report upstream, but we still accept awareness reports)

## Security design principles

### 1) Tool execution is never direct
All tool calls are mediated by:
- policy gate decisions
- budgets and scopes
- audit logging

### 2) Treat all data as untrusted
- user input
- retrieved content (prompt injection risk)
- upstream responses

### 3) Least privilege
Each service gets the minimal permissions it needs.

### 4) Supply-chain integrity
- persona packs must be signed in production
- decisions can be signed and verified
- dependency scanning and SBOM generation must be enabled

## Supported versions
Only the latest release line is supported unless otherwise documented.
