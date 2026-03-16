import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.cwd();

const run = async () => {
  const requireReal = (process.env.REQUIRE_REAL_KMS || 'false').toLowerCase() === 'true';
  const failures: string[] = [];

  const signingMetaPath = join(root, 'ci/baselines/distribution-signing-meta.json');
  const kmsEvidencePath = join(root, 'ci/baselines/kms-provider-signing-evidence.json');

  const signingMeta = JSON.parse(await readFile(signingMetaPath, 'utf8').catch(() => '{}')) as {
    provider?: string;
    keyId?: string;
    channels?: Array<{ source?: string }>;
  };
  const kmsEvidence = JSON.parse(await readFile(kmsEvidencePath, 'utf8').catch(() => '{}')) as {
    results?: Array<{ provider?: string; source?: string; verified?: boolean }>;
    passed?: boolean;
  };

  if (!signingMeta.provider) failures.push('missing_signing_provider');
  if (!signingMeta.keyId) failures.push('missing_signing_key_id');
  if (!Array.isArray(signingMeta.channels) || signingMeta.channels.length === 0) failures.push('missing_signing_channels');
  if (!Array.isArray(kmsEvidence.results) || kmsEvidence.results.length === 0) failures.push('missing_kms_evidence_results');
  if (kmsEvidence.passed !== true) failures.push('kms_evidence_not_passed');

  if (requireReal) {
    const generatedFromSigning = (signingMeta.channels || []).some((c) => String(c.source || '').includes('generated'));
    const activeProvider = String(signingMeta.provider || '');
    const activeEvidence = (kmsEvidence.results || []).find((r) => String(r.provider || '') === activeProvider);
    const generatedFromEvidence = activeEvidence ? String(activeEvidence.source || '').includes('generated') : true;
    if (generatedFromSigning) failures.push('kms_signing_used_generated_key_source');
    if (!activeEvidence) failures.push('kms_evidence_missing_active_provider');
    if (generatedFromEvidence) failures.push('kms_evidence_used_generated_key_source');
  }

  const report = {
    schemaVersion: '1.0.0',
    createdAt: new Date().toISOString(),
    requireReal,
    passed: failures.length === 0,
    failures
  };
  await writeFile(join(root, 'ci/baselines/kms-live-readiness.report.json'), JSON.stringify(report, null, 2), 'utf8');

  if (failures.length > 0) {
    console.error(`KMS live readiness validation failed: ${failures.join(',')}`);
    process.exit(1);
  }

  console.log('KMS live readiness validation passed.');
};

void run().catch((error) => {
  console.error(String(error));
  process.exit(1);
});
