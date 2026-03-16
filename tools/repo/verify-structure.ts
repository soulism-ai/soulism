import { access } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.cwd();

const requiredPaths = [
  'apps',
  'packages',
  'services',
  'ci',
  '.github/workflows',
  'marketplace',
  'packs'
];

const run = async () => {
  const failures: string[] = [];
  for (const rel of requiredPaths) {
    try {
      await access(join(root, rel));
    } catch {
      failures.push(rel);
    }
  }

  if (failures.length > 0) {
    console.error(`Missing required paths: ${failures.join(', ')}`);
    process.exit(1);
  }

  console.log('Repository structure validation passed.');
};

void run();
