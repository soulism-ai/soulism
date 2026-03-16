import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getJson, loadRoute, postJson, startRouteServer } from '../smoke/helpers.js';
import { startExpoRuntimeSurface } from '../../examples/expo/runtime-surface.js';
import { startHfRuntimeSurface } from '../../examples/hf/runtime-surface.js';
import { startNextjsRuntimeSurface } from '../../examples/nextjs/runtime-surface.js';

type FrameworkParityPolicy = {
  schemaVersion: string;
  requiredRuntimes: Array<'nextjs' | 'expo' | 'hf-space'>;
  maxStartupLatencyDeltaMs: number;
  maxFirstResponseDeltaMs: number;
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
    await readFile(join(root, 'ci/policies/adapter-framework-parity.policy.json'), 'utf8')
  ) as FrameworkParityPolicy;

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
  const startupLatencyByRuntime: Record<string, number> = {};
  const firstResponseByRuntime: Record<string, number> = {};
  const surfaces: Array<{ runtime: 'nextjs' | 'expo' | 'hf-space'; url: string; close: () => Promise<void> }> = [];

  try {
    for (const runtime of runtimes) {
      const spec = runtimeSpecs[runtime];
      const start = performance.now();
      const surface = await spec.start(gatewayServer.url);
      const startupLatencyMs = performance.now() - start;
      startupLatencyByRuntime[runtime] = startupLatencyMs;
      surfaces.push({ runtime, url: surface.url, close: surface.close });
    }

    for (const item of surfaces) {
      const healthStart = performance.now();
      const health = await getJson(`${item.url}/health`);
      const duration = performance.now() - healthStart;
      firstResponseByRuntime[item.runtime] = duration;
      if (health.response.status !== 200) {
        throw new Error(`framework_surface_health_failed:${item.runtime}`);
      }
    }

    const sessions: RuntimeProbe[] = [];
    for (const item of surfaces) {
      const spec = runtimeSpecs[item.runtime];
      const response = await postJson(`${item.url}/parity/run`, {
        adapterId: spec.adapterId
      });
      if (response.response.status !== 200) {
        throw new Error(`framework_runtime_probe_failed:${item.runtime}`);
      }
      const probe = response.body as RuntimeProbe;
      sessions.push(probe);

      await postJson(`${auditServer.url}/audit/events`, {
        schemaVersion: '1.0.0',
        service: 'adapter-framework-parity-gate',
        action: 'framework_runtime_session',
        principal: spec.adapterId,
        metadata: {
          runtime: item.runtime,
          startupLatencyMs: startupLatencyByRuntime[item.runtime],
          firstResponseMs: firstResponseByRuntime[item.runtime],
          p95LatencyMs: probe.p95LatencyMs,
          errorRate: probe.errorRate,
          policyStateCounts: probe.policyStateCounts,
          statuses: probe.statuses
        }
      });
    }

    const reference = sessions[0];
    if (!reference) {
      throw new Error('framework_runtime_reference_session_missing');
    }

    let startupLatencyDeltaMs = 0;
    let firstResponseDeltaMs = 0;
    let p95LatencyDeltaMs = 0;
    let errorRateDelta = 0;
    let policyDecisionDelta = 0;

    for (const session of sessions.slice(1)) {
      startupLatencyDeltaMs = Math.max(
        startupLatencyDeltaMs,
        Math.abs(startupLatencyByRuntime[reference.runtime] - startupLatencyByRuntime[session.runtime])
      );
      firstResponseDeltaMs = Math.max(
        firstResponseDeltaMs,
        Math.abs(firstResponseByRuntime[reference.runtime] - firstResponseByRuntime[session.runtime])
      );
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
    if (startupLatencyDeltaMs > policy.maxStartupLatencyDeltaMs) failures.push('startup_latency_delta_exceeded');
    if (firstResponseDeltaMs > policy.maxFirstResponseDeltaMs) failures.push('first_response_delta_exceeded');
    if (p95LatencyDeltaMs > policy.maxP95LatencyDeltaMs) failures.push('p95_latency_delta_exceeded');
    if (errorRateDelta > policy.maxErrorRateDelta) failures.push('error_rate_delta_exceeded');
    if (policyDecisionDelta > policy.maxPolicyDecisionDelta) failures.push('policy_decision_delta_exceeded');
    if (!stateMatrixSatisfied) failures.push('policy_matrix_coverage_failed');
    if (policy.requireAuditHashChainValid && !auditHashChainValid) failures.push('audit_hash_chain_invalid');

    const report = {
      gate: 'adapter-framework-parity',
      schemaVersion: '1.0.0',
      createdAt: new Date().toISOString(),
      policy,
      runtimes,
      startup: {
        byRuntime: startupLatencyByRuntime,
        maxDeltaMs: startupLatencyDeltaMs
      },
      firstResponse: {
        byRuntime: firstResponseByRuntime,
        maxDeltaMs: firstResponseDeltaMs
      },
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

    await writeFile(join(root, 'ci/baselines/evals/adapter-framework-parity.report.json'), JSON.stringify(report, null, 2), 'utf8');

    if (failures.length > 0) {
      throw new Error(`adapter_framework_parity_gate_failed:${failures.join(',')}`);
    }

    console.log('Adapter framework parity gate passed.');
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
