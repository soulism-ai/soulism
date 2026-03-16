import { describe, expect, it } from 'vitest';
import { getJson, loadRoute, postJson, startRouteServer } from './helpers.js';

describe('smoke: budget exhaustion and reset', () => {
  const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

  it('tracks budget exhaustion and windowed reset', async () => {
    const budgetWindowMs = 100;
    const resetWaitMs = 130;
    const route = await loadRoute('../../services/trust-safety/risk-budget-service/src/routes.ts', {
      RISK_BUDGET_WINDOW_MS: String(budgetWindowMs),
      RISK_BUDGET_MAX: '3'
    });
    const running = await startRouteServer(route);

    const request = {
      personaId: 'budget-persona',
      userId: 'budget-user',
      tenantId: 'budget-tenant',
      tool: 'memory:write',
      riskClass: 'low'
    };

    let denyCount = 0;
    let finalAllowed = true;
    let finalRemaining = Number.POSITIVE_INFINITY;
    const check = async () =>
      postJson(`${running.url}/budgets/check`, request);

    for (let i = 0; i < 5; i += 1) {
      const response = await check();
      expect(response.response.status).toBe(200);
      if (typeof response.body.allowed === 'boolean' && !response.body.allowed) {
        denyCount += 1;
      }
      finalAllowed = response.body.allowed;
      finalRemaining = response.body.remaining;
    }

    expect(finalAllowed).toBe(false);
    expect(denyCount).toBe(2);
    expect(finalRemaining).toBe(0);

    const budgets = await getJson(`${running.url}/budgets`);
    expect(Array.isArray(budgets.body)).toBe(true);
    expect(budgets.body.length).toBe(1);
    expect(budgets.body[0].key).toContain(`${request.tenantId}:${request.userId}:${request.personaId}:${request.tool}`);
    expect(budgets.body[0].max).toBe(3);
    expect(['number', 'string'].includes(typeof budgets.body[0].windowEndsAt)).toBe(true);

    await wait(resetWaitMs);
    const afterReset = await check();
    expect(afterReset.response.status).toBe(200);
    expect(afterReset.body.allowed).toBe(true);
    expect(afterReset.body.remaining).toBe(2);

    const reset = await postJson(`${running.url}/budgets/reset`, {});
    expect(reset.response.status).toBe(200);
    expect(reset.body.ok).toBe(true);

    const afterResetEndpoint = await getJson(`${running.url}/budgets`);
    expect(Array.isArray(afterResetEndpoint.body)).toBe(true);
    expect(afterResetEndpoint.body.length).toBe(0);

    const final = await check();
    expect(final.response.status).toBe(200);
    expect(final.body.allowed).toBe(true);
    expect(final.body.remaining).toBe(2);

    await running.close();
  });
});
