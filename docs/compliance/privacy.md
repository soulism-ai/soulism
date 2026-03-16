# Privacy Notes (Engineering)

## Data categories
- audit logs (sensitive operational data)
- memory (potential personal data)
- policy decisions (may include user identifiers)
- telemetry (must be minimal)

## Principles
- minimize data collection
- store only what is necessary
- implement retention and deletion
- avoid storing raw tool arguments that might contain secrets/PII

## Implementation guidance
- hash sensitive arguments before storage
- separate identifiers from content where possible
- treat long-term memory as opt-in
