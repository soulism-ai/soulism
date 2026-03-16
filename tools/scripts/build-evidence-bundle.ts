import { createHash } from 'node:crypto';
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readEvidenceEnvelope, writeEvidenceEnvelope } from './lib/evidence.js';

const root = process.cwd();

const hashFile = async (path: string): Promise<{ size: number; digest: string }> => {
  const content = await readFile(path);
  const digest = createHash('sha256').update(content).digest('hex');
  const metadata = await stat(path);
  return {
    size: metadata.size,
    digest: `sha256:${digest}`
  };
};

const readIfExists = async (path: string): Promise<{ path: string; size: number; digest: string } | null> => {
  try {
    const meta = await hashFile(path);
    return { path, ...meta };
  } catch {
    return null;
  }
};

const run = async () => {
  const strict = (process.env.EVIDENCE_STRICT || 'true').toLowerCase() !== 'false';
  const evalDir = join(root, 'ci/baselines/evals');
  const evalEntries = await readdir(evalDir).catch(() => []);
  const evalReports: Array<{ path: string; size: number; digest: string }> = [];

  for (const entry of evalEntries) {
    if (!entry.endsWith('.json')) continue;
    const fullPath = join(evalDir, entry);
    const details = await readIfExists(fullPath);
    if (details) evalReports.push(details);
  }

  const requiredArtifacts = [
    join(root, 'ci/baselines/sbom.cdx.json'),
    join(root, 'ci/baselines/security.seeded.report.json'),
    join(root, 'ci/baselines/rollback-evidence.json'),
    join(root, 'ci/baselines/key-rotation-evidence.json'),
    join(root, 'ci/baselines/kms-provider-signing-evidence.json'),
    join(root, 'ci/baselines/audit-evidence.json'),
    join(root, 'ci/baselines/audit-export.json'),
    join(root, 'ci/baselines/alerts-dispatch-evidence.json'),
    join(root, 'ci/baselines/alert-provider-dispatch-evidence.json'),
    join(root, 'ci/baselines/distribution-release-bundle.json'),
    join(root, 'ci/policies/alerts.policy.json'),
    join(root, 'ci/policies/alert.providers.json'),
    join(root, 'ci/policies/telemetry.pipeline.json'),
    join(root, 'ci/policies/kms.providers.json'),
    join(root, 'ci/policies/signing-rotation.policy.json'),
    join(root, 'ci/policies/eval-regression.policy.json'),
    join(root, 'ci/policies/adapter-e2e-parity.policy.json'),
    join(root, 'ci/policies/adapter-runtime-parity.policy.json'),
    join(root, 'ci/policies/adapter-framework-parity.policy.json'),
    join(root, 'ci/policies/adapter-framework-boot.policy.json'),
    join(root, 'ci/policies/adapter-framework-cli-boot.policy.json'),
    join(root, 'ci/baselines/eval-trends.history.json'),
    join(root, 'ci/baselines/evals/eval-trend-regression.report.json'),
    join(root, 'ci/baselines/evals/adapter-e2e-parity.report.json'),
    join(root, 'ci/baselines/evals/adapter-runtime-parity.report.json'),
    join(root, 'ci/baselines/evals/adapter-framework-parity.report.json'),
    join(root, 'ci/baselines/evals/adapter-framework-boot.report.json'),
    join(root, 'ci/baselines/evals/adapter-framework-cli-boot.report.json'),
    join(root, 'ci/baselines/kms-live-readiness.report.json'),
    join(root, 'ci/baselines/adapter-nextjs.probe.json'),
    join(root, 'ci/baselines/adapter-expo.probe.json'),
    join(root, 'ci/baselines/adapter-parity.probe.json'),
    join(root, 'ci/baselines/adapter-hf.probe.json'),
    join(root, 'ci/baselines/distribution-signing-meta.json'),
    join(root, 'infra/k8s/otel-collector-config.yaml'),
    join(root, 'ci/adapters/adapter-matrix.json'),
    join(root, 'marketplace/openai/app.json'),
    join(root, 'marketplace/openai/signature.json'),
    join(root, 'marketplace/claude/marketplace.json'),
    join(root, 'marketplace/claude/signature.json'),
    join(root, 'marketplace/copilot-studio/manifest.yaml'),
    join(root, 'marketplace/copilot-studio/signature.json'),
    join(root, 'marketplace/hf/manifest.json'),
    join(root, 'marketplace/hf/signature.json')
  ];

  const optionalArtifacts = [
    join(root, 'ci/baselines/alert-provider-live-evidence.json'),
    join(root, 'ci/baselines/security/semgrep.clean.report.json'),
    join(root, 'ci/baselines/security/semgrep.clean.summary.json'),
    join(root, 'ci/baselines/security/semgrep.seed.report.json'),
    join(root, 'ci/baselines/security/semgrep.seed.summary.json'),
    join(root, 'ci/baselines/security/trivy.deps.clean.report.json'),
    join(root, 'ci/baselines/security/trivy.deps.clean.summary.json'),
    join(root, 'ci/baselines/security/trivy.deps.seed.report.json'),
    join(root, 'ci/baselines/security/trivy.deps.seed.summary.json'),
    join(root, 'ci/baselines/security/gitleaks.clean.report.json'),
    join(root, 'ci/baselines/security/gitleaks.clean.summary.json'),
    join(root, 'ci/baselines/security/gitleaks.seed.report.json'),
    join(root, 'ci/baselines/security/gitleaks.seed.summary.json'),
    join(root, 'ci/baselines/security/reports.validation.json'),
    join(root, 'testdata/snapshots/sdk-generation.json'),
    join(root, 'testdata/sdks/index.ts'),
    join(root, 'testdata/sdks')
  ];

  const artifactDetails: Array<{ path: string; size: number; digest: string }> = [];
  const missingRequired: string[] = [];
  for (const artifact of requiredArtifacts) {
    const details = await readIfExists(artifact);
    if (!details) {
      missingRequired.push(artifact);
      continue;
    }
    artifactDetails.push(details);
  }

  const optionalDetails = (await Promise.all(optionalArtifacts.map((artifact) => readIfExists(artifact)))).filter(
    (value): value is { path: string; size: number; digest: string } => value !== null
  );
  artifactDetails.push(...optionalDetails);

  if (strict && missingRequired.length > 0) {
    throw new Error(`missing_required_evidence:${missingRequired.join(',')}`);
  }

  const payload = {
    schemaVersion: '1.0.0',
    generatedAt: new Date().toISOString(),
    strict,
    source: {
      repository: 'soulism-platform',
      commit: process.env.GITHUB_SHA || 'local',
      ref: process.env.GITHUB_REF_NAME || process.env.GITHUB_REF || 'local',
      runId: process.env.GITHUB_RUN_ID || 'local',
      releaseId: process.env.RELEASE_ID || process.env.GITHUB_RUN_ID || 'local'
    },
    missingRequired,
    evalReports,
    artifacts: artifactDetails
  };

  const previousPath = join(root, 'ci', 'baselines', 'evidence-bundle.json');
  let previousDigest: string | undefined;
  try {
    const previousRaw = await readFile(previousPath, 'utf8');
    previousDigest = readEvidenceEnvelope(JSON.parse(previousRaw)).digest;
  } catch {
    previousDigest = undefined;
  }

  const bundle = writeEvidenceEnvelope(payload, 'evidence-bundle', previousDigest);

  const outPath = join(root, 'ci/baselines/evidence-bundle.json');
  await writeFile(outPath, JSON.stringify(bundle, null, 2), 'utf8');
  console.log(`Evidence bundle generated: ${outPath}`);
};

void run().catch((error) => {
  console.error(String(error));
  process.exit(1);
});
