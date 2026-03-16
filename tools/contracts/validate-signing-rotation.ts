import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

type RotationPolicy = {
  schemaVersion: string;
  rotationIntervalDays: number;
  channels: Record<
    string,
    {
      currentKeyId: string;
      previousKeyId?: string;
      rotatedAt: string;
    }
  >;
};

const root = process.cwd();
const failures: string[] = [];

const signatureFiles = [
  { channel: 'openai', path: 'marketplace/openai/signature.json' },
  { channel: 'claude', path: 'marketplace/claude/signature.json' },
  { channel: 'copilot-studio', path: 'marketplace/copilot-studio/signature.json' },
  { channel: 'hf-space', path: 'marketplace/hf/signature.json' }
] as const;

const run = async () => {
  const policyPath = join(root, 'ci/policies/signing-rotation.policy.json');
  const policy = JSON.parse(await readFile(policyPath, 'utf8')) as RotationPolicy;

  if (policy.schemaVersion !== '1.0.0') failures.push(`${policyPath}: invalid_schemaVersion`);
  if (!Number.isFinite(policy.rotationIntervalDays) || policy.rotationIntervalDays <= 0) {
    failures.push(`${policyPath}: invalid_rotationIntervalDays`);
  }

  for (const file of signatureFiles) {
    const raw = JSON.parse(await readFile(join(root, file.path), 'utf8')) as {
      keyId?: string;
      channel?: string;
      createdAt?: string;
    };
    const channelPolicy = policy.channels[file.channel];
    if (!channelPolicy) {
      failures.push(`${policyPath}: missing_channel_policy(${file.channel})`);
      continue;
    }
    if (!channelPolicy.currentKeyId) failures.push(`${policyPath}: missing_currentKeyId(${file.channel})`);
    if (!channelPolicy.rotatedAt || Number.isNaN(Date.parse(channelPolicy.rotatedAt))) {
      failures.push(`${policyPath}: invalid_rotatedAt(${file.channel})`);
    }
    if (!raw.keyId) failures.push(`${file.path}: missing_keyId`);
    if (raw.keyId && raw.keyId !== channelPolicy.currentKeyId) {
      failures.push(`${file.path}: keyId_mismatch_with_policy(${raw.keyId}!=${channelPolicy.currentKeyId})`);
    }
    if (raw.channel !== file.channel) {
      failures.push(`${file.path}: channel_mismatch_with_policy`);
    }
  }

  if (failures.length > 0) {
    console.error('Signing rotation validation failed:');
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }

  console.log('Signing rotation validation passed.');
};

void run();
