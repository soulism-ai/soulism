import { describe, expect, it } from 'vitest';
import { loadRoute, postJson, startRouteServer } from './helpers.js';

describe('smoke: red-team policy resistance', () => {
  it('denies unsafe or over-risk requests and requires confirmation for writes', async () => {
    const route = await loadRoute('../../services/trust-safety/policy-gate-service/src/routes.ts');
    const running = await startRouteServer(route);

    const cases = [
      {
        payload: {
          personaId: 'p1',
          userId: 'u1',
          tenantId: 't1',
          tool: 'unknown:exploit',
          action: 'run',
          riskClass: 'critical',
          traceId: 'trace-red-1'
        },
        expectedState: 'deny'
      },
      {
        payload: {
          personaId: 'p1',
          userId: 'u1',
          tenantId: 't1',
          tool: 'filesystem:write',
          action: 'write',
          riskClass: 'medium',
          traceId: 'trace-red-2'
        },
        expectedState: 'confirm'
      },
      {
        payload: {
          personaId: 'p1',
          userId: 'u1',
          tenantId: 't1',
          tool: 'persona:registry',
          action: 'write',
          riskClass: 'critical',
          traceId: 'trace-red-3'
        },
        expectedState: 'deny'
      }
    ];

    for (const testCase of cases) {
      const res = await postJson(`${running.url}/policy/check`, testCase.payload);
      expect(res.response.status).toBe(200);
      expect(res.body.state).toBe(testCase.expectedState);
    }

    await running.close();
  });
});
