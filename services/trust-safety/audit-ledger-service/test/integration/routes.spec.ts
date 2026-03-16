import { describe, expect, it } from 'vitest';
import { getJson, loadRoute, postJson, startRouteServer, withTempDir } from '../../../../../ci/smoke/helpers.js';

describe('audit-ledger-service routes', () => {
  it('serves health and ready endpoints', async () => {
    await withTempDir('audit-ledger-service', async (dir) => {
      const route = await loadRoute('../../services/trust-safety/audit-ledger-service/src/routes.ts', {
        AUDIT_STORE_PATH: `${dir}/audit.json`
      });
      const running = await startRouteServer(route);

      const health = await fetch(`${running.url}/health`);
      const ready = await fetch(`${running.url}/ready`);
      expect(health.status).toBe(200);
      expect(ready.status).toBe(200);

      await running.close();
    });
  });

  it('persists appended audit events across route reloads', async () => {
    await withTempDir('audit-ledger-service', async (dir) => {
      const env = {
        AUDIT_STORE_PATH: `${dir}/audit.json`
      };

      const firstRoute = await loadRoute('../../services/trust-safety/audit-ledger-service/src/routes.ts', env);
      const firstServer = await startRouteServer(firstRoute);

      const appended = await postJson<{ id: string; hash: string }>(`${firstServer.url}/audit/events`, {
        schemaVersion: '1.0.0',
        service: 'integration-test',
        action: 'append',
        principal: 'tester'
      });

      expect(appended.response.status).toBe(200);
      expect(typeof appended.body.id).toBe('string');

      await firstServer.close();

      const secondRoute = await loadRoute('../../services/trust-safety/audit-ledger-service/src/routes.ts', env);
      const secondServer = await startRouteServer(secondRoute);

      const events = await getJson<Array<{ id: string }>>(`${secondServer.url}/audit/events`);
      expect(events.response.status).toBe(200);
      expect(events.body).toHaveLength(1);
      expect(events.body[0]?.id).toBe(appended.body.id);

      const verification = await getJson<{ ok: boolean }>(`${secondServer.url}/audit/hash-chain/verify`);
      expect(verification.response.status).toBe(200);
      expect(verification.body.ok).toBe(true);

      await secondServer.close();
    });
  });
});
