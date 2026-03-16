import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getJson, loadRoute, postJson, startRouteServer } from '../smoke/helpers.js';

type AdapterE2EParityPolicy = {
  schemaVersion: string;
  requiredAdapters: string[];
  maxP95LatencyDeltaMs: number;
  maxErrorRateDelta: number;
  maxPolicyDecisionDelta: number;
  requirePolicyMatrixStates: Array<'allow' | 'confirm' | 'deny'>;
  requireAuditHashChainValid: boolean;
};

type AdapterSessionMetrics = {
  adapterId: string;
  p95LatencyMs: number;
  errorRate: number;
  totalChecks: number;
  policyStateCounts: Record<'allow' | 'confirm' | 'deny', number>;
  policyStateRates: Record<'allow' | 'confirm' | 'deny', number>;
  statuses: {
    policyAllow: number;
    policyConfirm: number;
    policyDeny: number;
    personaList: number;
    memoryWrite: number;
    memoryList: number;
  };
};

type SessionResult = {
  metrics: AdapterSessionMetrics;
  auditPayload: Record<string, unknown>;
};

const root = process.cwd();

const defaultAdapters = ['nextjs-adapter', 'expo-adapter', 'hf-space'];

const percentile95 = (values: number[]) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 0;
};

const ratio = (count: number, total: number) => (total === 0 ? 0 : count / total);

const measureJson = async (
  fn: () => Promise<{ response: Response; body: any }>
): Promise<{ durationMs: number; response: Response; body: any }> => {
  const start = performance.now();
  const result = await fn();
  return {
    durationMs: performance.now() - start,
    response: result.response,
    body: result.body
  };
};

const runAdapterSession = async (
  gatewayUrl: string,
  adapterId: string
): Promise<SessionResult> => {
  const baseHeaders = {
    'x-adapter-id': adapterId,
    'x-user-id': `${adapterId}-user`,
    'x-tenant-id': 'parity-tenant',
    'x-persona-id': 'parity-persona',
    'x-risk-class': 'low',
    'x-policy-confirmed': 'true'
  };

  const durations: number[] = [];
  let errors = 0;
  const policyStateCounts: Record<'allow' | 'confirm' | 'deny', number> = {
    allow: 0,
    confirm: 0,
    deny: 0
  };

  const policyAllow = await measureJson(() =>
    postJson(
      `${gatewayUrl}/policy/check`,
      {
        personaId: 'parity-persona',
        userId: `${adapterId}-user`,
        tenantId: 'parity-tenant',
        tool: 'persona:registry',
        action: 'read',
        riskClass: 'low',
        traceId: `${adapterId}-allow`
      },
      { headers: baseHeaders }
    )
  );
  durations.push(policyAllow.durationMs);
  if (!policyAllow.response.ok || policyAllow.body.state !== 'allow') errors += 1;
  if (policyAllow.body.state in policyStateCounts) {
    policyStateCounts[policyAllow.body.state as keyof typeof policyStateCounts] += 1;
  }

  const policyConfirm = await measureJson(() =>
    postJson(
      `${gatewayUrl}/policy/check`,
      {
        personaId: 'parity-persona',
        userId: `${adapterId}-user`,
        tenantId: 'parity-tenant',
        tool: 'memory:write',
        action: 'write',
        riskClass: 'low',
        traceId: `${adapterId}-confirm`
      },
      { headers: baseHeaders }
    )
  );
  durations.push(policyConfirm.durationMs);
  if (!policyConfirm.response.ok || policyConfirm.body.state !== 'confirm') errors += 1;
  if (policyConfirm.body.state in policyStateCounts) {
    policyStateCounts[policyConfirm.body.state as keyof typeof policyStateCounts] += 1;
  }

  const policyDeny = await measureJson(() =>
    postJson(
      `${gatewayUrl}/policy/check`,
      {
        personaId: 'parity-persona',
        userId: `${adapterId}-user`,
        tenantId: 'parity-tenant',
        tool: 'unknown:tool',
        action: 'write',
        riskClass: 'critical',
        traceId: `${adapterId}-deny`
      },
      { headers: baseHeaders }
    )
  );
  durations.push(policyDeny.durationMs);
  if (!policyDeny.response.ok || policyDeny.body.state !== 'deny') errors += 1;
  if (policyDeny.body.state in policyStateCounts) {
    policyStateCounts[policyDeny.body.state as keyof typeof policyStateCounts] += 1;
  }

  const personaList = await measureJson(() => getJson(`${gatewayUrl}/personas`, { headers: baseHeaders }));
  durations.push(personaList.durationMs);
  if (!personaList.response.ok) errors += 1;

  const memoryWrite = await measureJson(() =>
    postJson(
      `${gatewayUrl}/memory/write`,
      {
        scope: 'session',
        value: {
          adapterId,
          probe: 'adapter-e2e-parity'
        },
        ttlMs: 60_000
      },
      { headers: baseHeaders }
    )
  );
  durations.push(memoryWrite.durationMs);
  if (!memoryWrite.response.ok) errors += 1;

  const memoryList = await measureJson(() => getJson(`${gatewayUrl}/memory/list?scope=session`, { headers: baseHeaders }));
  durations.push(memoryList.durationMs);
  if (!memoryList.response.ok) errors += 1;

  const totalChecks = 6;
  const metrics: AdapterSessionMetrics = {
    adapterId,
    p95LatencyMs: percentile95(durations),
    errorRate: ratio(errors, totalChecks),
    totalChecks,
    policyStateCounts,
    policyStateRates: {
      allow: ratio(policyStateCounts.allow, totalChecks),
      confirm: ratio(policyStateCounts.confirm, totalChecks),
      deny: ratio(policyStateCounts.deny, totalChecks)
    },
    statuses: {
      policyAllow: policyAllow.response.status,
      policyConfirm: policyConfirm.response.status,
      policyDeny: policyDeny.response.status,
      personaList: personaList.response.status,
      memoryWrite: memoryWrite.response.status,
      memoryList: memoryList.response.status
    }
  };

  return {
    metrics,
    auditPayload: {
      adapterId,
      p95LatencyMs: metrics.p95LatencyMs,
      errorRate: metrics.errorRate,
      policyStateCounts: metrics.policyStateCounts,
      statuses: metrics.statuses
    }
  };
};

