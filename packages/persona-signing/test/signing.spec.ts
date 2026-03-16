import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { generateSigningKeys } from '../src/keygen.js';
import { signPersonaPack, signPersonaPackWithKms } from '../src/sign.js';
import { getSigningPostureStatus } from '../src/status.js';
import { verifyPersonaPackSignature } from '../src/verify.js';

const tempDirs: string[] = [];

const makePack = () => ({
  id: 'signed-pack',
  version: '1.0.0',
  schemaVersion: '1.0.0' as const,
  persona: {
    id: 'signed-pack',
    name: 'Signed Pack',
    description: 'Signed pack',
    extends: [],
    systemPrompt: 'system',
    userPromptTemplate: 'user',
    traits: [],
    allowedTools: ['persona:registry'],
    deniedTools: [],
    style: { tone: 'neutral', constraints: [], examples: [] },
    riskClass: 'low' as const,
    metadata: {}
  },
  provenance: {
    source: 'test',
    createdAt: Date.now()
  }
});

const withTempDir = async <T>(run: (dir: string) => Promise<T>): Promise<T> => {
  const dir = await mkdtemp(join(tmpdir(), 'persona-signing-'));
  tempDirs.push(dir);
  return run(dir);
};

describe('persona-signing', () => {
  afterEach(async () => {
    delete process.env.COGNITIVE_AI_KMS_AWS_KEYS_PATH;
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) {
        await rm(dir, { recursive: true, force: true });
      }
    }
  });

  it('supports strict-mode signature verification flow', () => {
    const keys = generateSigningKeys();
    const pack = makePack();

    const signed = signPersonaPack(pack as any, keys.privateKey, keys.publicKey);
    const verified = verifyPersonaPackSignature(signed.pack as any, signed.signature, keys.publicKey);
    expect(verified).toBe(true);
  });

  it('supports provider-backed signing with file-based key material', async () => {
    const keys = generateSigningKeys();
    const pack = makePack();

    await withTempDir(async (dir) => {
      const keyMapPath = join(dir, 'aws-keys.json');
      await writeFile(
        keyMapPath,
        JSON.stringify({
          'marketplace-key-1': {
            privateKey: keys.privateKey,
            publicKey: keys.publicKey
          }
        }),
        'utf8'
      );

      const signed = await signPersonaPackWithKms(pack as any, 'aws', 'marketplace-key-1', { keyMapPath });
      const verified = verifyPersonaPackSignature(signed.pack as any, signed.signature, signed.publicKey);

      expect(signed.provider).toBe('aws');
      expect(signed.keyId).toBe('marketplace-key-1');
      expect(signed.source).toContain('file_json');
      expect(verified).toBe(true);
    });
  });

  it('reports ready signing posture when providers cover rotation policy and file-backed keys are configured', async () => {
    const keys = generateSigningKeys();

    await withTempDir(async (dir) => {
      const keyMapPath = join(dir, 'aws-keys.json');
      const publicKeyPath = join(dir, 'signing-public.pem');
      const kmsProvidersPolicyPath = join(dir, 'kms.providers.json');
      const signingRotationPolicyPath = join(dir, 'signing-rotation.policy.json');

      await writeFile(
        keyMapPath,
        JSON.stringify({
          'marketplace-key-1': {
            privateKey: keys.privateKey,
            publicKey: keys.publicKey
          }
        }),
        'utf8'
      );
      await writeFile(publicKeyPath, keys.publicKey, 'utf8');
      await writeFile(
        kmsProvidersPolicyPath,
        JSON.stringify({
          providers: {
            aws: { enabled: true, keyId: 'marketplace-key-1', allowMockInCi: false },
            gcp: { enabled: false, keyId: 'marketplace-key-1' },
            azure: { enabled: false, keyId: 'marketplace-key-1' }
          }
        }),
        'utf8'
      );
      await writeFile(
        signingRotationPolicyPath,
        JSON.stringify({
          rotationIntervalDays: 90,
          channels: {
            openai: {
              currentKeyId: 'marketplace-key-1',
              previousKeyId: 'marketplace-key-0',
              rotatedAt: '2026-02-15T00:00:00.000Z'
            }
          }
        }),
        'utf8'
      );

      process.env.COGNITIVE_AI_KMS_AWS_KEYS_PATH = keyMapPath;
      const status = await getSigningPostureStatus({
        productionMode: true,
        strictSigning: true,
        signaturePolicyMode: 'enforced',
        signingPublicKeyPath: publicKeyPath,
        kmsProvidersPolicyPath,
        signingRotationPolicyPath,
        now: new Date('2026-03-11T00:00:00.000Z')
      });

      expect(status.ready).toBe(true);
      expect(status.publicKeyConfigured).toBe(true);
      expect(status.providers[0]?.mock).toBe(false);
      expect(status.channels[0]?.providerCoverage).toEqual(['aws']);
    });
  });
});
