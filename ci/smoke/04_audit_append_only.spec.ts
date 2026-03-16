import { describe, expect, it } from 'vitest';
import { getJson, loadRoute, postJson, startRouteServer } from './helpers.js';

describe('smoke: audit append-only', () => {
  it('maintains hash-chain continuity under sustained writes', async () => {
    const route = await loadRoute('../../services/trust-safety/audit-ledger-service/src/routes.ts');
    const running = await startRouteServer(route);

    const writeService = 'smoke-audit-service';
    const writePrincipal = 'smoke-audit-user';
    const writes = Number(process.env.AUDIT_CHAIN_WRITES || '2000');

    const allEvents: Array<{
      id: string;
      schemaVersion: string;
      service: string;
      action: string;
      principal: string;
      resource?: string;
      metadata?: Record<string, unknown>;
      timestamp: string;
      prevHash: string;
      hash: string;
    }> = [];

    for (let i = 0; i < writes; i += 1) {
      const posted = await postJson(`${running.url}/audit/events`, {
        schemaVersion: '1.0.0',
        service: writeService,
        action: 'append',
        principal: `${writePrincipal}-${i % 4}`,
        metadata: { index: i }
      });

      expect(posted.response.status).toBe(200);
      expect(typeof posted.body.id).toBe('string');
      expect(typeof posted.body.timestamp).toBe('string');
      expect(typeof posted.body.prevHash).toBe('string');
      expect(typeof posted.body.hash).toBe('string');

      if (i === 0) {
        expect(posted.body.prevHash).toBe('genesis');
      }
      if (allEvents.length > 0) {
        expect(posted.body.prevHash).toBe(allEvents[allEvents.length - 1]!.hash);
      }
      allEvents.push(posted.body);
    }

    const events = await getJson(`${running.url}/audit/events`);
    expect(events.response.status).toBe(200);
    expect(Array.isArray(events.body)).toBe(true);
    expect(events.body.length).toBe(writes);

    const filteredPrincipal = await getJson(
      `${running.url}/audit/events?principal=${encodeURIComponent(`${writePrincipal}-1`)}`
    );
    expect(filteredPrincipal.response.status).toBe(200);
    expect(Array.isArray(filteredPrincipal.body)).toBe(true);
    expect(filteredPrincipal.body.every((entry: { principal: string }) => entry.principal === `${writePrincipal}-1`)).toBe(true);

    const filteredService = await getJson(`${running.url}/audit/events?service=${encodeURIComponent(writeService)}`);
    expect(filteredService.response.status).toBe(200);
    expect(Array.isArray(filteredService.body)).toBe(true);
    expect(filteredService.body.length).toBe(writes);

    const verification = await getJson(`${running.url}/audit/hash-chain/verify`);
    expect(verification.response.status).toBe(200);
    expect(verification.body.ok).toBe(true);
    expect(verification.body.error).toBeUndefined();

    const timeline = await getJson(`${running.url}/audit/events`);
    for (let i = 1; i < timeline.body.length; i += 1) {
      expect(timeline.body[i].prevHash).toBe(timeline.body[i - 1].hash);
    }

    await running.close();
  }, 15000);
});
