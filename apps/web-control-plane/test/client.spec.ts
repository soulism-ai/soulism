import { afterEach, describe, expect, it, vi } from 'vitest';
import { ControlPlaneClient } from '../src/api/client';

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json'
    }
  });

const fetchUrl = (input: string | URL | Request): string =>
  typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

const fetchHeaders = (init?: RequestInit): Headers => new Headers(init?.headers);

describe('ControlPlaneClient', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends the bearer token to /auth/me and returns the session identity', async () => {
    const client = new ControlPlaneClient({
      gatewayServiceUrl: 'http://gateway.test',
      authToken: 'operator-token'
    });

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = fetchUrl(input);
      if (url === 'http://gateway.test/auth/me') {
        expect(fetchHeaders(init).get('authorization')).toBe('Bearer operator-token');
        return jsonResponse({
          authenticated: true,
          subject: 'operator-1',
          tenantId: 'tenant-a',
          roles: ['operator'],
          tokenType: 'jwt'
        });
      }
      throw new Error(`unexpected_fetch:${url}`);
    });

    const identity = await client.authMe();
    expect(identity.subject).toBe('operator-1');
    expect(identity.tenantId).toBe('tenant-a');
    expect(identity.roles).toContain('operator');
  });

  it('accepts degraded health reports from the gateway admin endpoint', async () => {
    const client = new ControlPlaneClient({
      gatewayServiceUrl: 'http://gateway.test',
      authToken: 'operator-token'
    });

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = fetchUrl(input);
      if (url === 'http://gateway.test/admin/services/gateway/status') {
        return jsonResponse(
          {
            service: 'api-gateway',
            ok: true,
            ready: false,
            errors: ['memory: dependency_reported_not_ready'],
            checks: [{ name: 'memory', ok: false, required: true }]
          },
          503
        );
      }
      throw new Error(`unexpected_fetch:${url}`);
    });

    const report = await client.health('gateway');
    expect(report.ok).toBe(true);
    expect(report.ready).toBe(false);
    expect(report.errors).toContain('memory: dependency_reported_not_ready');
  });

  it('fetches service metrics through the gateway admin endpoint', async () => {
    const client = new ControlPlaneClient({
      gatewayServiceUrl: 'http://gateway.test',
      authToken: 'operator-token'
    });

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = fetchUrl(input);
      if (url === 'http://gateway.test/admin/services/gateway/metrics') {
        return jsonResponse({
          service: 'api-gateway',
          generatedAt: '2026-03-11T00:00:00.000Z',
          totals: { requests: 12, errors: 1 },
          errorRate: 0.08,
          latency: { avgMs: 15, p50Ms: 11, p95Ms: 30, maxMs: 44 },
          statusCounts: { '200': 11, '503': 1 },
          metrics: { api_gateway_latency_p95_ms: 30 },
          routes: [],
          recentRequests: []
        });
      }
      throw new Error(`unexpected_fetch:${url}`);
    });

    const metrics = await client.metrics('gateway');
    expect(metrics.service).toBe('api-gateway');
    expect(metrics.latency.p95Ms).toBe(30);
  });

  it('fetches signing posture through the gateway admin endpoint', async () => {
    const client = new ControlPlaneClient({
      gatewayServiceUrl: 'http://gateway.test',
      authToken: 'operator-token'
    });

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = fetchUrl(input);
      if (url === 'http://gateway.test/admin/signing/status') {
        return jsonResponse({
          mode: 'strict',
          productionMode: true,
          strictSigning: true,
          publicKeyConfigured: true,
          publicKeySource: 'path',
          providers: [
            {
              provider: 'aws',
              enabled: true,
              keyId: 'marketplace-key-1',
              ready: true,
              mock: false,
              source: 'aws:file_json',
              allowMockInCi: false,
              publicKeyPresent: true
            }
          ],
          channels: [
            {
              channel: 'openai',
              currentKeyId: 'marketplace-key-1',
              previousKeyId: 'marketplace-key-0',
              rotatedAt: '2026-02-15T00:00:00.000Z',
              ageDays: 24,
              rotationIntervalDays: 90,
              overdue: false,
              providerCoverage: ['aws']
            }
          ],
          issues: [],
          ready: true,
          generatedAt: '2026-03-11T00:00:00.000Z',
          policyPaths: {
            kmsProviders: '/repo/ci/policies/kms.providers.json',
            rotation: '/repo/ci/policies/signing-rotation.policy.json'
          }
        });
      }
      throw new Error(`unexpected_fetch:${url}`);
    });

    const status = await client.signingStatus();
    expect(status.ready).toBe(true);
    expect(status.providers[0]?.provider).toBe('aws');
    expect(status.channels[0]?.channel).toBe('openai');
  });

  it('normalizes budget arrays returned through the gateway', async () => {
    const client = new ControlPlaneClient({
      gatewayServiceUrl: 'http://gateway.test',
      authToken: 'operator-token'
    });

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = fetchUrl(input);
      if (url === 'http://gateway.test/budgets') {
        return jsonResponse([
          {
            key: 'tenant:user:persona:tool',
            remainingBudget: 2,
            maxBudget: 3,
            windowStart: '2026-03-11T00:00:00.000Z',
            windowEnd: '2026-03-11T00:01:00.000Z'
          }
        ]);
      }
      throw new Error(`unexpected_fetch:${url}`);
    });

    const budgets = await client.budgets();
    expect(budgets.budgets).toHaveLength(1);
    expect(budgets.budgets?.[0]?.key).toBe('tenant:user:persona:tool');
  });
});
