import { createServer, type Server } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { route } from '../../services/trust-safety/audit-ledger-service/src/routes.js';
import { readEvidenceEnvelope, writeEvidenceEnvelope } from './lib/evidence.js';

const readPreviousDigest = async (): Promise<string | undefined> => {
  try {
    const previousRaw = await readFile(join(process.cwd(), 'ci/baselines', 'audit-evidence.json'), 'utf8');
    const previous = readEvidenceEnvelope(JSON.parse(previousRaw));
    return previous.digest;
  } catch {
    return undefined;
  }
};

const postJson = async (url: string, payload: unknown): Promise<Response> =>
  fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });

const run = async () => {
  let server: Server | null = null;
  try {
    server = createServer((req, res) => {
      void route(req, res);
    });

    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', () => resolve()));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('audit_ledger_bind_failed');

    const base = `http://127.0.0.1:${address.port}`;
    const now = Date.now();
    const seedEvents = [
      { action: 'policy_check', principal: 'ci', service: 'policy-gate' },
      { action: 'tool_invocation', principal: 'ci', service: 'api-gateway' },
      { action: 'memory_write', principal: 'ci', service: 'memory-service' },
      { action: 'webfetch', principal: 'ci', service: 'tool-webfetch-service' },
      { action: 'distribution_bundle', principal: 'ci', service: 'release-pipeline' }
    ];

    for (let i = 0; i < seedEvents.length; i += 1) {
      const seeded = seedEvents[i];
      const response = await postJson(`${base}/audit/events`, {
        schemaVersion: '1.0.0',
        service: seeded.service,
        action: seeded.action,
        principal: seeded.principal,
        resource: `ci/session/${now}`,
        metadata: {
          releaseId: process.env.RELEASE_ID || process.env.GITHUB_RUN_ID || 'local',
          seedIndex: i
        }
      });
      if (!response.ok) {
        throw new Error(`audit_seed_write_failed:${response.status}`);
      }
    }

    const eventsResponse = await fetch(`${base}/audit/events`);
    if (!eventsResponse.ok) throw new Error(`audit_events_fetch_failed:${eventsResponse.status}`);
    const events = await eventsResponse.json();

    const verifyResponse = await fetch(`${base}/audit/hash-chain/verify`);
    if (!verifyResponse.ok) throw new Error(`audit_verify_failed:${verifyResponse.status}`);
    const chain = (await verifyResponse.json()) as { ok?: boolean; error?: string };
    if (!chain.ok) {
      throw new Error(`audit_chain_invalid:${chain.error || 'unknown'}`);
    }

    const payload = {
      exportedAt: new Date().toISOString(),
      source: {
        service: 'audit-ledger-service',
        mode: 'live-ephemeral',
        releaseId: process.env.RELEASE_ID || process.env.GITHUB_RUN_ID || 'local',
        commit: process.env.GITHUB_SHA || 'local',
        ref: process.env.GITHUB_REF_NAME || process.env.GITHUB_REF || 'local',
        runId: process.env.GITHUB_RUN_ID || 'local'
      },
      eventCount: Array.isArray(events) ? events.length : 0,
      chainVerification: chain,
      events
    };
    const payloadWithContext = {
      ...payload,
      generatedBy: 'tools/scripts/generate-live-audit-evidence.ts'
    };
    const previousDigest = await readPreviousDigest();
    const evidence = writeEvidenceEnvelope(payloadWithContext, 'audit-evidence', previousDigest);

    const out = join(process.cwd(), 'ci', 'baselines', 'audit-evidence.json');
    await writeFile(out, JSON.stringify(evidence, null, 2), 'utf8');
    console.log(`Live audit evidence generated: ${out}`);
  } finally {
    if (server) {
      await new Promise<void>((resolve, reject) => server!.close((error) => (error ? reject(error) : resolve())));
    }
  }
};

void run().catch((error) => {
  console.error(String(error));
  process.exit(1);
});
