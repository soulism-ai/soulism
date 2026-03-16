import { createHmac, createPrivateKey, generateKeyPairSync, sign as cryptoSign } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateSigningKeys } from '@soulism/persona-signing/keygen.js';
import { withStubbedFetch } from '../../../../../test/helpers/fetch.js';
import { withTempDir } from '../../../../../ci/smoke/helpers.js';

type RouteHandler = typeof import('../../src/routes.js').route;

const defaultEnv = {
  REQUIRE_AUTH: 'false',
  AUTH_MODE: 'api-key',
  API_KEY: '',
  AUTH_JWT_SECRET: '',
  AUTH_JWT_ISSUER: '',
  AUTH_JWT_AUDIENCE: '',
  AUTH_OPERATOR_ROLES: 'operator,admin,platform'
};

const encodeSegment = (value: unknown): string => Buffer.from(JSON.stringify(value)).toString('base64url');

const signJwt = (payload: Record<string, unknown>, secret: string): string => {
  const encodedHeader = encodeSegment({ alg: 'HS256', typ: 'JWT' });
  const encodedPayload = encodeSegment(payload);
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = createHmac('sha256', secret).update(signingInput).digest('base64url');
  return `${signingInput}.${signature}`;
};

const signRs256Jwt = (payload: Record<string, unknown>, privateKeyPem: string, kid: string): string => {
  const encodedHeader = encodeSegment({ alg: 'RS256', typ: 'JWT', kid });
  const encodedPayload = encodeSegment(payload);
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = cryptoSign('RSA-SHA256', Buffer.from(signingInput), createPrivateKey(privateKeyPem)).toString('base64url');
  return `${signingInput}.${signature}`;
};

const loadRoute = async (env: Record<string, string> = {}): Promise<RouteHandler> => {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries({ ...defaultEnv, ...env })) {
    previous.set(key, process.env[key]);
    process.env[key] = value;
  }

  try {
    const href = new URL('../../src/routes.ts', import.meta.url).href;
    const module = (await import(`${href}?test=${Date.now()}-${Math.random().toString(36).slice(2)}`)) as {
      route: RouteHandler;
    };
    return module.route;
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
};

