import { createServer, type Server } from 'node:http';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateSigningKeys } from '../../packages/persona-signing/src/keygen.js';
import { signPersonaPack } from '../../packages/persona-signing/src/sign.js';
import { runVerify } from '../../packages/cli/src/commands/verify.js';
import { loadRoute, postJson, startRouteServer } from '../smoke/helpers.js';

const run = async () => {
  const workDir = await mkdtemp(join(tmpdir(), 'signing-gate-'));
  let policyServer: Server | null = null;
  let personaServer: Awaited<ReturnType<typeof startRouteServer>> | null = null;

  try {
    const packsDir = join(workDir, 'packs');
    await writeFile(join(workDir, '.keep'), 'ok', 'utf8');
    await rm(packsDir, { recursive: true, force: true }).catch(() => undefined);
    await writeFile(join(workDir, 'public.key'), '', 'utf8');

    const { publicKey, privateKey } = generateSigningKeys();
    await writeFile(join(workDir, 'public.key'), publicKey, 'utf8');

    const pack = {
      id: 'signing-gate-pack',
      version: '1.0.0',
      schemaVersion: '1.0.0',
      persona: {
        id: 'signing-gate-pack',
        name: 'Signing Gate Persona',
        description: 'Strict signing enforcement test',
        systemPrompt: 'system',
        userPromptTemplate: 'user',
        extends: [],
        traits: [],
        allowedTools: ['persona:registry'],
        deniedTools: [],
        style: { tone: 'strict', constraints: [], examples: [] },
        riskClass: 'low',
        metadata: {}
      },
      provenance: { source: 'ci', createdAt: Date.now() }
    };

    const signed = signPersonaPack(pack, privateKey, publicKey);
    const unsignedPath = join(workDir, 'unsigned-pack.json');
    const signedPath = join(workDir, 'signed-pack.json');
    await writeFile(unsignedPath, JSON.stringify(pack, null, 2), 'utf8');
    await writeFile(signedPath, JSON.stringify(signed, null, 2), 'utf8');

    process.env.SIGNATURE_POLICY_MODE = 'strict';

    let cliRejectsUnsigned = false;
    try {
      await runVerify(unsignedPath, '', '');
    } catch (error) {
      cliRejectsUnsigned = String(error).includes('signature_required_in_strict_mode');
      process.exitCode = 0;
    }

    let cliAcceptsSigned = true;
    try {
      await runVerify(signedPath, '', '');
    } catch {
      cliAcceptsSigned = false;
    }

    policyServer = createServer((req, res) => {
      if (req.method === 'POST' && req.url === '/policy/check') {
        res.statusCode = 200;
        res.setHeader('content-type', 'application/json');
        res.end(
          JSON.stringify({
            state: 'allow',
            reasonCode: 'ok',
            requirements: []
          })
        );
        return;
      }
      res.statusCode = 404;
      res.end(JSON.stringify({ error: 'not_found' }));
    });

    await new Promise<void>((resolve) => policyServer!.listen(0, '127.0.0.1', () => resolve()));
    const policyAddress = policyServer.address();
    if (!policyAddress || typeof policyAddress === 'string') throw new Error('policy_server_bind_failed');
    const policyUrl = `http://127.0.0.1:${policyAddress.port}`;

    const personaRoute = await loadRoute('../../services/mcp/persona-registry-service/src/routes.ts', {
      SIGNATURE_POLICY_MODE: 'strict',
      SIGNING_PUBLIC_KEY_PATH: join(workDir, 'public.key'),
      POLICY_SERVICE_URL: policyUrl,
      PERSONA_PACKS_DIR: packsDir
    });
    personaServer = await startRouteServer(personaRoute);

    const runtimeUnsigned = await postJson(`${personaServer.url}/personas/verify`, {
      pack
    });
    const runtimeSigned = await postJson(`${personaServer.url}/personas/verify`, {
      pack,
      signature: signed.signature,
      publicKey: signed.publicKey
    });

    const passed =
      cliRejectsUnsigned &&
      cliAcceptsSigned &&
      runtimeUnsigned.response.status === 403 &&
      runtimeSigned.response.status === 200;

    const report = {
      gate: 'signing-enforcement',
      passed,
      strictMode: true,
      cli: {
        rejectsUnsigned: cliRejectsUnsigned,
        acceptsSigned: cliAcceptsSigned
      },
      runtime: {
        unsignedStatus: runtimeUnsigned.response.status,
        signedStatus: runtimeSigned.response.status
      },
      createdAt: new Date().toISOString()
    };

    const outPath = join(process.cwd(), 'ci', 'baselines', 'evals', 'signing-enforcement.report.json');
    await writeFile(outPath, JSON.stringify(report, null, 2), 'utf8');

    if (!passed) {
      throw new Error('signing_enforcement_gate_failed');
    }

    console.log('Signing enforcement gate passed.');
  } finally {
    if (personaServer) await personaServer.close();
    if (policyServer) {
      await new Promise<void>((resolve, reject) => policyServer!.close((err) => (err ? reject(err) : resolve())));
    }
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
};

void run().catch((error) => {
  console.error(String(error));
  process.exit(1);
});
