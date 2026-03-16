import { defineProject, defineWorkspace, mergeConfig } from 'vitest/config';
import baseConfig from './vitest.config.mts';

const createProject = (name: string, include: string[]) =>
  mergeConfig(
    baseConfig,
    defineProject({
      test: {
        name,
        include,
        environment: 'node',
        globals: true,
        pool: 'threads',
        sequence: { concurrent: false }
      }
    })
  );

export default defineWorkspace([
  createProject('unit', ['packages/**/test/**/*.spec.ts', 'apps/**/test/**/*.spec.ts']),
  createProject('integration', ['services/**/test/integration/**/*.spec.ts']),
  createProject('smoke', ['ci/smoke/**/*.spec.ts'])
]);
