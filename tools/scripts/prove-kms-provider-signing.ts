import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { verifyPayload } from '../../packages/shared/src/crypto.js';
import { createKmsProviderAdapter } from '../../packages/persona-signing/src/providers/factory.js';

type ProviderConfig = {
  enabled: boolean;
  keyId: string;
  allowMockInCi: boolean;
};

type KmsPolicy = {
  schemaVersion: string;
  providers: Record<'aws' | 'gcp' | 'azure', ProviderConfig>;
};

const root = process.cwd();

const run = async () => {
  const policy = JSON.parse(await readFile(join(root, 'ci/policies/kms.providers.json'), 'utf8')) as KmsPolicy;
  const releaseId = process.env.RELEASE_ID || process.env.GITHUB_RUN_ID || 'local';
  const challenge = `kms-provider-signing-proof:${releaseId}:${new Date().toISOString()}`;
  const digest = `sha256:${createHash('sha256').update(challenge).digest('hex')}`;

  const results: Array<{
    provider: string;
    keyId: string;
    source: string;
    verified: boolean;
    allowMockInCi: boolean;
  }> = [];

  for (const [providerName, config] of Object.entries(policy.providers)) {
    if (!config.enabled) continue;
    const envMap =
      providerName === 'aws'
        ? process.env.COGNITIVE_AI_KMS_AWS_KEYS_JSON
        : providerName === 'gcp'
          ? process.env.COGNITIVE_AI_KMS_GCP_KEYS_JSON
          : process.env.COGNITIVE_AI_KMS_AZURE_KEYS_JSON;

    const adapter = createKmsProviderAdapter(providerName as 'aws' | 'gcp' | 'azure', { keyMapJson: envMap });
    const signed = await adapter.sign({
      keyId: config.keyId,
      digest
    });
    const verified = verifyPayload(digest, signed.signature, signed.publicKey);

    results.push({
      provider: providerName,
      keyId: config.keyId,
      source: signed.source,
      verified,
      allowMockInCi: config.allowMockInCi
    });
  }

  const passed = results.length > 0 && results.every((x) => x.verified);
  const payload = {
    schemaVersion: '1.0.0',
    createdAt: new Date().toISOString(),
    releaseId,
    challengeDigest: digest,
    results,
    passed
  };
  const payloadDigest = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  const evidence = {
    ...payload,
    digest: `sha256:${payloadDigest}`
  };

  const outPath = join(root, 'ci/baselines/kms-provider-signing-evidence.json');
  await writeFile(outPath, JSON.stringify(evidence, null, 2), 'utf8');

  if (!passed) {
    console.error('KMS provider signing evidence failed verification.');
    process.exit(1);
  }

  console.log(`KMS provider signing evidence generated: ${outPath}`);
};

void run().catch((error) => {
  console.error(String(error));
  process.exit(1);
});
