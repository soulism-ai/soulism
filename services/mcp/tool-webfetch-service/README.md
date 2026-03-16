# Tool WebFetch Service (MCP)

Safe web retrieval tool.

## Responsibilities
- fetch content from allowlisted domains
- protect against SSRF and private IP access
- enforce timeouts, size limits, and content sanitization

## Security
- treat fetched content as untrusted
- no automatic tool chaining without policy
