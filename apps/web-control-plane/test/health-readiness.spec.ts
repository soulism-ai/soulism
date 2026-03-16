import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET as healthGet, HEAD as healthHead } from '../app/health/route';
import { GET as readyGet, HEAD as readyHead } from '../app/ready/route';

const envKeys = [
  'COGNITIVE_API_GATEWAY_URL',
  'CONTROL_PLANE_REQUIRE_SESSION_ISSUER',
  'CONTROL_PLANE_AUTH_USERNAME',
  'CONTROL_PLANE_AUTH_PASSWORD',
  'CONTROL_PLANE_JWT_ISSUER',
  'CONTROL_PLANE_JWT_SECRET',
  'CONTROL_PLANE_JWT_PRIVATE_KEY',
  'CONTROL_PLANE_JWT_PRIVATE_KEY_PATH',
  'CONTROL_PLANE_JWT_ALGORITHM'
] as const;

const originalEnv = new Map(envKeys.map((key) => [key, process.env[key]]));

const restoreEnv = () => {
  for (const key of envKeys) {
    const previous = originalEnv.get(key);
    if (previous === undefined) {
      delete process.env[key];
      continue;
    }
    process.env[key] = previous;
  }
};

describe('web control plane health and readiness routes', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    restoreEnv();
  });

  it('reports session issuer as disabled when not configured', async () => {
    const response = await healthGet();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      service: 'web-control-plane',
      ok: true,
      ready: true,
      sessionIssuer: {
        enabled: false,
        ready: true,
        required: false
      }
    });
  });

  it('fails readiness when server-issued auth is required but not configured', async () => {
    process.env.COGNITIVE_API_GATEWAY_URL = 'http://gateway.test';
    process.env.CONTROL_PLANE_REQUIRE_SESSION_ISSUER = 'true';

    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const response = await readyGet();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      ready: false,
      sessionIssuer: {
        required: true,
        ready: false
      }
    });
    expect(fetchSpy).not.toHaveBeenCalled();

    const headResponse = await readyHead();
    expect(headResponse.status).toBe(503);
  });

  it('passes readiness when the gateway and required session issuer are configured', async () => {
    process.env.COGNITIVE_API_GATEWAY_URL = 'http://gateway.test';
    process.env.CONTROL_PLANE_REQUIRE_SESSION_ISSUER = 'true';
    process.env.CONTROL_PLANE_AUTH_USERNAME = 'ops';
    process.env.CONTROL_PLANE_AUTH_PASSWORD = 'super-secret';
    process.env.CONTROL_PLANE_JWT_ISSUER = 'https://issuer.example';
    process.env.CONTROL_PLANE_JWT_SECRET = 'gateway-secret';

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true, ready: true }), {
        status: 200,
        headers: {
          'content-type': 'application/json'
        }
      })
    );

    const response = await readyGet();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ready: true,
      sessionIssuer: {
        required: true,
        ready: true,
        algorithm: 'HS256'
      }
    });

    const headResponse = await readyHead();
    expect(headResponse.status).toBe(200);
  });

  it('returns a healthy HEAD response for /health', async () => {
    const response = await healthHead();
    expect(response.status).toBe(200);
  });
});
