import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';
import { getJson, loadRoute, startRouteServer, withTempDir } from './helpers.js';
import { runCompose } from '../../packages/cli/src/commands/compose.js';
import { runInstall } from '../../packages/cli/src/commands/install.js';
import { runPolicyCheck } from '../../packages/cli/src/commands/policy-check.js';
import { runVerify } from '../../packages/cli/src/commands/verify.js';
import { PersonaPack } from '../../packages/persona-schema/types.js';
import { generateSigningKeys } from '../../packages/persona-signing/src/keygen.js';
import { signPersonaPack } from '../../packages/persona-signing/src/sign.js';

type CommandLog = {
  result: string | null;
  logs: string[];
};

const captureConsoleOutput = async <T>(action: () => Promise<T>): Promise<CommandLog> => {
  const logs: string[] = [];
  const previous = console.log;
  console.log = (...args: unknown[]) => {
    logs.push(args.map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg))).join(' '));
  };
  try {
    await action();
    return { result: null, logs };
  } finally {
    console.log = previous;
  }
};

const toJson = (logs: string[]) => {
  const raw = logs.map((line) => line.trim()).filter(Boolean).join('\n');
  return JSON.parse(raw) as Record<string, unknown>;
};

describe('smoke: cli install -> verify -> compose -> policy-check', () => {
  it('performs strict-mode install checks and policy checks through CLI commands', async () => {
    const previousMode = process.env.SIGNATURE_POLICY_MODE;
    process.env.SIGNATURE_POLICY_MODE = 'strict';

    await withTempDir('cli-smoke', async (root) => {
      const policyRoute = await loadRoute('../../services/trust-safety/policy-gate-service/src/routes.ts');
      const policy = await startRouteServer(policyRoute);

      const personaRegistryRoute = await loadRoute('../../services/mcp/persona-registry-service/src/routes.ts', {
        POLICY_SERVICE_URL: policy.url,
        SIGNATURE_POLICY_MODE: 'strict',
        PERSONA_PACKS_DIR: join(root, 'runtime-packs')
      });
      const registry = await startRouteServer(personaRegistryRoute);

      const packsDir = join(root, 'packs');
      await mkdir(packsDir, { recursive: true });

      const basePack: PersonaPack = {
        id: 'cli-smoke-persona',
        version: '1.0.0',
        schemaVersion: '1.0.0',
        persona: {
          id: 'cli-smoke-persona',
          name: 'CLI Smoke Persona',
          description: 'Persona used by smoke command flow.',
          version: '1.0.0',
          extends: [],
          systemPrompt: 'You are a smoke test persona.',
          userPromptTemplate: 'User asked: {{input}}',
          traits: ['smoke', 'stable'],
          allowedTools: ['memory:write'],
          deniedTools: [],
          style: {
            tone: 'neutral',
            constraints: [],
            examples: []
          },
          riskClass: 'low',
          metadata: { source: 'smoke' }
        },
        provenance: {
          source: 'ci/smoke',
          createdAt: Date.now()
        }
      };

      const keypair = generateSigningKeys();
      const signed = signPersonaPack(basePack, keypair.privateKey, keypair.publicKey);

      const unsignedPath = join(root, 'unsigned-pack.json');
      const signedPath = join(root, 'signed-pack.json');
      await writeFile(unsignedPath, JSON.stringify(basePack, null, 2), 'utf8');
      await writeFile(signedPath, JSON.stringify(signed, null, 2), 'utf8');

      const localComposePack = join(packsDir, `${basePack.id}.json`);
      await writeFile(localComposePack, JSON.stringify(signed.pack, null, 2), 'utf8');

      let unsignedRejected = false;
      try {
        await runVerify(unsignedPath, '', '');
      } catch (error) {
        unsignedRejected =
          String(error).includes('missing_signature_or_key') || String(error).includes('signature_required_in_strict_mode');
      }
      expect(unsignedRejected).toBe(true);

      const verifySigned = await captureConsoleOutput(async () => {
        await runVerify(signedPath, '', '');
      });
      const verifyReport = toJson(verifySigned.logs);
      expect(verifyReport.mode).toBe('strict');
      expect(verifyReport.status).toBe('signature_valid');

      const installLocal = await captureConsoleOutput(async () => {
        await runInstall(signedPath, {
          target: packsDir
        });
      });
      const installReport = toJson(installLocal.logs);
      expect(installReport.status).toBe('installed');

      const compose = await captureConsoleOutput(async () => {
        await runCompose(packsDir, basePack.id);
      });
      const rendered = toJson(compose.logs);
      expect(rendered.manifest.id).toBe(basePack.id);

      const policyCheck = await captureConsoleOutput(async () => {
        await runPolicyCheck(policy.url, JSON.stringify({
          personaId: 'policy-smoke-persona',
          userId: 'policy-smoke-user',
          tenantId: 'policy-smoke-tenant',
          tool: 'memory:write',
          action: 'write',
          riskClass: 'low',
          traceId: 'policy-smoke-flow'
        }));
      });
      const policyDecision = toJson(policyCheck.logs);
      expect(policyDecision.state).toBe('confirm');
      expect(policyDecision.reasonCode).toBe('missing_signature');
      expect(policyDecision.budgetSnapshot.remainingBudget).toBeGreaterThan(0);

      const installRemote = await captureConsoleOutput(async () => {
        await runInstall(signedPath, {
          registryUrl: `${registry.url}/personas`,
          signature: signed.signature,
          publicKey: keypair.publicKey
        });
      });
      const remoteReport = toJson(installRemote.logs);
      expect(remoteReport.status).toBe('installed');
      expect(remoteReport.mode).toBe('strict');

      const installed = await getJson(`${registry.url}/personas/${basePack.id}`, {
        headers: { 'x-policy-confirmed': 'true' }
      });
      expect(installed.response.status).toBe(200);
      expect(installed.body.pack?.persona?.id || installed.body.id || installed.body.persona?.id).toBe(basePack.id);

      await registry.close();
      await policy.close();
    });

    if (previousMode === undefined) {
      delete process.env.SIGNATURE_POLICY_MODE;
    } else {
      process.env.SIGNATURE_POLICY_MODE = previousMode;
    }
  });
});
