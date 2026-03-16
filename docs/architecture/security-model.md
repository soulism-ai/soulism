# Security Model

This platform is security-critical because it mediates tool execution.

---

## Threat model summary

### Key threats
- Prompt injection via retrieved content
- SSRF and internal network access via web tools
- Privilege escalation via tool chaining
- Data exfiltration via logs or tool outputs
- Supply-chain attacks via persona packs or plugins
- Replay or forgery of tool decisions

### Core mitigations
- Policy gate enforcement (code, not prompts)
- Signed persona packs (supply-chain integrity)
- Signed policy decisions (optional, recommended for high-risk)
- Strict allowlists (domains, file paths)
- Origin validation + auth for HTTP MCP transport
- Input/output schema validation at boundaries
- Audit logging with hash chaining

---

## Trust boundaries

1. **User/Agent runtime boundary**
   - Treat user input as untrusted.

2. **MCP server boundary**
   - MCP tool servers are isolated capabilities.
   - They must not be able to call each other without explicit routing and policy.

3. **Policy decision boundary**
   - Policy gate is authoritative for allow/confirm/deny.
   - Services must not “override” decisions.

4. **Data boundary**
   - Memory and audit are sensitive; access must be authenticated and authorized.

---

## Security requirements per component

### Web fetch tool
- domain allowlist
- no private IP ranges
- timeout + size limits
- strip active content; treat fetched text as untrusted

### Files tool
- path allowlist rooted at a workspace directory
- disallow symlink traversal
- no arbitrary execute permissions
- explicit read/write scopes

### Memory
- explicit consent for long-term storage
- deletion workflows
- encryption at rest (deployment concern, documented)

### Audit
- append-only + hash chain
- strict access controls
- redact secrets (store arg hashes, not raw args)

---

## “Secure by default” rules for code
- Validate inputs (Zod/JSON Schema)
- Never use unsafely constructed shell commands
- Never log raw payloads containing secrets
- Prefer allowlist over blocklist
