import { describe, expect, it } from 'vitest';
import { getJson, loadRoute, postJson, startRouteServer, withTempDir } from '../../../../../ci/smoke/helpers.js';

describe('risk-budget-service routes', () => {
  it('serves health and ready endpoints', async () => {
    await withTempDir('risk-budget-service', async (dir) => {
      const route = await loadRoute('../../services/trust-safety/risk-budget-service/src/routes.ts', {
        RISK_BUDGET_STORE_PATH: `${dir}/budgets.json`
      });
      const running = await startRouteServer(route);

      const health = await fetch(`${running.url}/health`);
      const ready = await fetch(`${running.url}/ready`);
      expect(health.status).toBe(200);
      expect(ready.status).toBe(200);

      await running.close();
    });
  });

  it('persists budget usage across route reloads', async () => {
    await withTempDir('risk-budget-service', async (dir) => {
      const env = {
        RISK_BUDGET_STORE_PATH: `${dir}/budgets.json`
      };

      const firstRoute = await loadRoute('../../services/trust-safety/risk-budget-service/src/routes.ts', env);
      const firstServer = await startRouteServer(firstRoute);

      const check = await postJson<{ remaining: number }>(`${firstServer.url}/budgets/check`, {
        personaId: 'p1',
        userId: 'u1',
        tenantId: 't1',
        tool: 'tool:webfetch',
        riskClass: 'low'
      });

      expect(check.response.status).toBe(200);
      expect(check.body.remaining).toBeGreaterThanOrEqual(0);

      await firstServer.close();

      const secondRoute = await loadRoute('../../services/trust-safety/risk-budget-service/src/routes.ts', env);
      const secondServer = await startRouteServer(secondRoute);

      const budgets = await getJson<Array<{ key: string; remaining: number }>>(`${secondServer.url}/budgets`);
      expect(budgets.response.status).toBe(200);
      expect(Array.isArray(budgets.body)).toBe(true);
      expect(budgets.body).toHaveLength(1);
      expect(budgets.body[0]?.key).toContain('p1');

      await secondServer.close();
    });
  });
});
