import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.cwd();

const requiredFiles = [
  'package.json',
  'tsconfig.json',
  'src/main.ts',
  'src/routes.ts',
  'openapi.yaml',
  'asyncapi.yaml',
  'k8s/deployment.yaml',
  'k8s/service.yaml',
  'k8s/ingress.yaml',
  'k8s/hpa.yaml',
  'k8s/networkpolicy.yaml'
];

const listServices = async (): Promise<string[]> => {
  const baseDirs = [join(root, 'services/mcp'), join(root, 'services/trust-safety'), join(root, 'services/edge')];
  const out: string[] = [];
  for (const base of baseDirs) {
    const entries = await readdir(base, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      out.push(join(base, entry.name));
    }
  }
  return out;
};

const run = async () => {
  const services = await listServices();
  const missing: string[] = [];

  for (const service of services) {
    for (const rel of requiredFiles) {
      try {
        const body = await readFile(join(service, rel));
        if (body.byteLength === 0) missing.push(`${service}/${rel} (empty)`);
      } catch {
        missing.push(`${service}/${rel} (missing)`);
      }
    }
  }

  if (missing.length > 0) {
    console.error('Service readiness checks failed:');
    for (const item of missing) console.error(`- ${item}`);
    process.exit(1);
  }

  console.log(`Service readiness checks passed (${services.length} services).`);
};

void run();
