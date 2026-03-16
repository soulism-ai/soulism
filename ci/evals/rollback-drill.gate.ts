import { createServer } from 'node:http';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { evaluatePolicy, PolicyEngineContext } from '../../packages/persona-policy/src/policy.js';
import { PolicyRequest } from '../../packages/persona-policy/src/decision.js';
import { makeBudget } from '../../packages/persona-policy/src/budgets.js';
import { ToolScope } from '../../packages/persona-policy/src/scopes.js';
import { route as policyRoute } from '../../services/trust-safety/policy-gate-service/src/routes.ts';

const postJson = async (url: string, payload: unknown) => {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const body = await response.json().catch(() => ({}));
  return { response, body };
};

const startPolicyServer = async () => {
  const server = createServer((req, res) => {
    void policyRoute(req, res).catch((error) => {
      res.statusCode = 500;
      res.end(String(error));
    });
  });

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('policy_server_bind_failed');
  }

  return {
    url: `http://127.0.0.1:${address.port}`,
    close: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  };
};

const baselineRules: PolicyEngineContext = {
  policyVersion: 'v1',
  rules: [
    {
      id: 'baseline',
      scope: ToolScope.PersonaRegistry,
      riskClassMax: 'high',
      requireSignature: false,
      requiresConfirmation: false,
      isEnabled: true
    }
  ],
  budget: (request: PolicyRequest) => {
    const budget = makeBudget(100, request.riskClass);
    return {
      remaining: budget.remaining,
      max: budget.max,
      windowStart: budget.windowStartedAt,
      windowEnd: budget.windowStartedAt + budget.windowMs
    };
  }
};

const emptyRules: PolicyEngineContext = {
  policyVersion: 'v1',
  rules: [],
  budget: baselineRules.budget
};

const request: PolicyRequest = {
  personaId: 'rollback-persona',
  userId: 'rollback-user',
  tenantId: 'rollback-tenant',
  tool: ToolScope.PersonaRegistry,
  action: 'read',
  riskClass: 'low',
  traceId: 'rollback-flow'
};

const run = async () => {
  const policy = await startPolicyServer();
  try {
    const baselineLive = await postJson(`${policy.url}/policy/check`, request);
    if (baselineLive.response.status !== 200) {
      throw new Error('rollback_drill_baseline_service_unavailable');
    }

    const broken = evaluatePolicy(request, emptyRules);
    const restored = evaluatePolicy(request, baselineRules);

    const seededRegressionDetected = baselineLive.body.state === 'allow' && broken.state === 'deny';
    const rollbackSucceeded = baselineLive.body.state === restored.state;

    const report = {
      gate: 'rollback-drill',
      passed: seededRegressionDetected && rollbackSucceeded,
      seededRegressionDetected,
      rollbackSucceeded,
      baseline: {
        fromService: baselineLive.body,
        fromRules: restored
      },
      introducedRegression: broken,
      createdAt: new Date().toISOString()
    };

    await writeFile(join(process.cwd(), 'ci', 'baselines', 'evals', 'rollback-drill.report.json'), JSON.stringify(report, null, 2), 'utf8');

    if (!seededRegressionDetected) {
      throw new Error('rollback_drill_no_regression_detected');
    }
    if (!rollbackSucceeded) {
      throw new Error('rollback_drill_rollback_failed');
    }

    console.log('Rollback drill gate passed.');
  } finally {
    await policy.close();
  }
};

void run().catch((error) => {
  console.error(String(error));
  process.exit(1);
});
