# Incident Response Runbook

## Severity levels
- SEV0: active compromise, data exfil, widespread outage
- SEV1: major outage, partial data corruption risk
- SEV2: degraded performance, localized issues
- SEV3: minor bugs, no customer impact

## Process
1. Declare incident and start logging timeline.
2. Identify blast radius (services, tenants, data).
3. Contain:
   - disable high-risk tools (policy deny)
   - rotate credentials if needed
4. Eradicate:
   - patch vulnerability
   - deploy fix
5. Recover:
   - verify health and data integrity
6. Postmortem:
   - root cause
   - corrective actions
   - update runbooks and tests

## Evidence
- export audit logs for time window
- capture config + release versions
- preserve traces/logs
