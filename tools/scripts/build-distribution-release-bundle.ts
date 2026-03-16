import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { verifyPayload } from '../../packages/shared/src/crypto.js';

type SignatureMetadata = {
  channel: string;
  descriptor: string;
  publisher: string;
  digest: string;
  signature: string;
  publicKey: string;
  createdAt: string;
  compatibility: {
    minCliVersion: string;
    runtimes: string[];
  };
};

const root = process.cwd();

const entries = [
  { channel: 'openai', signaturePath: 'marketplace/openai/signature.json' },
  { channel: 'claude', signaturePath: 'marketplace/claude/signature.json' },
  { channel: 'copilot-studio', signaturePath: 'marketplace/copilot-studio/signature.json' },
  { channel: 'hf-space', signaturePath: 'marketplace/hf/signature.json' }
] as const;

const digestOf = (content: string): string => `sha256:${createHash('sha256').update(content).digest('hex')}`;

const run = async () => {
  const channels: Array<{
    channel: string;
    descriptorPath: string;
    descriptorDigest: string;
    signaturePath: string;
    signatureDigest: string;
    signatureValid: boolean;
    digestMatchesDescriptor: boolean;
    publisher: string;
    compatibility: SignatureMetadata['compatibility'];
  }> = [];

  for (const entry of entries) {
    const signaturePath = join(root, entry.signaturePath);
    const signatureRaw = await readFile(signaturePath, 'utf8');
    const signature = JSON.parse(signatureRaw) as SignatureMetadata;

    const descriptorPath = join(root, signature.descriptor);
    const descriptorRaw = await readFile(descriptorPath, 'utf8');
    const descriptorDigest = digestOf(descriptorRaw);
    const digestMatchesDescriptor = signature.digest === descriptorDigest;
    const signatureValid = verifyPayload(signature.digest, signature.signature, signature.publicKey);

    channels.push({
      channel: signature.channel,
      descriptorPath: signature.descriptor,
      descriptorDigest,
      signaturePath: entry.signaturePath,
      signatureDigest: digestOf(signatureRaw),
      signatureValid,
      digestMatchesDescriptor,
      publisher: signature.publisher,
      compatibility: signature.compatibility
    });
  }

  const adapterParityPath = join(root, 'ci/baselines/adapter-parity.probe.json');
  const adapterParityRaw = await readFile(adapterParityPath, 'utf8');
  const adapterParity = JSON.parse(adapterParityRaw) as {
    schemaVersion: string;
    passed: boolean;
    mismatches: string[];
  };
  const adapterE2EPath = join(root, 'ci/baselines/evals/adapter-e2e-parity.report.json');
  const adapterE2ERaw = await readFile(adapterE2EPath, 'utf8');
  const adapterE2E = JSON.parse(adapterE2ERaw) as {
    schemaVersion: string;
    passed: boolean;
    failures: string[];
  };
  const adapterRuntimePath = join(root, 'ci/baselines/evals/adapter-runtime-parity.report.json');
  const adapterRuntimeRaw = await readFile(adapterRuntimePath, 'utf8');
  const adapterRuntime = JSON.parse(adapterRuntimeRaw) as {
    schemaVersion: string;
    passed: boolean;
    failures: string[];
  };
  const adapterFrameworkPath = join(root, 'ci/baselines/evals/adapter-framework-parity.report.json');
  const adapterFrameworkRaw = await readFile(adapterFrameworkPath, 'utf8');
  const adapterFramework = JSON.parse(adapterFrameworkRaw) as {
    schemaVersion: string;
    passed: boolean;
    failures: string[];
  };
  const adapterFrameworkBootPath = join(root, 'ci/baselines/evals/adapter-framework-boot.report.json');
  const adapterFrameworkBootRaw = await readFile(adapterFrameworkBootPath, 'utf8');
  const adapterFrameworkBoot = JSON.parse(adapterFrameworkBootRaw) as {
    schemaVersion: string;
    passed: boolean;
    failures: string[];
  };
  const adapterFrameworkCliBootPath = join(root, 'ci/baselines/evals/adapter-framework-cli-boot.report.json');
  const adapterFrameworkCliBootRaw = await readFile(adapterFrameworkCliBootPath, 'utf8');
  const adapterFrameworkCliBoot = JSON.parse(adapterFrameworkCliBootRaw) as {
    schemaVersion: string;
    passed: boolean;
    failures: string[];
  };

  const payload = {
    schemaVersion: '1.0.0',
    generatedAt: new Date().toISOString(),
    release: {
      id: process.env.RELEASE_ID || process.env.GITHUB_RUN_ID || 'local',
      commit: process.env.GITHUB_SHA || 'local',
      ref: process.env.GITHUB_REF_NAME || process.env.GITHUB_REF || 'local',
      runId: process.env.GITHUB_RUN_ID || 'local'
    },
    crossBrandParity: {
      descriptorParity: {
        reportPath: 'ci/baselines/adapter-parity.probe.json',
        reportDigest: digestOf(adapterParityRaw),
        schemaVersion: adapterParity.schemaVersion,
        passed: adapterParity.passed,
        mismatches: adapterParity.mismatches
      },
      e2eParity: {
        reportPath: 'ci/baselines/evals/adapter-e2e-parity.report.json',
        reportDigest: digestOf(adapterE2ERaw),
        schemaVersion: adapterE2E.schemaVersion,
        passed: adapterE2E.passed,
        failures: adapterE2E.failures
      },
      runtimeParity: {
        reportPath: 'ci/baselines/evals/adapter-runtime-parity.report.json',
        reportDigest: digestOf(adapterRuntimeRaw),
        schemaVersion: adapterRuntime.schemaVersion,
        passed: adapterRuntime.passed,
        failures: adapterRuntime.failures
      },
      frameworkParity: {
        reportPath: 'ci/baselines/evals/adapter-framework-parity.report.json',
        reportDigest: digestOf(adapterFrameworkRaw),
        schemaVersion: adapterFramework.schemaVersion,
        passed: adapterFramework.passed,
        failures: adapterFramework.failures
      },
      frameworkBootParity: {
        reportPath: 'ci/baselines/evals/adapter-framework-boot.report.json',
        reportDigest: digestOf(adapterFrameworkBootRaw),
        schemaVersion: adapterFrameworkBoot.schemaVersion,
        passed: adapterFrameworkBoot.passed,
        failures: adapterFrameworkBoot.failures
      },
      frameworkCliBootParity: {
        reportPath: 'ci/baselines/evals/adapter-framework-cli-boot.report.json',
        reportDigest: digestOf(adapterFrameworkCliBootRaw),
        schemaVersion: adapterFrameworkCliBoot.schemaVersion,
        passed: adapterFrameworkCliBoot.passed,
        failures: adapterFrameworkCliBoot.failures
      }
    },
    channels,
    verification: {
      allSignaturesValid: channels.every((x) => x.signatureValid),
      allDigestsMatch: channels.every((x) => x.digestMatchesDescriptor),
      descriptorParityPassed: adapterParity.passed,
      e2eParityPassed: adapterE2E.passed,
      runtimeParityPassed: adapterRuntime.passed,
      frameworkParityPassed: adapterFramework.passed,
      frameworkBootParityPassed: adapterFrameworkBoot.passed,
      frameworkCliBootParityPassed: adapterFrameworkCliBoot.passed
    }
  };
  const digest = digestOf(JSON.stringify(payload));
  const bundle = {
    ...payload,
    digest
  };

  const outPath = join(root, 'ci', 'baselines', 'distribution-release-bundle.json');
  await writeFile(outPath, JSON.stringify(bundle, null, 2), 'utf8');
  if (
    !payload.verification.allSignaturesValid ||
    !payload.verification.allDigestsMatch ||
    !payload.verification.descriptorParityPassed ||
    !payload.verification.e2eParityPassed ||
    !payload.verification.runtimeParityPassed ||
    !payload.verification.frameworkParityPassed ||
    !payload.verification.frameworkBootParityPassed ||
    !payload.verification.frameworkCliBootParityPassed
  ) {
    throw new Error('distribution_release_bundle_verification_failed');
  }
  console.log(`Distribution release bundle written: ${outPath}`);
};

void run().catch((error) => {
  console.error(String(error));
  process.exit(1);
});
