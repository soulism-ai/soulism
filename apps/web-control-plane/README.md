# Web Control Plane

Operator UI for the platform.

Capabilities:
- list persona packs and personas
- inspect effective personas (composition result)
- view policy decisions and reason codes
- search and inspect audit ledger
- view service health/readiness
- mint short-lived operator JWT sessions from server-side credentials and signing keys

Non-goals:
- end-user chat UI

Session issuer environment:
- `CONTROL_PLANE_REQUIRE_SESSION_ISSUER` (optional, set to `true` to make `/ready` fail until server-issued auth is configured)
- `CONTROL_PLANE_AUTH_USERNAME`
- `CONTROL_PLANE_AUTH_PASSWORD`
- `CONTROL_PLANE_AUTH_SUBJECT` (optional, defaults to username)
- `CONTROL_PLANE_AUTH_TENANT_ID` (optional, defaults to `default`)
- `CONTROL_PLANE_AUTH_ROLES` (optional CSV, defaults to `operator`)
- `CONTROL_PLANE_AUTH_EMAIL` (optional)
- `CONTROL_PLANE_JWT_ISSUER`
- `CONTROL_PLANE_JWT_AUDIENCE` (optional CSV, defaults to `control-plane`)
- `CONTROL_PLANE_JWT_SECRET` for `HS256`
- `CONTROL_PLANE_JWT_PRIVATE_KEY` or `CONTROL_PLANE_JWT_PRIVATE_KEY_PATH` for `RS256` / `EdDSA`
- `CONTROL_PLANE_JWT_ALGORITHM` (optional: `HS256`, `RS256`, `EdDSA`)
- `CONTROL_PLANE_JWT_EXPIRES_IN_SECONDS` (optional, defaults to `3600`)

Manual bearer-token sessions remain available for direct gateway debugging.
Direct credential-issued sessions against a non-proxy gateway return the token to the client without persisting the control-plane cookie.
