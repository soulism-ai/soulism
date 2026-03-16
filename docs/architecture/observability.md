# Observability

This platform must be observable by default.

---

## Logs
- JSON structured logs in production
- include: timestamp, level, service, request_id, trace_id, actor, persona_id

## Metrics
Minimum metrics per service:
- request count, error count, latency histograms
- tool decision counts (allow/confirm/deny)
- budget exceeded counts
- audit append latency

## Tracing
- propagate W3C `traceparent`
- one trace per request
- include spans for:
  - policy decision call
  - audit append
  - storage operations
  - external fetches

## Alerts
Examples:
- audit ledger append failures
- policy gate unavailable
- memory store errors
- budget exceeded spikes
- high error rates on tool servers

