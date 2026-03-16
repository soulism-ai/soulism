import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getJson, loadRoute, postJson, startRouteServer } from '../smoke/helpers.js';

type FrameworkCliBootPolicy = {
  schemaVersion: string;
  requiredRuntimes: Array<'nextjs' | 'expo'>;
  startupTimeoutMs: number;
  maxStartupLatencyDeltaMs: number;
  maxFirstResponseDeltaMs: number;
  maxP95LatencyDeltaMs: number;
  maxErrorRateDelta: number;
  maxPolicyDecisionDelta: number;
  requirePolicyMatrixStates: Array<'allow' | 'confirm' | 'deny'>;
  requireAuditHashChainValid: boolean;
};

type RuntimeProbe = {
  runtime: 'nextjs' | 'expo';
  adapterId: string;
  p95LatencyMs: number;
  errorRate: number;
  totalChecks: number;
  policyStateCounts: Record<'allow' | 'confirm' | 'deny', number>;
  statuses: Record<string, number>;
};

type BootedRuntime = {
  runtime: 'nextjs' | 'expo';
  process: ChildProcessWithoutNullStreams;
  startupLatencyMs: number;
  url: string;
  logs: {
    stdout: string;
    stderr: string;
  };
};

const root = process.cwd();

const rate = (value: number, total: number): number => (total === 0 ? 0 : value / total);

const stopProcess = async (child: ChildProcessWithoutNullStreams): Promise<void> => {
  if (child.exitCode !== null || child.killed) return;
  await new Promise<void>((resolve) => {
    const done = () => resolve();
    child.once('exit', done);
    child.kill('SIGTERM');
    setTimeout(() => {
      if (child.exitCode === null) child.kill('SIGKILL');
    }, 2_000);
    setTimeout(resolve, 3_000);
  });
};

const waitForReadyUrl = async (
  child: ChildProcessWithoutNullStreams,
  runtime: 'nextjs' | 'expo',
  timeoutMs: number
): Promise<{ url: string; stdout: string; stderr: string }> => {
  const marker = `${runtime}_runtime_surface_ready:`;
  return await new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';

    const timeout = setTimeout(() => {
      child.stdout.off('data', onStdout);
      child.stderr.off('data', onStderr);
      reject(new Error(`startup_timeout:${runtime}:${timeoutMs}:stdout=${stdout}:stderr=${stderr}`));
    }, timeoutMs);

    const finish = (url: string) => {
      clearTimeout(timeout);
      child.stdout.off('data', onStdout);
      child.stderr.off('data', onStderr);
      resolve({ url, stdout, stderr });
    };

    const onStdout = (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
      const lines = stdout.split('\n');
      for (const line of lines) {
        const idx = line.indexOf(marker);
        if (idx >= 0) {
          const value = line.slice(idx + marker.length).trim();
          if (value.startsWith('http://') || value.startsWith('https://')) {
            finish(value);
            return;
          }
        }
      }
    };

    const onStderr = (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    };

    child.on('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`process_exit_before_ready:${runtime}:${String(code)}:stdout=${stdout}:stderr=${stderr}`));
    });

    child.stdout.on('data', onStdout);
    child.stderr.on('data', onStderr);
  });
};