const run = async () => {
  const policy = JSON.parse(
    await readFile(join(root, 'ci/policies/adapter-e2e-parity.policy.json'), 'utf8')
  ) as AdapterE2EParityPolicy;

  const policyRoute = await loadRoute('../../services/trust-safety/policy-gate-service/src/routes.ts');
  const policyServer = await startRouteServer(policyRoute);

  const personaRoute = await loadRoute('../../services/mcp/persona-registry-service/src/routes.ts', {
    POLICY_SERVICE_URL: policyServer.url,
    SIGNATURE_POLICY_MODE: 'dev',
    PERSONA_PACKS_DIR: join(root, 'packs')
  });
  const personaServer = await startRouteServer(personaRoute);

  const memoryRoute = await loadRoute('../../services/mcp/memory-service/src/routes.ts', {
    POLICY_SERVICE_URL: policyServer.url
  });
  const memoryServer = await startRouteServer(memoryRoute);

  const auditRoute = await loadRoute('../../services/trust-safety/audit-ledger-service/src/routes.ts');
  const auditServer = await startRouteServer(auditRoute);

  const gatewayRoute = await loadRoute('../../services/edge/api-gateway/src/routes.ts', {
    REQUIRE_AUTH: 'false',
    POLICY_SERVICE_URL: policyServer.url,
    PERSONA_REGISTRY_URL: personaServer.url,
    MEMORY_SERVICE_URL: memoryServer.url,
    WEBFETCH_SERVICE_URL: memoryServer.url,
    FILES_SERVICE_URL: memoryServer.url
  });
  const gatewayServer = await startRouteServer(gatewayRoute);

  try {
    const required = policy.requiredAdapters || defaultAdapters;
    const sessions: AdapterSessionMetrics[] = [];

    for (const adapterId of required) {
      const { metrics, auditPayload } = await runAdapterSession(gatewayServer.url, adapterId);
      sessions.push(metrics);

      await postJson(`${auditServer.url}/audit/events`, {
        schemaVersion: '1.0.0',
        service: 'adapter-e2e-parity-gate',
        action: 'adapter_session',
        principal: adapterId,
        metadata: auditPayload
      });
    }

    const reference = sessions[0];
    if (!reference) throw new Error('adapter_e2e_parity_reference_session_missing');

    let p95LatencyDeltaMs = 0;
    let errorRateDelta = 0;
    let policyDecisionDelta = 0;

    for (const session of sessions.slice(1)) {
      p95LatencyDeltaMs = Math.max(p95LatencyDeltaMs, Math.abs(reference.p95LatencyMs - session.p95LatencyMs));
      errorRateDelta = Math.max(errorRateDelta, Math.abs(reference.errorRate - session.errorRate));
      policyDecisionDelta = Math.max(
        policyDecisionDelta,
        Math.abs(reference.policyStateRates.allow - session.policyStateRates.allow),
        Math.abs(reference.policyStateRates.confirm - session.policyStateRates.confirm),
        Math.abs(reference.policyStateRates.deny - session.policyStateRates.deny)
      );
    }

    const stateMatrixSatisfied = sessions.every((session) =>
      policy.requirePolicyMatrixStates.every((state) => (session.policyStateCounts[state] || 0) > 0)
    );

    const chain = await getJson(`${auditServer.url}/audit/hash-chain/verify`);
    const auditHashChainValid = Boolean(chain.body?.ok);

    const failures: string[] = [];
    if (p95LatencyDeltaMs > policy.maxP95LatencyDeltaMs) failures.push('p95_latency_delta_exceeded');
    if (errorRateDelta > policy.maxErrorRateDelta) failures.push('error_rate_delta_exceeded');
    if (policyDecisionDelta > policy.maxPolicyDecisionDelta) failures.push('policy_decision_delta_exceeded');
    if (!stateMatrixSatisfied) failures.push('policy_matrix_state_coverage_failed');
    if (policy.requireAuditHashChainValid && !auditHashChainValid) failures.push('audit_hash_chain_invalid');

    const report = {
      gate: 'adapter-e2e-parity',
      schemaVersion: '1.0.0',
      createdAt: new Date().toISOString(),
      policy,
      adapters: required,
      sessions,
      deltas: {
        p95LatencyDeltaMs,
        errorRateDelta,
        policyDecisionDelta
      },
      audit: {
        hashChainValid: auditHashChainValid,
        details: chain.body
      },
      passed: failures.length === 0,
      failures
    };

    const outPath = join(root, 'ci/baselines/evals/adapter-e2e-parity.report.json');
    await writeFile(outPath, JSON.stringify(report, null, 2), 'utf8');

    if (!report.passed) {
      throw new Error(`adapter_e2e_parity_gate_failed:${failures.join(',')}`);
    }

    console.log('Adapter E2E parity gate passed.');
  } finally {
    await gatewayServer.close();
    await auditServer.close();
    await memoryServer.close();
    await personaServer.close();
    await policyServer.close();
  }
};

void run().catch((error) => {
  console.error(String(error));
  process.exit(1);
});
