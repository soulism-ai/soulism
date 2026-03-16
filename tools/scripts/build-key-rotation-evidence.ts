import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.cwd();

const run = async () => {
  const policy = JSON.parse(await readFile(join(root, 'ci/policies/signing-rotation.policy.json'), 'utf8')) as {
    schemaVersion: string;
    rotationIntervalDays: number;
    channels: Record<string, { currentKeyId: string; previousKeyId?: string; rotatedAt: string }>;
  };

  const signatures = [
    { channel: 'openai', path: 'marketplace/openai/signature.json' },
    { channel: 'claude', path: 'marketplace/claude/signature.json' },
    { channel: 'copilot-studio', path: 'marketplace/copilot-studio/signature.json' },
    { channel: 'hf-space', path: 'marketplace/hf/signature.json' }
  ] as const;

  const now = Date.now();
  const channels = signatures.map((entry) => {
    const metadata = readFile(join(root, entry.path), 'utf8').then((raw) => JSON.parse(raw) as {
      keyId: string;
      createdAt: string;
      signingMode?: string;
      digest: string;
    });
    return { entry, metadata };
  });

  const resolved = await Promise.all(
    channels.map(async (item) => {
      const metadata = await item.metadata;
      const policyChannel = policy.channels[item.entry.channel];
      const rotatedAt = Date.parse(policyChannel?.rotatedAt || '');
      const ageDays = Number.isNaN(rotatedAt) ? Number.POSITIVE_INFINITY : Math.floor((now - rotatedAt) / (24 * 60 * 60 * 1000));
      return {
        channel: item.entry.channel,
        signaturePath: item.entry.path,
        keyId: metadata.keyId,
        signingMode: metadata.signingMode || 'unknown',
        digest: metadata.digest,
        policyCurrentKeyId: policyChannel?.currentKeyId || '',
        policyPreviousKeyId: policyChannel?.previousKeyId || '',
        rotatedAt: policyChannel?.rotatedAt || '',
        keyAgeDays: ageDays,
        withinRotationWindow: Number.isFinite(ageDays) && ageDays <= policy.rotationIntervalDays,
        keyMatchesPolicy: metadata.keyId === policyChannel?.currentKeyId
      };
    })
  );

  const payload = {
    schemaVersion: '1.0.0',
    createdAt: new Date().toISOString(),
    releaseId: process.env.RELEASE_ID || process.env.GITHUB_RUN_ID || 'local',
    rotationIntervalDays: policy.rotationIntervalDays,
    channels: resolved,
    passed: resolved.every((c) => c.withinRotationWindow && c.keyMatchesPolicy)
  };
  const digest = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  const evidence = {
    ...payload,
    digest: `sha256:${digest}`
  };

  const out = join(root, 'ci', 'baselines', 'key-rotation-evidence.json');
  await writeFile(out, JSON.stringify(evidence, null, 2), 'utf8');

  if (!payload.passed) {
    console.error('Key rotation evidence failed policy checks.');
    process.exit(1);
  }

  console.log(`Key rotation evidence generated: ${out}`);
};

void run().catch((error) => {
  console.error(String(error));
  process.exit(1);
});