const withRouteServer = async (
  env: Record<string, string>,
  run: (baseUrl: string) => Promise<void>
): Promise<void> => {
  const route = await loadRoute(env);
  const server: Server = createServer((req, res) => {
    void route(req, res);
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  try {
    await run(baseUrl);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
};

describe('api-gateway routes', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('serves health and ready endpoints without auth', async () => {
    await withRouteServer({}, async (baseUrl) => {
      await withStubbedFetch(
        [
          {
            match: /http:\/\/localhost:(3001|3002|3003|3004|4001|4002|4003)\/ready$/,
            response: { status: 200, body: { ok: true, ready: true } }
          }
        ],
        async () => {
          const health = await fetch(`${baseUrl}/health`);
          const ready = await fetch(`${baseUrl}/ready`);
          expect(health.status).toBe(200);
          expect(ready.status).toBe(200);
        }
      );
    });
  });

  it('fails readiness when a required downstream is unavailable', async () => {
    await withRouteServer({}, async (baseUrl) => {
      await withStubbedFetch(
        [
          {
            match: 'http://localhost:3002/ready',
            response: { status: 503, body: { ok: false, ready: false, reason: 'memory_unavailable' } }
          },
          {
            match: /http:\/\/localhost:(3001|3003|3004|4001|4002|4003)\/ready$/,
            response: { status: 200, body: { ok: true, ready: true } }
          }
        ],
        async () => {
          const ready = await fetch(`${baseUrl}/ready`);
          const body = (await ready.json()) as { ready: boolean; errors: string[] };
          expect(ready.status).toBe(503);
          expect(body.ready).toBe(false);
          expect(body.errors.some((entry) => entry.includes('memory'))).toBe(true);
        }
      );
    });
  });

  it('returns the authenticated principal from /auth/me for HS256 JWTs', async () => {
    const secret = 'gateway-secret';
    const token = signJwt(
      {
        sub: 'operator-1',
        tenantId: 'tenant-a',
        roles: ['operator'],
        iss: 'https://issuer.example',
        aud: 'control-plane',
        exp: Math.floor(Date.now() / 1000) + 60
      },
      secret
    );

    await withRouteServer(
      {
        REQUIRE_AUTH: 'true',
        AUTH_MODE: 'jwt',
        AUTH_JWT_SECRET: secret,
        AUTH_JWT_ISSUER: 'https://issuer.example',
        AUTH_JWT_AUDIENCE: 'control-plane'
      },
      async (baseUrl) => {
        const response = await fetch(`${baseUrl}/auth/me`, {
          headers: {
            authorization: `Bearer ${token}`
          }
        });
        const body = (await response.json()) as { subject: string; tenantId: string; roles: string[]; tokenType: string };
        expect(response.status).toBe(200);
        expect(body.subject).toBe('operator-1');
        expect(body.tenantId).toBe('tenant-a');
        expect(body.roles).toContain('operator');
        expect(body.tokenType).toBe('jwt');
      }
    );
  });

  it('accepts RS256 JWTs validated through JWKS discovery', async () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048
    });
    const kid = 'gateway-jwks-key';
    const token = signRs256Jwt(
      {
        sub: 'operator-jwks',
        tenantId: 'tenant-jwks',
        roles: ['operator'],
        iss: 'https://issuer.example',
        aud: 'control-plane',
        exp: Math.floor(Date.now() / 1000) + 60
      },
      privateKey.export({ format: 'pem', type: 'pkcs1' }).toString(),
      kid
    );

    await withRouteServer(
      {
        REQUIRE_AUTH: 'true',
        AUTH_MODE: 'jwt',
        AUTH_JWT_ISSUER: 'https://issuer.example',
        AUTH_JWT_AUDIENCE: 'control-plane',
        AUTH_JWT_JWKS_URL: 'https://issuer.example/.well-known/jwks.json'
      },
      async (baseUrl) => {
        await withStubbedFetch(
          [
            {
              match: 'https://issuer.example/.well-known/jwks.json',
              response: {
                status: 200,
                body: {
                  keys: [
                    {
                      ...(publicKey.export({ format: 'jwk' }) as Record<string, unknown>),
                      kid,
                      use: 'sig',
                      alg: 'RS256'
                    }
                  ]
                }
              }
            }
          ],
          async () => {
            const response = await fetch(`${baseUrl}/auth/me`, {
              headers: {
                authorization: `Bearer ${token}`
              }
            });
            const body = (await response.json()) as { subject: string; tenantId: string; roles: string[] };
            expect(response.status).toBe(200);
            expect(body.subject).toBe('operator-jwks');
            expect(body.tenantId).toBe('tenant-jwks');
            expect(body.roles).toContain('operator');
          }
        );
      }
    );
  });

  it('requires operator role for admin service status', async () => {
    const secret = 'gateway-secret';
    const token = signJwt(
      {
        sub: 'viewer-1',
        tenantId: 'tenant-a',
        roles: ['viewer'],
        iss: 'https://issuer.example',
        aud: 'control-plane',
        exp: Math.floor(Date.now() / 1000) + 60
      },
      secret
    );

    await withRouteServer(
      {
        REQUIRE_AUTH: 'true',
        AUTH_MODE: 'jwt',
        AUTH_JWT_SECRET: secret,
        AUTH_JWT_ISSUER: 'https://issuer.example',
        AUTH_JWT_AUDIENCE: 'control-plane'
      },
      async (baseUrl) => {
        const response = await fetch(`${baseUrl}/admin/services/policy/status`, {
          headers: {
            authorization: `Bearer ${token}`
          }
        });
        const body = (await response.json()) as { reasonCode: string };
        expect(response.status).toBe(403);
        expect(body.reasonCode).toBe('forbidden');
      }
    );
  });

  it('proxies admin service status through the gateway for operators', async () => {
    const secret = 'gateway-secret';
    const token = signJwt(
      {
        sub: 'operator-1',
        tenantId: 'tenant-a',
        roles: ['operator'],
        iss: 'https://issuer.example',
        aud: 'control-plane',
        exp: Math.floor(Date.now() / 1000) + 60
      },
      secret
    );

    await withRouteServer(
      {
        REQUIRE_AUTH: 'true',
        AUTH_MODE: 'jwt',
        AUTH_JWT_SECRET: secret,
        AUTH_JWT_ISSUER: 'https://issuer.example',
        AUTH_JWT_AUDIENCE: 'control-plane'
      },
      async (baseUrl) => {
        await withStubbedFetch(
          [
            {
              match: 'http://localhost:4001/health',
              response: { status: 200, body: { ok: true, service: 'policy-gate' } }
            },
            {
              match: 'http://localhost:4001/ready',
              response: {
                status: 200,
                body: { ok: true, ready: true, service: 'policy-gate', checks: [{ name: 'policy-engine', ok: true, required: true }] }
              }
            }
          ],
          async () => {
            const response = await fetch(`${baseUrl}/admin/services/policy/status`, {
              headers: {
                authorization: `Bearer ${token}`
              }
            });
            const body = (await response.json()) as { service: string; ready: boolean };
            expect(response.status).toBe(200);
            expect(body.service).toBe('policy-gate');
            expect(body.ready).toBe(true);
          }
        );
      }
    );
  });

  it('proxies admin service metrics through the gateway for operators', async () => {
    const secret = 'gateway-secret';
    const token = signJwt(
      {
        sub: 'operator-1',
        tenantId: 'tenant-a',
        roles: ['operator'],
        iss: 'https://issuer.example',
        aud: 'control-plane',
        exp: Math.floor(Date.now() / 1000) + 60
      },
      secret
    );

    await withRouteServer(
      {
        REQUIRE_AUTH: 'true',
        AUTH_MODE: 'jwt',
        AUTH_JWT_SECRET: secret,
        AUTH_JWT_ISSUER: 'https://issuer.example',
        AUTH_JWT_AUDIENCE: 'control-plane'
      },
      async (baseUrl) => {
        await withStubbedFetch(
          [
            {
              match: 'http://localhost:4001/metrics',
              response: {
                status: 200,
                body: {
                  service: 'policy-gate',
                  generatedAt: '2026-03-11T00:00:00.000Z',
                  totals: { requests: 7, errors: 1 },
                  errorRate: 0.14,
                  latency: { avgMs: 12, p50Ms: 10, p95Ms: 25, maxMs: 40 },
                  statusCounts: { '200': 6, '400': 1 },
                  metrics: { policy_gate_latency_p95_ms: 25 },
                  routes: [],
                  recentRequests: []
                }
              }
            }
          ],
          async () => {
            const response = await fetch(`${baseUrl}/admin/services/policy/metrics`, {
              headers: {
                authorization: `Bearer ${token}`
              }
            });
            const body = (await response.json()) as { service: string; totals: { requests: number } };
            expect(response.status).toBe(200);
            expect(body.service).toBe('policy-gate');
            expect(body.totals.requests).toBe(7);
          }
        );
      }
    );
  });

  it('reports signing posture through the operator admin endpoint', async () => {
    const secret = 'gateway-secret';
    const token = signJwt(
      {
        sub: 'operator-1',
        tenantId: 'tenant-a',
        roles: ['operator'],
        iss: 'https://issuer.example',
        aud: 'control-plane',
        exp: Math.floor(Date.now() / 1000) + 60
      },
      secret
    );
    const keys = generateSigningKeys();

    await withTempDir('gateway-signing', async (dir) => {
      const keyMapPath = join(dir, 'aws-keys.json');
      const publicKeyPath = join(dir, 'signing-public.pem');
      const kmsProvidersPolicyPath = join(dir, 'kms.providers.json');
      const signingRotationPolicyPath = join(dir, 'signing-rotation.policy.json');

      await writeFile(
        keyMapPath,
        JSON.stringify({
          'marketplace-key-1': {
            privateKey: keys.privateKey,
            publicKey: keys.publicKey
          }
        }),
        'utf8'
      );
      await writeFile(publicKeyPath, keys.publicKey, 'utf8');
      await writeFile(
        kmsProvidersPolicyPath,
        JSON.stringify({
          providers: {
            aws: { enabled: true, keyId: 'marketplace-key-1', allowMockInCi: false },
            gcp: { enabled: false, keyId: 'marketplace-key-1' },
            azure: { enabled: false, keyId: 'marketplace-key-1' }
          }
        }),
        'utf8'
      );
      await writeFile(
        signingRotationPolicyPath,
        JSON.stringify({
          rotationIntervalDays: 90,
          channels: {
            openai: {
              currentKeyId: 'marketplace-key-1',
              previousKeyId: 'marketplace-key-0',
              rotatedAt: '2026-02-15T00:00:00.000Z'
            }
          }
        }),
        'utf8'
      );

      await withRouteServer(
        {
          REQUIRE_AUTH: 'true',
          AUTH_MODE: 'jwt',
          AUTH_JWT_SECRET: secret,
          AUTH_JWT_ISSUER: 'https://issuer.example',
          AUTH_JWT_AUDIENCE: 'control-plane',
          PRODUCTION_MODE: 'true',
          STRICT_SIGNING: 'true',
          SIGNATURE_POLICY_MODE: 'enforced',
          SIGNING_PUBLIC_KEY_PATH: publicKeyPath,
          KMS_PROVIDERS_POLICY_PATH: kmsProvidersPolicyPath,
          SIGNING_ROTATION_POLICY_PATH: signingRotationPolicyPath,
          COGNITIVE_AI_KMS_AWS_KEYS_PATH: keyMapPath
        },
        async (baseUrl) => {
          const response = await fetch(`${baseUrl}/admin/signing/status`, {
            headers: {
              authorization: `Bearer ${token}`
            }
          });
          const body = (await response.json()) as {
            ready: boolean;
            mode: string;
            providers: Array<{ provider: string; mock: boolean }>;
            channels: Array<{ channel: string; providerCoverage: string[] }>;
          };

          expect(response.status).toBe(200);
          expect(body.ready).toBe(true);
          expect(body.mode).toBe('strict');
          expect(body.providers.find((provider) => provider.provider === 'aws')?.mock).toBe(false);
          expect(body.channels.find((channel) => channel.channel === 'openai')?.providerCoverage).toEqual(['aws']);
        }
      );
    });
  });

  it('overrides spoofed user and tenant fields before forwarding policy checks', async () => {
    const secret = 'gateway-secret';
    const token = signJwt(
      {
        sub: 'operator-1',
        tenantId: 'tenant-a',
        roles: ['operator'],
        iss: 'https://issuer.example',
        aud: 'control-plane',
        exp: Math.floor(Date.now() / 1000) + 60
      },
      secret
    );

    await withRouteServer(
      {
        REQUIRE_AUTH: 'true',
        AUTH_MODE: 'jwt',
        AUTH_JWT_SECRET: secret,
        AUTH_JWT_ISSUER: 'https://issuer.example',
        AUTH_JWT_AUDIENCE: 'control-plane'
      },
      async (baseUrl) => {
        const originalFetch = globalThis.fetch.bind(globalThis);
        const captured: { body?: Record<string, unknown>; headers?: Headers } = {};

        globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
          const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
          if (url === 'http://localhost:4001/policy/check') {
            captured.body = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
            captured.headers = new Headers(init?.headers);
            return new Response(
              JSON.stringify({
                state: 'allow',
                reasonCode: 'ok',
                reason: 'allowed',
                requirements: [],
                budgetSnapshot: {
                  remainingBudget: 5,
                  maxBudget: 5,
                  windowStart: '2026-03-11T00:00:00.000Z',
                  windowEnd: '2026-03-11T00:01:00.000Z'
                },
                personaId: captured.body.personaId,
                tool: captured.body.tool,
                riskClass: captured.body.riskClass,
                traceId: captured.body.traceId,
                policyVersion: 'v1',
                decisionId: 'decision-test',
                requiresConfirmation: false,
                schemaVersion: '1.0.0',
                issuedAt: '2026-03-11T00:00:00.000Z'
              }),
              {
                status: 200,
                headers: {
                  'content-type': 'application/json'
                }
              }
            );
          }
          return originalFetch(input, init);
        };

        try {
          const response = await fetch(`${baseUrl}/policy/check`, {
            method: 'POST',
            headers: {
              authorization: `Bearer ${token}`,
              'content-type': 'application/json'
            },
            body: JSON.stringify({
              personaId: 'default',
              userId: 'spoofed-user',
              tenantId: 'spoofed-tenant',
              tool: 'tool:webfetch',
              action: 'fetch',
              riskClass: 'low'
            })
          });

          expect(response.status).toBe(200);
          expect(captured.body?.userId).toBe('operator-1');
          expect(captured.body?.tenantId).toBe('tenant-a');
          expect(captured.headers?.get('x-user-id')).toBe('operator-1');
          expect(captured.headers?.get('x-tenant-id')).toBe('tenant-a');
          expect(captured.headers?.get('authorization')).toBeNull();
        } finally {
          globalThis.fetch = originalFetch;
        }
      }
    );
  });

  it('persists rate-limit buckets across route reloads', async () => {
    await withTempDir('api-gateway', async (dir) => {
      const env = {
        RATE_LIMIT_STORE_PATH: `${dir}/rate-limits.json`,
        RATE_MAX: '1',
        RATE_WINDOW_MS: '60000'
      };

      await withRouteServer(env, async (baseUrl) => {
        const first = await fetch(`${baseUrl}/auth/me`);
        expect(first.status).toBe(200);
      });

      await withRouteServer(env, async (baseUrl) => {
        const second = await fetch(`${baseUrl}/auth/me`);
        expect(second.status).toBe(429);
      });
    });
  });

  it('returns not_found for unknown routes', async () => {
    await withRouteServer({}, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/unknown-route`);
      expect(response.status).toBe(404);
    });
  });
});
