import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

const repoRoot = resolve(new URL('.', import.meta.url).pathname);

const escapeRegExp = (value: string): string => {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

const sourceAlias = (packageName: string, sourceDir: string) => {
  const rootDir = resolve(repoRoot, sourceDir);
  const escapedPackageName = escapeRegExp(packageName);
  return [
    {
      find: new RegExp(`^${escapedPackageName}$`),
      replacement: resolve(rootDir, 'index.ts')
    },
    {
      find: new RegExp(`^${escapedPackageName}/(.+)\\.js$`),
      replacement: `${rootDir}/$1.ts`
    }
  ];
};

export default defineConfig({
  plugins: [tsconfigPaths({ ignoreConfigErrors: true })],
  resolve: {
    alias: [
      ...sourceAlias('@soulism/shared', 'packages/shared/src'),
      ...sourceAlias('@soulism/persona-policy', 'packages/persona-policy/src'),
      ...sourceAlias('@soulism/persona-core', 'packages/persona-core/src'),
      ...sourceAlias('@soulism/persona-schema', 'packages/persona-schema/src'),
      ...sourceAlias('@soulism/persona-signing', 'packages/persona-signing/src')
    ]
  },
  test: {
    exclude: ['**/.next/**', '**/.open-next/**', '**/dist/**', '**/coverage/**'],
    server: {
      deps: {
        inline: [/^@soulism\//]
      }
    }
  }
});
