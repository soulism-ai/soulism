import { describe, expect, it } from 'vitest';
import { assertPolicyDecision, loadRoute, postJson, startRouteServer } from './helpers.js';

describe('smoke: policy matrix', () => {
  type PolicyTestCase = {
    label: string;
    request: {
      personaId: string;
      userId: string;
      tenantId: string;
      tool: string;
      action: string;
      riskClass: 'low' | 'medium' | 'high' | 'critical';
      traceId: string;
    };
    expected: {
      state: 'allow' | 'confirm' | 'deny';
      reasonCode: string;
      minRequirements: number;
      minRemainingBudget?: number;
    };
  };

  const cases: PolicyTestCase[] = [
    {
      label: 'persona registry read at low risk should allow',
      request: {
        personaId: 'p-allow',
        userId: 'u-allow',
        tenantId: 't-allow',
        tool: 'persona:registry',
        action: 'read',
        riskClass: 'low',
        traceId: 'policy-001'
      },
      expected: {
        state: 'allow',
        reasonCode: 'ok',
        minRequirements: 0
      }
    },
    {
      label: 'persona registry read at critical risk should still allow (tool max is high)',
      request: {
        personaId: 'p-allow',
        userId: 'u-allow',
        tenantId: 't-allow',
        tool: 'persona:registry',
        action: 'read',
        riskClass: 'critical',
        traceId: 'policy-002'
      },
      expected: {
        state: 'allow',
        reasonCode: 'ok',
        minRequirements: 0
      }
    },
    {
      label: 'memory write is confirm by rule',
      request: {
        personaId: 'p-memory',
        userId: 'u-memory',
        tenantId: 't-memory',
        tool: 'memory:write',
        action: 'write',
        riskClass: 'low',
        traceId: 'policy-003'
      },
      expected: {
        state: 'confirm',
        reasonCode: 'missing_signature',
        minRequirements: 1,
        minRemainingBudget: 97
      }
    },
    {
      label: 'filesystem write is confirm by rule',
      request: {
        personaId: 'p-files',
        userId: 'u-files',
        tenantId: 't-files',
        tool: 'filesystem:write',
        action: 'write',
        riskClass: 'low',
        traceId: 'policy-004'
      },
      expected: {
        state: 'confirm',
        reasonCode: 'missing_signature',
        minRequirements: 1,
        minRemainingBudget: 97
      }
    },
    {
      label: 'unknown tool should deny as not in policy',
      request: {
        personaId: 'p-unknown',
        userId: 'u-unknown',
        tenantId: 't-unknown',
        tool: 'filesystem:delete',
        action: 'delete',
        riskClass: 'low',
        traceId: 'policy-005'
      },
      expected: {
        state: 'deny',
        reasonCode: 'tool_not_in_policy',
        minRequirements: 1
      }
    },
    {
      label: 'risk class escalation beyond policy limit is denied',
      request: {
        personaId: 'p-risk',
        userId: 'u-risk',
        tenantId: 't-risk',
        tool: 'memory:write',
        action: 'write',
        riskClass: 'critical',
        traceId: 'policy-006'
      },
      expected: {
        state: 'deny',
        reasonCode: 'tool_not_in_policy',
        minRequirements: 1
      }
    },
    {
      label: 'webfetch read should allow under medium risk',
      request: {
        personaId: 'p-fetch',
        userId: 'u-fetch',
        tenantId: 't-fetch',
        tool: 'tool:webfetch',
        action: 'fetch',
        riskClass: 'medium',
        traceId: 'policy-007'
      },
      expected: {
        state: 'allow',
        reasonCode: 'ok',
        minRequirements: 0
      }
    },
    {
      label: 'webfetch should deny when tool rule is missing',
      request: {
        personaId: 'p-fetch',
        userId: 'u-fetch',
        tenantId: 't-fetch',
        tool: 'tool:webfetch',
        action: 'fetch',
        riskClass: 'critical',
        traceId: 'policy-008'
      },
      expected: {
        state: 'deny',
        reasonCode: 'tool_not_in_policy',
        minRequirements: 1
      }
    },
    {
      label: 'memory read explicitly requires no deny path in this policy',
      request: {
        personaId: 'p-read',
        userId: 'u-read',
        tenantId: 't-read',
        tool: 'memory:read',
        action: 'read',
        riskClass: 'low',
        traceId: 'policy-009'
      },
      expected: {
        state: 'allow',
        reasonCode: 'ok',
        minRequirements: 0
      }
    },
    {
      label: 'filesystem read should allow under policy',
      request: {
        personaId: 'p-fs-read',
        userId: 'u-fs-read',
        tenantId: 't-fs-read',
        tool: 'filesystem:read',
        action: 'read',
        riskClass: 'low',
        traceId: 'policy-010'
      },
      expected: {
        state: 'allow',
        reasonCode: 'ok',
        minRequirements: 0
      }
    }
  ];

  it('returns allow/confirm/deny decisions with budgeted traces', async () => {
    const route = await loadRoute('../../services/trust-safety/policy-gate-service/src/routes.ts');
    const running = await startRouteServer(route);
    const seenTraceIds = new Set<string>();

    for (const testCase of cases) {
      const response = await postJson(`${running.url}/policy/check`, testCase.request);
      expect(response.response.status).toBe(200);
      expect(response.body).toBeTruthy();
      expect(testCase.request.traceId).not.toBeUndefined();
      expect(seenTraceIds.has(testCase.request.traceId)).toBe(false);
      expect(response.body.reason).toBeDefined();
      expect(response.body.traceId).toBe(testCase.request.traceId);

      assertPolicyDecision(response.body as Record<string, unknown>, {
        state: testCase.expected.state,
        reasonCode: testCase.expected.reasonCode,
        mustHaveRequirements: testCase.expected.minRequirements,
        minRemainingBudget: testCase.expected.minRemainingBudget
      });
      if (typeof response.body.budgetSnapshot !== 'object' || response.body.budgetSnapshot === null) {
        throw new Error(`budgetSnapshot_missing_for_${testCase.request.traceId}`);
      }
      expect(response.body.budgetSnapshot.maxBudget).toBeGreaterThan(0);
      expect(response.body.budgetSnapshot.remainingBudget).toBeGreaterThanOrEqual(0);
      expect(response.body.policyVersion).toBe('v1');
      expect(response.body.tool).toBe(testCase.request.tool);
      expect(response.body.riskClass).toBe(testCase.request.riskClass);
      seenTraceIds.add(testCase.request.traceId);
    }

    const repeat = await postJson(`${running.url}/policy/check`, cases[2].request);
    expect(repeat.response.status).toBe(200);
    expect(repeat.body.state).toBe('confirm');
    expect(repeat.body.reasonCode).toBe('missing_signature');
    expect(repeat.body.budgetSnapshot.remainingBudget).toBeLessThan(cases[2].expected.minRemainingBudget ?? 97);

    await running.close();
  });
});