const spawnRuntimeCli = async (
  runtime: 'nextjs' | 'expo',
  gatewayUrl: string,
  startupTimeoutMs: number
): Promise<BootedRuntime> => {
  const cwd = runtime === 'nextjs' ? join(root, 'examples/nextjs') : join(root, 'examples/expo');
  const start = performance.now();
  const child = spawn('pnpm', ['run', 'adapter:probe'], {
    cwd,
    env: {
      ...process.env,
      GATEWAY_URL: gatewayUrl
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  const ready = await waitForReadyUrl(child, runtime, startupTimeoutMs);
  return {
    runtime,
    process: child,
    startupLatencyMs: performance.now() - start,
    url: ready.url,
    logs: {
      stdout: ready.stdout,
      stderr: ready.stderr
    }
  };
};

const classifyFailure = (error: string): string => {
  if (error.includes('startup_timeout')) return 'startup_timeout';
  if (error.includes('process_exit_before_ready')) return 'process_exit_before_ready';
  if (error.includes('framework_cli_boot_health_failed')) return 'health_failure';
  if (error.includes('framework_cli_boot_probe_failed')) return 'probe_failure';
  return 'unknown_failure';
};

const run = async () => {
  const policy = JSON.parse(
    await readFile(join(root, 'ci/policies/adapter-framework-cli-boot.policy.json'), 'utf8')
  ) as FrameworkCliBootPolicy;

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

  const booted: BootedRuntime[] = [];
  let failureTaxonomy: string | null = null;

  try {
    for (const runtime of policy.requiredRuntimes || ['nextjs', 'expo']) {
      const server = await spawnRuntimeCli(runtime, gatewayServer.url, policy.startupTimeoutMs);
      booted.push(server);
    }

    const next = booted.find((item) => item.runtime === 'nextjs');
    const expo = booted.find((item) => item.runtime === 'expo');
    if (!next || !expo) throw new Error('framework_cli_boot_missing_runtime');

    const nextHealthStart = performance.now();
    const nextHealth = await getJson(`${next.url}/health`);
    const nextFirstResponseMs = performance.now() - nextHealthStart;
    const expoHealthStart = performance.now();
    const expoHealth = await getJson(`${expo.url}/health`);
    const expoFirstResponseMs = performance.now() - expoHealthStart;

    if (nextHealth.response.status !== 200 || expoHealth.response.status !== 200) {
      throw new Error('framework_cli_boot_health_failed');
    }

    const runtimeToAdapter: Record<'nextjs' | 'expo', string> = {
      nextjs: 'nextjs-adapter',
      expo: 'expo-adapter'
    };
    const sessions: RuntimeProbe[] = [];

    for (const runtime of policy.requiredRuntimes || ['nextjs', 'expo']) {
      const entry = booted.find((item) => item.runtime === runtime);
      if (!entry) continue;
      const adapterId = runtimeToAdapter[runtime];
      const probeResponse = await postJson(`${entry.url}/parity/run`, { adapterId });
      if (probeResponse.response.status !== 200) {
        throw new Error(`framework_cli_boot_probe_failed:${runtime}`);
      }
      const probe = probeResponse.body as RuntimeProbe;
      sessions.push(probe);

      await postJson(`${auditServer.url}/audit/events`, {
        schemaVersion: '1.0.0',
        service: 'adapter-framework-cli-boot-gate',
        action: 'framework_cli_boot_session',
        principal: adapterId,
        metadata: {
          runtime,
          startupLatencyMs: entry.startupLatencyMs,
          firstResponseMs: runtime === 'nextjs' ? nextFirstResponseMs : expoFirstResponseMs,
          p95LatencyMs: probe.p95LatencyMs,
          errorRate: probe.errorRate,
          policyStateCounts: probe.policyStateCounts,
          statuses: probe.statuses
        }
      });
    }

    const nextSession = sessions.find((session) => session.runtime === 'nextjs');
    const expoSession = sessions.find((session) => session.runtime === 'expo');
    if (!nextSession || !expoSession) throw new Error('framework_cli_boot_sessions_missing');

    const startupLatencyDeltaMs = Math.abs(next.startupLatencyMs - expo.startupLatencyMs);
    const firstResponseDeltaMs = Math.abs(nextFirstResponseMs - expoFirstResponseMs);
    const p95LatencyDeltaMs = Math.abs(nextSession.p95LatencyMs - expoSession.p95LatencyMs);
    const errorRateDelta = Math.abs(nextSession.errorRate - expoSession.errorRate);
    const nextRates = {
      allow: rate(nextSession.policyStateCounts.allow, 3),
      confirm: rate(nextSession.policyStateCounts.confirm, 3),
      deny: rate(nextSession.policyStateCounts.deny, 3)
    };
    const expoRates = {
      allow: rate(expoSession.policyStateCounts.allow, 3),
      confirm: rate(expoSession.policyStateCounts.confirm, 3),
      deny: rate(expoSession.policyStateCounts.deny, 3)
    };
    const policyDecisionDelta = Math.max(
      Math.abs(nextRates.allow - expoRates.allow),
      Math.abs(nextRates.confirm - expoRates.confirm),
      Math.abs(nextRates.deny - expoRates.deny)
    );
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
      gate: 'adapter-framework-cli-boot',
      schemaVersion: '1.0.0',
      createdAt: new Date().toISOString(),
      policy,
      startup: {
        nextjsMs: next.startupLatencyMs,
        expoMs: expo.startupLatencyMs,
        deltaMs: startupLatencyDeltaMs
      },
      firstResponse: {
        nextjsMs: nextFirstResponseMs,
        expoMs: expoFirstResponseMs,
        deltaMs: firstResponseDeltaMs
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
      failureTaxonomy,
      cliBootLogs: {
        nextjs: next.logs,
        expo: expo.logs
      },
      passed: failures.length === 0,
      failures
    };

    await writeFile(join(root, 'ci/baselines/evals/adapter-framework-cli-boot.report.json'), JSON.stringify(report, null, 2), 'utf8');

    if (failures.length > 0) {
      throw new Error(`adapter_framework_cli_boot_gate_failed:${failures.join(',')}`);
    }

    console.log('Adapter framework CLI boot gate passed.');
  } catch (error) {
    failureTaxonomy = classifyFailure(String(error));
    const report = {
      gate: 'adapter-framework-cli-boot',
      schemaVersion: '1.0.0',
      createdAt: new Date().toISOString(),
      policy,
      failureTaxonomy,
      passed: false,
      failures: [String(error)]
    };
    await writeFile(join(root, 'ci/baselines/evals/adapter-framework-cli-boot.report.json'), JSON.stringify(report, null, 2), 'utf8');
    throw error;
  } finally {
    await Promise.all(booted.map((entry) => stopProcess(entry.process)));
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
