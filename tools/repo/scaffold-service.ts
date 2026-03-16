import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const [servicePath] = process.argv.slice(2);

if (!servicePath) {
  console.error('Usage: pnpm tsx tools/repo/scaffold-service.ts <services/.../...>');
  process.exit(1);
}

const root = process.cwd();
const abs = join(root, servicePath);

const files: Array<[string, string]> = [
  ['package.json', JSON.stringify({ name: servicePath, private: true, version: '0.1.0', scripts: { build: 'tsc -p tsconfig.json' } }, null, 2)],
  ['tsconfig.json', JSON.stringify({ extends: '../../tsconfig.base.json', compilerOptions: { outDir: 'dist' }, include: ['src/**/*.ts'] }, null, 2)],
  ['src/main.ts', "console.log('service boot');\n"],
  ['src/routes.ts', "export const route = async () => ({ ok: true });\n"],
  ['openapi.yaml', "openapi: 3.1.0\ninfo:\n  title: service\n  version: 0.1.0\npaths: {}\n"],
  ['asyncapi.yaml', "asyncapi: 3.0.0\ninfo:\n  title: service-events\n  version: 0.1.0\n"],
  ['k8s/deployment.yaml', 'apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: service\n'],
  ['k8s/service.yaml', 'apiVersion: v1\nkind: Service\nmetadata:\n  name: service\n'],
  ['k8s/ingress.yaml', 'apiVersion: networking.k8s.io/v1\nkind: Ingress\nmetadata:\n  name: service\n'],
  ['k8s/hpa.yaml', 'apiVersion: autoscaling/v2\nkind: HorizontalPodAutoscaler\nmetadata:\n  name: service\n'],
  ['k8s/networkpolicy.yaml', 'apiVersion: networking.k8s.io/v1\nkind: NetworkPolicy\nmetadata:\n  name: service\n']
];

const run = async () => {
  await mkdir(abs, { recursive: true });
  for (const [rel, content] of files) {
    const filePath = join(abs, rel);
    await mkdir(join(filePath, '..'), { recursive: true });
    await writeFile(filePath, content, 'utf8');
  }
  console.log(`Scaffolded service at ${servicePath}`);
};

void run();
