import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = resolve(process.cwd(), '..', '..');
const manifestScriptPath = resolve(repoRoot, 'tools', 'scripts', 'build-web-docs-manifest.ts');

if (!existsSync(manifestScriptPath)) {
  console.log('[docs:manifest] Skipping manifest generation (repo tools script not found).');
  process.exit(0);
}

const command = spawnSync('pnpm', ['-C', repoRoot, 'exec', 'tsx', 'tools/scripts/build-web-docs-manifest.ts'], {
  stdio: 'inherit'
});

if (command.status !== 0) {
  const code = command.status ?? 1;
  process.exit(code);
}
