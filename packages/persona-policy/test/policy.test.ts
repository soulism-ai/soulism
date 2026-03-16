import { describe, expect, it } from 'vitest';
import { evaluatePolicy } from '../src/policy.js';
import { makeBudget } from '../src/budgets.js';
import { ToolScope } from '../src/scopes.js';

describe('persona-policy', () => {
  it('evaluates allow/confirm/deny decisions and budget depletion', () => {
    let remaining = 2;
    const context = {
      policyVersion: 'v1',
      rules: [
        {
          id: 'webfetch-allow',
          scope: ToolScope.WebFetch,
          riskClassMax: 'high' as const,
          requireSignature: false,
          requiresConfirmation: false,
          isEnabled: true
        },
        {
          id: 'memory-write-confirm',
          scope: ToolScope.MemoryWrite,
          riskClassMax: 'high' as const,
          requireSignature: true,
          requiresConfirmation: true,
          isEnabled: true
        }
      ],
      budget: () => {
        const b = makeBudget(2, 'low');
        b.remaining = remaining;
        remaining = Math.max(remaining - 1, 0);
        return { remaining: b.remaining, max: b.max, windowStartedAt: b.windowStartedAt, windowEnd: b.windowStartedAt + b.windowMs };
      }
    };

    const allow = evaluatePolicy(
      { personaId: 'p', userId: 'u', tenantId: 't', tool: ToolScope.WebFetch, action: 'fetch', riskClass: 'low', traceId: 'a' },
      context as any
    );
    expect(allow.state).toBe('allow');

    const confirm = evaluatePolicy(
      { personaId: 'p', userId: 'u', tenantId: 't', tool: ToolScope.MemoryWrite, action: 'write', riskClass: 'low', traceId: 'b' },
      context as any
    );
    expect(confirm.state).toBe('confirm');

    const deny = evaluatePolicy(
      { personaId: 'p', userId: 'u', tenantId: 't', tool: ToolScope.WebFetch, action: 'fetch', riskClass: 'low', traceId: 'c' },
      context as any
    );
    expect(deny.state).toBe('deny');
  });
});
