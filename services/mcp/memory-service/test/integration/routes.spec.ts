import { describe, expect, it } from 'vitest';
import { withStubbedFetch } from '../../../../../test/helpers/fetch.js';
import { getJson, loadRoute, postJson, startRouteServer, withTempDir } from '../../../../../ci/smoke/helpers.js';

const allowDecision = {
  state: 'allow',
  reasonCode: 'ok',
  requirements: [],
  budgetSnapshot: {
    remainingBudget: 10,
    maxBudget: 10,
    windowStart: '2026-03-11T00:00:00.000Z',
    windowEnd: '2026-03-11T00:01:00.000Z'
  },
  traceId: 'policy-trace',
  personaId: 'p1',
  tool: 'memory:write',
  riskClass: 'low',
  requiresConfirmation: false,
  policyVersion: 'v1',
  decisionId: 'decision-test',
  schemaVersion: '1.0.0',
  issuedAt: '2026-03-11T00:00:00.000Z'
};

describe('memory-service routes', () => {
  it('serves health and ready endpoints', async () => {
    await withTempDir('memory-service', async (dir) => {
      const route = await loadRoute('../../services/mcp/memory-service/src/routes.ts', {
        MEMORY_STORE_PATH: `${dir}/memory.json`
      });
      const running = await startRouteServer(route);

      await withStubbedFetch(
        [
          {
            match: 'http://localhost:4001/ready',
            response: { status: 200, body: { ok: true, ready: true } }
          }
        ],
        async () => {
          const health = await fetch(`${running.url}/health`);
          const ready = await fetch(`${running.url}/ready`);
          expect(health.status).toBe(200);
          expect(ready.status).toBe(200);
        }
      );

      await running.close();
    });
  });

  it('persists memory records across route reloads', async () => {
    await withTempDir('memory-service', async (dir) => {
      const env = {
        MEMORY_STORE_PATH: `${dir}/memory.json`
      };

      await withStubbedFetch(
        [
          {
            match: /http:\/\/localhost:4001\/policy\/check$/,
            response: { status: 200, body: allowDecision }
          }
        ],
        async () => {
          const firstRoute = await loadRoute('../../services/mcp/memory-service/src/routes.ts', env);
          const firstServer = await startRouteServer(firstRoute);

          const write = await postJson<{ id: string }>(
            `${firstServer.url}/memory/write`,
            { scope: 'session', value: { hello: 'world' } },
            {
              headers: {
                'x-user-id': 'u1',
                'x-tenant-id': 't1',
                'x-persona-id': 'p1'
              }
            }
          );
          expect(write.response.status).toBe(200);

          await firstServer.close();

          const secondRoute = await loadRoute('../../services/mcp/memory-service/src/routes.ts', env);
          const secondServer = await startRouteServer(secondRoute);

          const listed = await getJson<{ items: Array<{ id: string }> }>(`${secondServer.url}/memory/list?scope=session`, {
            headers: {
              'x-user-id': 'u1',
              'x-tenant-id': 't1',
              'x-persona-id': 'p1'
            }
          });

          expect(listed.response.status).toBe(200);
          expect(listed.body.items).toHaveLength(1);
          expect(listed.body.items[0]?.id).toBe(write.body.id);

          await secondServer.close();
        }
      );
    });
  });
});
