import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

type AdapterDescriptor = {
  id: string;
  runtime: string;
  contract: {
    schemaVersion: string;
    transport: {
      protocol: string;
      auth: string;
      requestEnvelope: string;
      responseEnvelope: string;
      traceHeader: string;
    };
    policyEnforcement: boolean;
    auditEmission: boolean;
    compatibility: {
      minCliVersion: string;
      minSdkVersion: string;
      mcpSchemaVersion: string;
    };
  };
};

type DescriptorRecord = {
  descriptor: AdapterDescriptor;
  digest: string;
};

const root = process.cwd();

const readDescriptor = async (path: string): Promise<DescriptorRecord> => {
  const raw = await readFile(path, 'utf8');
  const digest = createHash('sha256').update(raw).digest('hex');
  return {
    descriptor: JSON.parse(raw) as AdapterDescriptor,
    digest: `sha256:${digest}`
  };
};

const compareTransportFields = (left: AdapterDescriptor, right: AdapterDescriptor): string[] => {
  const fields: Array<{ key: string; a: string | boolean; b: string | boolean }> = [
    { key: 'contract.schemaVersion', a: left.contract?.schemaVersion, b: right.contract?.schemaVersion },
    { key: 'contract.transport.protocol', a: left.contract?.transport?.protocol, b: right.contract?.transport?.protocol },
    { key: 'contract.transport.auth', a: left.contract?.transport?.auth, b: right.contract?.transport?.auth },
    {
      key: 'contract.transport.requestEnvelope',
      a: left.contract?.transport?.requestEnvelope,
      b: right.contract?.transport?.requestEnvelope
    },
    {
      key: 'contract.transport.responseEnvelope',
      a: left.contract?.transport?.responseEnvelope,
      b: right.contract?.transport?.responseEnvelope
    },
    { key: 'contract.transport.traceHeader', a: left.contract?.transport?.traceHeader, b: right.contract?.transport?.traceHeader },
    { key: 'contract.policyEnforcement', a: left.contract?.policyEnforcement, b: right.contract?.policyEnforcement },
    { key: 'contract.auditEmission', a: left.contract?.auditEmission, b: right.contract?.auditEmission },
    {
      key: 'contract.compatibility.mcpSchemaVersion',
      a: left.contract?.compatibility?.mcpSchemaVersion,
      b: right.contract?.compatibility?.mcpSchemaVersion
    }
  ];

  return fields.filter((field) => field.a !== field.b).map((field) => `${field.key}:${left.id}=${String(field.a)} ${right.id}=${String(field.b)}`);
};

const run = async () => {
  const nextPath = join(root, 'ci/adapters/nextjs.adapter.json');
  const expoPath = join(root, 'ci/adapters/expo.adapter.json');
  const hfPath = join(root, 'ci/adapters/hf.adapter.json');

  const [next, expo, hf] = await Promise.all([
    readDescriptor(nextPath),
    readDescriptor(expoPath),
    readDescriptor(hfPath)
  ]);

  const mismatches: string[] = [];
  mismatches.push(...compareTransportFields(next.descriptor, expo.descriptor));

  const report = {
    schemaVersion: '1.0.0',
    baseline: 'nextjs-adapter',
    comparison: 'expo-adapter',
    normalizedTransportContract: {
      protocol: next.descriptor.contract.transport.protocol,
      auth: next.descriptor.contract.transport.auth,
      requestEnvelope: next.descriptor.contract.transport.requestEnvelope,
      responseEnvelope: next.descriptor.contract.transport.responseEnvelope,
      traceHeader: next.descriptor.contract.transport.traceHeader
    },
    compatibilityBaseline: {
      minCliVersion: next.descriptor.contract.compatibility.minCliVersion,
      minSdkVersion: next.descriptor.contract.compatibility.minSdkVersion,
      mcpSchemaVersion: next.descriptor.contract.compatibility.mcpSchemaVersion
    },
    adapters: [
      { id: next.descriptor.id, runtime: next.descriptor.runtime, digest: next.digest },
      { id: expo.descriptor.id, runtime: expo.descriptor.runtime, digest: expo.digest },
      { id: hf.descriptor.id, runtime: hf.descriptor.runtime, digest: hf.digest }
    ],
    mismatches,
    passed: mismatches.length === 0,
    createdAt: new Date().toISOString()
  };

  const outPath = join(root, 'ci/baselines/adapter-parity.probe.json');
  await writeFile(outPath, JSON.stringify(report, null, 2), 'utf8');

  if (!report.passed) {
    throw new Error(`adapter_contract_parity_failed:${mismatches.join(',')}`);
  }

  console.log('Adapter parity probe passed.');
};

void run().catch((error) => {
  console.error(String(error));
  process.exit(1);
});
