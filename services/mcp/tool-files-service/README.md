# Tool Files Service (MCP)

Constrained file operations within an allowlisted workspace.

## Responsibilities
- read/write files under a configured root
- disallow symlink traversal
- enforce scopes and confirmation on writes

## Security
- no arbitrary execution
- audit all writes/deletes
