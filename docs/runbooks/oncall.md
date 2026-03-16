# On-Call Runbook

## Services
- API Gateway
- Policy Gate
- Audit Ledger
- Risk Budget
- Persona Registry (MCP)
- Memory (MCP)
- Tool servers (webfetch/files)

## Primary signals
- elevated 5xx or latency
- policy gate unavailable (tool servers degrade)
- audit append failures (high severity)
- memory store errors

## First 15 minutes checklist
1. Identify impacted service(s)
2. Check `/health` and `/ready`
3. Check recent deploys and rollback if needed
4. Check audit ledger health (priority)
5. If policy gate is down, enforce deny-by-default on tool servers

## Escalation
Escalate to maintainers for:
- audit ledger integrity issues
- suspected data exfiltration
- signing key compromise
