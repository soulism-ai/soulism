# Persona Registry Service (MCP)

Serves persona packs to agent runtimes via MCP tools/resources/prompts.

## Responsibilities
- load persona packs from `packs/` (or object storage)
- verify pack signatures (required in prod)
- provide tools:
  - list personas
  - get persona
  - get effective persona (composition)
  - render system prompt
- provide prompts:
  - activate persona (prompt bundle)

## Security
- never execute tools on behalf of personas
- refuse unsigned packs in production mode
