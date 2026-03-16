import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getJson, loadRoute, postJson, startRouteServer } from '../smoke/helpers.js';
import { startExpoRuntimeSurface } from '../../examples/expo/runtime-surface.js';
import { startHfRuntimeSurface } from '../../examples/hf/runtime-surface.js';
import { startNextjsRuntimeSurface } from '../../examples/nextjs/runtime-surface.js';

type RuntimeParityPolicy = {
  schemaVersion: string;
  requiredRuntimes: Array<'nextjs' | 'expo' | 'hf-space'>;
  maxP95LatencyDeltaMs: number;
  maxErrorRateDelta: number;
  maxPolicyDecisionDelta: number;
  requirePolicyMatrixStates: Array<'allow' | 'confirm' | 'deny'>;
  requireAuditHashChainValid: boolean;
};

type RuntimeProbe = {
  runtime: 'nextjs' | 'expo' | 'hf-space';
  adapterId: string;
  p95LatencyMs: number;
  errorRate: number;
  totalChecks: number;
  policyStateCounts: Record<'allow' | 'confirm' | 'deny', number>;
  statuses: Record<string, number>;
};

type RuntimeSpec = {
  start: (gatewayUrl: string) => Promise<{ url: string; close: () => Promise<void> }>;
  adapterId: string;
};

const root = process.cwd();
const rate = (value: number, total: number): number => (total === 0 ? 0 : value / total);
const defaultRuntimes: Array<'nextjs' | 'expo' | 'hf-space'> = ['nextjs', 'expo', 'hf-space'];

const runtimeSpecs: Record<'nextjs' | 'expo' | 'hf-space', RuntimeSpec> = {
  nextjs: {
    start: startNextjsRuntimeSurface,
    adapterId: 'nextjs-adapter'
  },
  expo: {
    start: startExpoRuntimeSurface,
    adapterId: 'expo-adapter'
  },
  'hf-space': {
    start: startHfRuntimeSurface,
    adapterId: 'hf-space'
  }
};

const run = async () => {
  const policy = JSON.parse(
    await readFile(join(root, 'ci/policies/adapter-runtime-parity.policy.json'), 'utf8')
  ) as RuntimeParityPolicy;

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

  const runtimes = (policy.requiredRuntimes || defaultRuntimes).filter((runtime) => Boolean(runtimeSpecs[runtime]));
  const surfaces: Array<{ runtime: 'nextjs' | 'expo' | 'hf-space'; url: string; close: () => Promise<void> }> = [];

  try {
    for (const runtime of runtimes) {
      const surface = await runtimeSpecs[runtime].start(gatewayServer.url);
      surfaces.push({ runtime, url: surface.url, close: surface.close });
    }

    const sessions: RuntimeProbe[] = [];
    for (const runtime of runtimes) {
      const surface = surfaces.find((item) => item.runtime === runtime);
      if (!surface) continue;
      const adapterId = runtimeSpecs[runtime].adapterId;
      const response = await postJson(`${surface.url}/parity/run`, { adapterId });
      if (response.response.status !== 200) {
        throw new Error(`runtime_surface_failed:${runtime}`);
      }
      const probe = response.body as RuntimeProbe;
      sessions.push(probe);

      await postJson(`${auditServer.url}/audit/events`, {
        schemaVersion: '1.0.0',
        service: 'adapter-runtime-parity-gate',
        action: 'runtime_session',
        principal: adapterId,
        metadata: {
          runtime,
          p95LatencyMs: probe.p95LatencyMs,
          errorRate: probe.errorRate,
          stateCounts: probe.policyStateCounts,
          statuses: probe.statuses
        }
      });
    }

    const reference = sessions[0];
    if (!reference) throw new Error('runtime_parity_reference_session_missing');

    let p95LatencyDeltaMs = 0;
    let errorRateDelta = 0;
    let policyDecisionDelta = 0;

    for (const session of sessions.slice(1)) {
      p95LatencyDeltaMs = Math.max(p95LatencyDeltaMs, Math.abs(reference.p95LatencyMs - session.p95LatencyMs));
      errorRateDelta = Math.max(errorRateDelta, Math.abs(reference.errorRate - session.errorRate));
      const referenceRates = {
        allow: rate(reference.policyStateCounts.allow, reference.totalChecks),
        confirm: rate(reference.policyStateCounts.confirm, reference.totalChecks),
        deny: rate(reference.policyStateCounts.deny, reference.totalChecks)
      };
      const sessionRates = {
        allow: rate(session.policyStateCounts.allow, session.totalChecks),
        confirm: rate(session.policyStateCounts.confirm, session.totalChecks),
        deny: rate(session.policyStateCounts.deny, session.totalChecks)
      };
      policyDecisionDelta = Math.max(
        policyDecisionDelta,
        Math.abs(referenceRates.allow - sessionRates.allow),
        Math.abs(referenceRates.confirm - sessionRates.confirm),
        Math.abs(referenceRates.deny - sessionRates.deny)
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
    if (!stateMatrixSatisfied) failures.push('policy_matrix_coverage_failed');
    if (policy.requireAuditHashChainValid && !auditHashChainValid) failures.push('audit_hash_chain_invalid');

    const report = {
      gate: 'adapter-runtime-parity',
      schemaVersion: '1.0.0',
      createdAt: new Date().toISOString(),
      policy,
      runtimes,
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

    await writeFile(
      join(root, 'ci/baselines/evals/adapter-runtime-parity.report.json'),
      JSON.stringify(report, null, 2),
      'utf8'
    );

    if (failures.length > 0) {
      throw new Error(`adapter_runtime_parity_gate_failed:${failures.join(',')}`);
    }

    console.log('Adapter runtime parity gate passed.');
  } finally {
    await Promise.all(surfaces.map((surface) => surface.close()));
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
