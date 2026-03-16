import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

type EvalRegressionPolicy = {
  schemaVersion: string;
  maxHallucinationFailureRate: number;
  maxHallucinationIncreaseDelta: number;
  minPassRate: number;
  maxPassRateDropDelta: number;
  requireSigningEnforcementPass: boolean;
  requireAdapterE2EParityPass?: boolean;
  requireAdapterRuntimeParityPass?: boolean;
  requireAdapterFrameworkParityPass?: boolean;
  requireAdapterFrameworkBootParityPass?: boolean;
  requireAdapterFrameworkCliBootParityPass?: boolean;
};

type TrendHistory = {
  schemaVersion: string;
  snapshots: Array<{
    id: string;
    createdAt: string;
    releaseId: string;
    hallucinationFailureRate: number;
    redteamPassRate: number;
      personaDriftStableRate: number;
      jailbreakPassRate: number;
      signingEnforcementPass: boolean;
      adapterE2EParityPass?: boolean;
      adapterRuntimeParityPass?: boolean;
      adapterFrameworkParityPass?: boolean;
      adapterFrameworkBootParityPass?: boolean;
      adapterFrameworkCliBootParityPass?: boolean;
    }>;
};

const root = process.cwd();

const num = (v: unknown): number => (typeof v === 'number' ? v : Number(v || 0));
const bool = (v: unknown): boolean => Boolean(v);

const run = async () => {
  const policy = JSON.parse(
    await readFile(join(root, 'ci/policies/eval-regression.policy.json'), 'utf8')
  ) as EvalRegressionPolicy;
  const historyPath = join(root, 'ci/baselines/eval-trends.history.json');
  const history = JSON.parse(await readFile(historyPath, 'utf8')) as TrendHistory;

  if (!history.snapshots || history.snapshots.length === 0) {
    throw new Error('eval_trend_history_empty');
  }

  const hallucination = JSON.parse(await readFile(join(root, 'ci/baselines/evals/hallucination.report.json'), 'utf8')) as {
    failureRate: number;
  };
  const redteam = JSON.parse(await readFile(join(root, 'ci/baselines/evals/redteam.report.json'), 'utf8')) as {
    passRate: number;
  };
  const personaDrift = JSON.parse(await readFile(join(root, 'ci/baselines/evals/persona-drift.report.json'), 'utf8')) as {
    stableRate: number;
  };
  const jailbreak = JSON.parse(await readFile(join(root, 'ci/baselines/evals/jailbreak-resistance.report.json'), 'utf8')) as {
    passRate: number;
  };
  const signing = JSON.parse(await readFile(join(root, 'ci/baselines/evals/signing-enforcement.report.json'), 'utf8')) as {
    passed: boolean;
  };
  const adapterE2E = JSON.parse(await readFile(join(root, 'ci/baselines/evals/adapter-e2e-parity.report.json'), 'utf8')) as {
    passed: boolean;
  };
  const adapterRuntime = JSON.parse(
    await readFile(join(root, 'ci/baselines/evals/adapter-runtime-parity.report.json'), 'utf8')
  ) as {
    passed: boolean;
  };
  const adapterFramework = JSON.parse(
    await readFile(join(root, 'ci/baselines/evals/adapter-framework-parity.report.json'), 'utf8')
  ) as {
    passed: boolean;
  };
  const adapterFrameworkBoot = JSON.parse(
    await readFile(join(root, 'ci/baselines/evals/adapter-framework-boot.report.json'), 'utf8')
  ) as {
    passed: boolean;
  };
  const adapterFrameworkCliBoot = JSON.parse(
    await readFile(join(root, 'ci/baselines/evals/adapter-framework-cli-boot.report.json'), 'utf8')
  ) as {
    passed: boolean;
  };

  const current = {
    id: `run-${Date.now()}`,
    createdAt: new Date().toISOString(),
    releaseId: process.env.RELEASE_ID || process.env.GITHUB_RUN_ID || 'local',
    hallucinationFailureRate: num(hallucination.failureRate),
    redteamPassRate: num(redteam.passRate),
    personaDriftStableRate: num(personaDrift.stableRate),
    jailbreakPassRate: num(jailbreak.passRate),
    signingEnforcementPass: bool(signing.passed),
    adapterE2EParityPass: bool(adapterE2E.passed),
    adapterRuntimeParityPass: bool(adapterRuntime.passed),
    adapterFrameworkParityPass: bool(adapterFramework.passed),
    adapterFrameworkBootParityPass: bool(adapterFrameworkBoot.passed),
    adapterFrameworkCliBootParityPass: bool(adapterFrameworkCliBoot.passed)
  };

  const latest = history.snapshots[history.snapshots.length - 1];
  const failures: string[] = [];

  if (current.hallucinationFailureRate > policy.maxHallucinationFailureRate) {
    failures.push('hallucination_failure_rate_above_absolute_threshold');
  }
  if (current.hallucinationFailureRate - latest.hallucinationFailureRate > policy.maxHallucinationIncreaseDelta) {
    failures.push('hallucination_failure_rate_regressed');
  }

  const passRates = [
    ['redteam', current.redteamPassRate, latest.redteamPassRate],
    ['persona_drift', current.personaDriftStableRate, latest.personaDriftStableRate],
    ['jailbreak', current.jailbreakPassRate, latest.jailbreakPassRate]
  ] as const;

  for (const [name, now, prev] of passRates) {
    if (now < policy.minPassRate) failures.push(`${name}_below_min_pass_rate`);
    if (prev - now > policy.maxPassRateDropDelta) failures.push(`${name}_regressed_vs_baseline`);
  }

  if (policy.requireSigningEnforcementPass && !current.signingEnforcementPass) {
    failures.push('signing_enforcement_not_passed');
  }
  if (policy.requireAdapterE2EParityPass && !current.adapterE2EParityPass) {
    failures.push('adapter_e2e_parity_not_passed');
  }
  if (policy.requireAdapterRuntimeParityPass && !current.adapterRuntimeParityPass) {
    failures.push('adapter_runtime_parity_not_passed');
  }
  if (policy.requireAdapterFrameworkParityPass && !current.adapterFrameworkParityPass) {
    failures.push('adapter_framework_parity_not_passed');
  }
  if (policy.requireAdapterFrameworkBootParityPass && !current.adapterFrameworkBootParityPass) {
    failures.push('adapter_framework_boot_parity_not_passed');
  }
  if (policy.requireAdapterFrameworkCliBootParityPass && !current.adapterFrameworkCliBootParityPass) {
    failures.push('adapter_framework_cli_boot_parity_not_passed');
  }

  const report = {
    gate: 'eval-trend-regression',
    schemaVersion: '1.0.0',
    createdAt: new Date().toISOString(),
    baselineSnapshotId: latest.id,
    baselineCreatedAt: latest.createdAt,
    policy,
    current,
    passed: failures.length === 0,
    failures
  };

  const outPath = join(root, 'ci/baselines/evals/eval-trend-regression.report.json');
  await writeFile(outPath, JSON.stringify(report, null, 2), 'utf8');

  if (process.env.UPDATE_EVAL_TREND_HISTORY === 'true' && failures.length === 0) {
    history.snapshots.push(current);
    await writeFile(historyPath, JSON.stringify(history, null, 2), 'utf8');
  }

  if (failures.length > 0) {
    console.error(`Eval trend regression gate failed: ${failures.join(',')}`);
    process.exit(1);
  }

  console.log('Eval trend regression gate passed.');
};

void run().catch((error) => {
  console.error(String(error));
  process.exit(1);
});
