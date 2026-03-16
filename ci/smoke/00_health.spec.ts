import { describe, expect, it } from 'vitest';
import { getJson, loadRoute, startRouteServer } from './helpers.js';
import { withStubbedFetch } from '../../test/helpers/fetch.js';

const services = [
  '../../services/trust-safety/policy-gate-service/src/routes.ts',
  '../../services/trust-safety/risk-budget-service/src/routes.ts',
  '../../services/trust-safety/audit-ledger-service/src/routes.ts',
  '../../services/mcp/persona-registry-service/src/routes.ts',
  '../../services/mcp/memory-service/src/routes.ts',
  '../../services/mcp/tool-webfetch-service/src/routes.ts',
  '../../services/mcp/tool-files-service/src/routes.ts',
  '../../services/edge/api-gateway/src/routes.ts'
];

describe('smoke: health/readiness', () => {
  it('exposes /health and /ready across services', async () => {
    await withStubbedFetch(
      [
        {
          match: /http:\/\/localhost:(3001|3002|3003|3004|4001|4002|4003)\/ready$/,
          response: { status: 200, body: { ok: true, ready: true } }
        }
      ],
      async () => {
        for (const service of services) {
          const route = await loadRoute(service);
          const running = await startRouteServer(route);

          const health = await getJson(`${running.url}/health`);
          expect(health.response.status).toBe(200);
          expect(health.body.ok).toBe(true);

          const ready = await getJson(`${running.url}/ready`);
          expect(ready.response.status).toBe(200);
          expect(ready.body.ready).toBe(true);

          const metrics = await getJson(`${running.url}/metrics`);
          expect(metrics.response.status).toBe(200);
          expect(metrics.body.service).toBeTypeOf('string');

          await running.close();
        }
      }
    );
  });

  it('fails readiness when a required dependency reports unavailable', async () => {
    const route = await loadRoute('../../services/mcp/memory-service/src/routes.ts');
    const running = await startRouteServer(route);

    await withStubbedFetch(
      [
        {
          match: 'http://localhost:4001/ready',
          response: { status: 503, body: { ok: false, ready: false, reason: 'policy_down' } }
        }
      ],
      async () => {
        const ready = await getJson<{ ready: boolean; errors: string[] }>(`${running.url}/ready`);
        expect(ready.response.status).toBe(503);
        expect(ready.body.ready).toBe(false);
        expect(ready.body.errors.some((entry) => entry.includes('policy-gate'))).toBe(true);
      }
    );

    await running.close();
  });
});
