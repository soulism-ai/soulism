import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.cwd();

const run = async () => {
  const rollbackReportPath = join(root, 'ci', 'baselines', 'evals', 'rollback-drill.report.json');
  const rollbackReport = JSON.parse(await readFile(rollbackReportPath, 'utf8')) as {
    passed?: boolean;
    seededRegressionDetected?: boolean;
    rollbackSucceeded?: boolean;
  };

  if (!rollbackReport?.passed) {
    throw new Error('rollback_drill_not_passed');
  }

  const releaseId = process.env.RELEASE_ID || `local-${Date.now()}`;
  const commit = process.env.GITHUB_SHA || 'local';
  const ref = process.env.GITHUB_REF_NAME || process.env.GITHUB_REF || 'local';
  const runId = process.env.GITHUB_RUN_ID || 'local';

  const payload = {
    schemaVersion: '1.0.0',
    generatedAt: new Date().toISOString(),
    release: {
      id: releaseId,
      commit,
      ref,
      runId
    },
    rollback: {
      drillReportPath: 'ci/baselines/evals/rollback-drill.report.json',
      seededRegressionDetected: Boolean(rollbackReport.seededRegressionDetected),
      rollbackSucceeded: Boolean(rollbackReport.rollbackSucceeded),
      rollbackCommand: 'kubectl rollout undo deployment/api-gateway -n soulism-edge',
      configRollbackCommand: 'kubectl apply -f k8s/configs/last-known-good.yaml'
    }
  };

  const digest = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  const output = {
    ...payload,
    digest: `sha256:${digest}`
  };

  const outPath = join(root, 'ci', 'baselines', 'rollback-evidence.json');
  await writeFile(outPath, JSON.stringify(output, null, 2), 'utf8');
  console.log(`Rollback evidence generated: ${outPath}`);
};

void run().catch((error) => {
  console.error(String(error));
  process.exit(1);
});

