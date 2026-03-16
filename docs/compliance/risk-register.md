# Risk Register (Initial)

| Risk | Impact | Mitigation | Owner |
|---|---|---|---|
| Prompt injection via web content | tool misuse / data exfil | policy gate + untrusted content handling | Security |
| SSRF in webfetch tool | internal network access | allowlists + private IP blocks | Security |
| Unsigned persona packs | supply-chain compromise | require signed packs in prod | Platform |
| Audit log tampering | compliance failure | append-only + hash chaining | Platform |
| Memory privacy breach | user harm | opt-in memory + deletion + encryption | Platform |
