import { spawnSync } from 'node:child_process';

const [target] = process.argv.slice(2);
if (!target) {
  console.error('Usage: pnpm tsx tools/repo/scaffold-mcp-service.ts <services/mcp/<name>>');
  process.exit(1);
}

const result = spawnSync('pnpm', ['tsx', 'tools/repo/scaffold-service.ts', target], { stdio: 'inherit' });
if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
console.log(`MCP service scaffolded at ${target}`);
