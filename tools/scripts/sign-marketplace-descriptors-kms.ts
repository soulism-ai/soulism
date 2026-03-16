import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createKmsProviderAdapter } from '../../packages/persona-signing/src/providers/factory.js';
import type { KmsProviderName } from '../../packages/persona-signing/src/providers/types.js';

type ChannelConfig = {
  channel: 'openai' | 'claude' | 'copilot-studio' | 'hf-space';
  descriptor: string;
  signaturePath: string;
  runtimes: string[];
};

const root = process.cwd();

const channels: ChannelConfig[] = [
  {
    channel: 'openai',
    descriptor: 'marketplace/openai/app.json',
    signaturePath: 'marketplace/openai/signature.json',
    runtimes: ['chatgpt-apps', 'openai-app-runtime-http']
  },
  {
    channel: 'claude',
    descriptor: 'marketplace/claude/marketplace.json',
    signaturePath: 'marketplace/claude/signature.json',
    runtimes: ['claude-desktop-mcp', 'claude-marketplace-http']
  },
  {
    channel: 'copilot-studio',
    descriptor: 'marketplace/copilot-studio/manifest.yaml',
    signaturePath: 'marketplace/copilot-studio/signature.json',
    runtimes: ['copilot-studio-http', 'copilot-m365-plugin']
  },
  {
    channel: 'hf-space',
    descriptor: 'marketplace/hf/manifest.json',
    signaturePath: 'marketplace/hf/signature.json',
    runtimes: ['hf-space-http']
  }
];

const getArg = (name: string): string | undefined => {
  const match = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  return match ? match.split('=').slice(1).join('=') : undefined;
};

const digestOf = (value: string): string => `sha256:${createHash('sha256').update(value).digest('hex')}`;

const run = async () => {
  const provider = (getArg('provider') || process.env.MARKETPLACE_KMS_PROVIDER || 'aws') as KmsProviderName;
  const keyId = getArg('key-id') || process.env.MARKETPLACE_SIGNING_KEY_ID || 'marketplace-key-1';
  const publisher = getArg('publisher') || process.env.MARKETPLACE_PUBLISHER || 'soulism-labs';
  const minCliVersion = getArg('min-cli-version') || process.env.MARKETPLACE_MIN_CLI_VERSION || '0.1.0';
  const createdAt = process.env.MARKETPLACE_SIGNATURE_CREATED_AT || new Date().toISOString();
  const adapter = createKmsProviderAdapter(provider);

  const writes: Array<{ channel: string; keyId: string; source: string; digest: string }> = [];

  for (const channel of channels) {
    const descriptorRaw = await readFile(join(root, channel.descriptor), 'utf8');
    const digest = digestOf(descriptorRaw);
    const signed = await adapter.sign({
      keyId,
      digest
    });

    const metadata = {
      channel: channel.channel,
      descriptor: channel.descriptor,
      signingMode: 'kms' as const,
      keyId,
      keySource: signed.source,
      publisher,
      digest,
      signature: signed.signature,
      publicKey: signed.publicKey,
      createdAt,
      compatibility: {
        minCliVersion,
        runtimes: channel.runtimes
      }
    };

    await writeFile(join(root, channel.signaturePath), JSON.stringify(metadata, null, 2), 'utf8');
    writes.push({
      channel: channel.channel,
      keyId,
      source: signed.source,
      digest
    });
  }

  const report = {
    schemaVersion: '1.0.0',
    createdAt,
    publisher,
    provider,
    keyId,
    minCliVersion,
    channels: writes,
    releaseId: process.env.RELEASE_ID || process.env.GITHUB_RUN_ID || 'local'
  };
  await writeFile(join(root, 'ci/baselines/distribution-signing-meta.json'), JSON.stringify(report, null, 2), 'utf8');
  console.log(`KMS marketplace descriptor signing complete (${provider}, ${writes.length} channels).`);
};

void run().catch((error) => {
  console.error(String(error));
  process.exit(1);
});
