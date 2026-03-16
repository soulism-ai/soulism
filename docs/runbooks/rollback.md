# Rollback Runbook

Rollback is acceptable and encouraged when:
- error rates spike after deploy
- latency exceeds SLO
- contract tests fail in production

## Steps
1. Identify last known good version (tags/images)
2. Roll back the affected service via Helm:
   - `helm rollback <release> <revision>`
3. Verify:
   - `/health` and `/ready`
   - smoke tests
4. Document rollback in incident timeline
