import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { evaluatePolicy } from '../../packages/persona-policy/src/policy.js';
import { makeBudget } from '../../packages/persona-policy/src/budgets.js';
import type { RiskClass, ToolScope } from '../../packages/persona-policy/src/scopes.js';
import type { PolicyState } from '../../packages/persona-policy/src/decision.js';

type RedTeamDataset = {
  schemaVersion: string;
  minimumPassRate: number;
  policyVersion: string;
  rules: Array<{
    id: string;
    scope: ToolScope;
    riskClassMax: RiskClass;
    requireSignature: boolean;
    requiresConfirmation?: boolean;
    isEnabled?: boolean;
  }>;
  cases: Array<{
    name: string;
    request: {
      personaId: string;
      userId: string;
      tenantId: string;
      tool: ToolScope;
      action: string;
      riskClass: RiskClass;
      traceId: string;
    };
    expected: PolicyState;
  }>;
};

const run = async () => {
  const datasetPath = join(process.cwd(), 'ci', 'evals', 'datasets', 'redteam.cases.json');
  const dataset = JSON.parse(await readFile(datasetPath, 'utf8')) as RedTeamDataset;
  const datasetDigest = `sha256:${createHash('sha256').update(JSON.stringify(dataset)).digest('hex')}`;

  const policyContext = {
    policyVersion: dataset.policyVersion,
    rules: dataset.rules,
    budget: () => {
      const b = makeBudget(100, 'low');
      return { remaining: b.remaining, max: b.max, windowStartedAt: b.windowStartedAt, windowEnd: b.windowStartedAt + b.windowMs };
    }
  };

  const failures: Array<{ name: string; expected: string; actual: string }> = [];
  for (const c of dataset.cases) {
    const decision = evaluatePolicy(c.request, policyContext as any);
    if (decision.state !== c.expected) {
      failures.push({ name: c.name, expected: c.expected, actual: decision.state });
    }
  }

  const total = dataset.cases.length;
  const passedCount = total - failures.length;
  const passRate = total === 0 ? 0 : passedCount / total;
  const minimumPassRate = dataset.minimumPassRate;
  const passed = passRate >= minimumPassRate;

  const report = {
    gate: 'redteam',
    schemaVersion: dataset.schemaVersion,
    datasetPath,
    datasetDigest,
    total,
    passedCount,
    failedCount: failures.length,
    passRate,
    minimumPassRate,
    failures,
    passed,
    createdAt: new Date().toISOString()
  };

  await writeFile(join(process.cwd(), 'ci', 'baselines', 'evals', 'redteam.report.json'), JSON.stringify(report, null, 2), 'utf8');

  if (!passed) {
    console.error(`Red-team gate failed: passRate=${passRate}, required=${minimumPassRate}`);
    process.exit(1);
  }

  console.log(`Red-team gate passed: ${passedCount}/${total}`);
};

void run();
