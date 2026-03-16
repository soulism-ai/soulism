# Key Rotation

Keys exist for:
- persona pack signing
- service auth tokens (if used)
- decision signing (optional)

## Rotation rules
- rotate on schedule (e.g., quarterly)
- rotate immediately on suspected compromise
- maintain key IDs and validity windows

## Pack signing
- publish new public keys
- allow overlap period where both old and new signatures validate
