# Disaster Recovery

This file defines recovery objectives.

## Objectives (examples)
- Audit ledger: RPO ~ 0, RTO minutes
- Policy gate: RPO small, RTO minutes
- Memory: RPO depends on retention, RTO hours

## Backups
- Postgres: scheduled backups + PITR
- Object storage: versioned buckets for persona packs

## Recovery drills
Run quarterly DR drills, document results and corrective actions.
