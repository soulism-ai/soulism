import { createHash, createPublicKey } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createSigningKeyPair, signPayload } from '../../packages/shared/src/crypto.js';
import { resolveMockKmsKey } from '../../packages/persona-signing/src/kms.js';

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

const resolveKeyMaterial = (): {
  privateKey: string;
  publicKey: string;
  ephemeral: boolean;
  signingMode: 'local' | 'kms';
  keyId: string;
  source: string;
} => {
  const signingMode = ((getArg('signing-mode') || process.env.MARKETPLACE_SIGNING_MODE || 'local').toLowerCase() === 'kms'
    ? 'kms'
    : 'local') as 'local' | 'kms';
  const keyId = getArg('key-id') || process.env.MARKETPLACE_SIGNING_KEY_ID || 'marketplace-key-1';

  if (signingMode === 'kms') {
    const kms = resolveMockKmsKey(keyId, process.env.MARKETPLACE_KMS_KEYS_JSON);
    return {
      privateKey: kms.privateKey,
      publicKey: kms.publicKey,
      ephemeral: kms.source !== 'env_json',
      signingMode,
      keyId: kms.keyId,
      source: kms.source
    };
  }

  const privateFromArg = getArg('private-key');
  const privateFromEnv = process.env.MARKETPLACE_SIGNING_PRIVATE_KEY;
  const publicFromArg = getArg('public-key');
  const publicFromEnv = process.env.MARKETPLACE_SIGNING_PUBLIC_KEY;

  const privateKey = privateFromArg || privateFromEnv;
  if (privateKey) {
    const publicKey =
      publicFromArg ||
      publicFromEnv ||
      createPublicKey(privateKey).export({
        type: 'spki',
        format: 'pem'
      }).toString();
    return { privateKey, publicKey, ephemeral: false, signingMode, keyId, source: 'provided' };
  }

  const generated = createSigningKeyPair();
  return {
    privateKey: generated.privateKey,
    publicKey: generated.publicKey,
    ephemeral: true,
    signingMode,
    keyId,
    source: 'generated_local'
  };
};

const digestOf = (content: string): string => `sha256:${createHash('sha256').update(content).digest('hex')}`;

const run = async () => {
  const publisher = getArg('publisher') || process.env.MARKETPLACE_PUBLISHER || 'soulism-labs';
  const minCliVersion = getArg('min-cli-version') || process.env.MARKETPLACE_MIN_CLI_VERSION || '0.1.0';
  const createdAt = process.env.MARKETPLACE_SIGNATURE_CREATED_AT || new Date().toISOString();
  const keyMaterial = resolveKeyMaterial();

  for (const channel of channels) {
    const descriptorPath = join(root, channel.descriptor);
    const descriptorRaw = await readFile(descriptorPath, 'utf8');
    const digest = digestOf(descriptorRaw);
    const signature = signPayload(digest, keyMaterial.privateKey);

    const metadata = {
      channel: channel.channel,
      descriptor: channel.descriptor,
      signingMode: keyMaterial.signingMode,
      keyId: keyMaterial.keyId,
      publisher,
      digest,
      signature,
      publicKey: keyMaterial.publicKey,
      createdAt,
      compatibility: {
        minCliVersion,
        runtimes: channel.runtimes
      }
    };

    await writeFile(join(root, channel.signaturePath), JSON.stringify(metadata, null, 2), 'utf8');
  }

  await writeFile(
    join(root, 'ci', 'baselines', 'distribution-signing-meta.json'),
    JSON.stringify(
      {
        schemaVersion: '1.0.0',
        createdAt,
        publisher,
        minCliVersion,
        ephemeralKeyUsed: keyMaterial.ephemeral,
        signingMode: keyMaterial.signingMode,
        keyId: keyMaterial.keyId,
        keySource: keyMaterial.source,
        channels: channels.map((c) => c.channel)
      },
      null,
      2
    ),
    'utf8'
  );

  console.log(`Marketplace descriptors signed (${channels.length} channels).`);
};

void run().catch((error) => {
  console.error(String(error));
  process.exit(1);
});
