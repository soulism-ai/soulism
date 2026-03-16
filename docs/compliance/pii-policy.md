# PII Policy (Engineering)

This policy defines how to treat personally identifiable information (PII).

## Rules
- Do not log PII in application logs.
- Audit logs store hashes and summaries; avoid raw payloads.
- Long-term memory requires explicit consent.

## Detection
- Add PII detectors in `ci/policies/pii-detectors.yaml`
- Add tests that verify redaction behavior
