# MCP API Notes

MCP services expose:
- tools
- resources
- prompts

Each MCP service must ship a machine-readable contract file:
- `mcp.tools.json`

That contract is validated in CI.

Implementation guidance:
- stdio transport for local developer use
- HTTP transport for hosted deployments
- validate Origin for browser-based clients
- authenticate requests

