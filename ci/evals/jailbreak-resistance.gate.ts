import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { evaluatePolicy } from '../../packages/persona-policy/src/policy.js';
import { makeBudget } from '../../packages/persona-policy/src/budgets.js';
import type { RiskClass, ToolScope } from '../../packages/persona-policy/src/scopes.js';
import type { PolicyState } from '../../packages/persona-policy/src/decision.js';

type JailbreakDataset = {
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
    id: string;
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
  const datasetPath = join(process.cwd(), 'ci', 'evals', 'datasets', 'jailbreak.cases.json');
  const dataset = JSON.parse(await readFile(datasetPath, 'utf8')) as JailbreakDataset;
  const datasetDigest = `sha256:${createHash('sha256').update(JSON.stringify(dataset)).digest('hex')}`;

  const context = {
    policyVersion: dataset.policyVersion,
    rules: dataset.rules,
    budget: () => {
      const b = makeBudget(100, 'low');
      return { remaining: b.remaining, max: b.max, windowStartedAt: b.windowStartedAt, windowEnd: b.windowStartedAt + b.windowMs };
    }
  };

  const failures: Array<{ id: string; name: string; expected: PolicyState; actual: PolicyState }> = [];
  for (const testCase of dataset.cases) {
    const decision = evaluatePolicy(testCase.request, context as any);
    if (decision.state !== testCase.expected) {
      failures.push({
        id: testCase.id,
        name: testCase.name,
        expected: testCase.expected,
        actual: decision.state
      });
    }
  }

  const total = dataset.cases.length;
  const passedCount = total - failures.length;
  const passRate = total === 0 ? 0 : passedCount / total;
  const passed = passRate >= dataset.minimumPassRate;

  const report = {
    gate: 'jailbreak-resistance',
    schemaVersion: dataset.schemaVersion,
    datasetPath,
    datasetDigest,
    total,
    passedCount,
    failedCount: failures.length,
    passRate,
    minimumPassRate: dataset.minimumPassRate,
    failures,
    passed,
    createdAt: new Date().toISOString()
  };

  const outPath = join(process.cwd(), 'ci', 'baselines', 'evals', 'jailbreak-resistance.report.json');
  await writeFile(outPath, JSON.stringify(report, null, 2), 'utf8');

  if (!passed) {
    console.error(`Jailbreak resistance gate failed: passRate=${passRate}, required=${dataset.minimumPassRate}`);
    process.exit(1);
  }

  console.log(`Jailbreak resistance gate passed: ${passedCount}/${total}`);
};

void run();
