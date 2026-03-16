import { afterEach, describe, expect, it, vi } from 'vitest';

const { cookieStore, cookiesMock } = vi.hoisted(() => {
  const store = {
    set: vi.fn(),
    delete: vi.fn()
  };

  return {
    cookieStore: store,
    cookiesMock: vi.fn(async () => store)
  };
});

vi.mock('next/headers', () => ({
  cookies: cookiesMock
}));

import { DELETE, POST } from '../app/api/session/route';

const envKeys = [
  'COGNITIVE_API_GATEWAY_URL',
  'CONTROL_PLANE_AUTH_USERNAME',
  'CONTROL_PLANE_AUTH_PASSWORD',
  'CONTROL_PLANE_AUTH_SUBJECT',
  'CONTROL_PLANE_AUTH_TENANT_ID',
  'CONTROL_PLANE_AUTH_ROLES',
  'CONTROL_PLANE_JWT_ISSUER',
  'CONTROL_PLANE_JWT_AUDIENCE',
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

describe('control-plane session route', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    cookieStore.set.mockReset();
    cookieStore.delete.mockReset();
    cookiesMock.mockClear();
    restoreEnv();
  });

  it('issues and stores a validated operator session token', async () => {
    process.env.COGNITIVE_API_GATEWAY_URL = 'http://gateway.test';
    process.env.CONTROL_PLANE_AUTH_USERNAME = 'ops';
    process.env.CONTROL_PLANE_AUTH_PASSWORD = 'super-secret';
    process.env.CONTROL_PLANE_AUTH_SUBJECT = 'operator-1';
    process.env.CONTROL_PLANE_AUTH_TENANT_ID = 'tenant-a';
    process.env.CONTROL_PLANE_AUTH_ROLES = 'operator,admin';
    process.env.CONTROL_PLANE_JWT_ISSUER = 'https://issuer.example';
    process.env.CONTROL_PLANE_JWT_SECRET = 'gateway-secret';

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          authenticated: true,
          subject: 'operator-1',
          tenantId: 'tenant-a',
          roles: ['operator', 'admin'],
          tokenType: 'jwt'
        }),
        {
          status: 200,
          headers: {
            'content-type': 'application/json'
          }
        }
      )
    );

    const response = await POST(
      new Request('https://control-plane.test/api/session', {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          username: 'ops',
          password: 'super-secret',
          includeToken: true
        })
      })
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { ok: boolean; authenticated: boolean; token?: string };
    expect(body.ok).toBe(true);
    expect(body.authenticated).toBe(true);
    expect(typeof body.token).toBe('string');
    expect(cookieStore.set).toHaveBeenCalledTimes(1);
    expect(cookieStore.set.mock.calls[0]?.[0]).toBe('cognitive_ai_access_token');
    expect(cookieStore.set.mock.calls[0]?.[1]).toBe(body.token);

    const [input, init] = fetchSpy.mock.calls[0] ?? [];
    expect(String(input)).toBe('http://gateway.test/auth/me');
    expect(new Headers(init?.headers).get('authorization')).toBe(`Bearer ${body.token}`);
  });

  it('returns a direct-session token without persisting a cookie when requested', async () => {
    process.env.COGNITIVE_API_GATEWAY_URL = 'http://gateway.test';
    process.env.CONTROL_PLANE_AUTH_USERNAME = 'ops';
    process.env.CONTROL_PLANE_AUTH_PASSWORD = 'super-secret';
    process.env.CONTROL_PLANE_JWT_ISSUER = 'https://issuer.example';
    process.env.CONTROL_PLANE_JWT_SECRET = 'gateway-secret';

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ authenticated: true }), {
        status: 200,
        headers: {
          'content-type': 'application/json'
        }
      })
    );

    const response = await POST(
      new Request('https://control-plane.test/api/session', {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          username: 'ops',
          password: 'super-secret',
          includeToken: true,
          persistCookie: false
        })
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      authenticated: true
    });
    expect(cookieStore.set).not.toHaveBeenCalled();
    expect(cookieStore.delete).toHaveBeenCalledWith('cognitive_ai_access_token');
  });

  it('rejects invalid credentials before storing a cookie', async () => {
    process.env.COGNITIVE_API_GATEWAY_URL = 'http://gateway.test';
    process.env.CONTROL_PLANE_AUTH_USERNAME = 'ops';
    process.env.CONTROL_PLANE_AUTH_PASSWORD = 'super-secret';
    process.env.CONTROL_PLANE_JWT_ISSUER = 'https://issuer.example';
    process.env.CONTROL_PLANE_JWT_SECRET = 'gateway-secret';

    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const response = await POST(
      new Request('https://control-plane.test/api/session', {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          username: 'ops',
          password: 'wrong-secret',
          includeToken: true
        })
      })
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      reasonCode: 'session_auth_invalid_credentials'
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(cookieStore.set).not.toHaveBeenCalled();
  });

  it('stores a validated manual bearer token', async () => {
    process.env.COGNITIVE_API_GATEWAY_URL = 'http://gateway.test';

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ authenticated: true }), {
        status: 200,
        headers: {
          'content-type': 'application/json'
        }
      })
    );

    const response = await POST(
      new Request('https://control-plane.test/api/session', {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          token: 'manual-operator-token'
        })
      })
    );

    expect(response.status).toBe(200);
    expect(cookieStore.set).toHaveBeenCalledWith(
      'cognitive_ai_access_token',
      'manual-operator-token',
      expect.objectContaining({
        httpOnly: true,
        sameSite: 'strict'
      })
    );
  });

  it('clears the session cookie on delete', async () => {
    const response = await DELETE(new Request('https://control-plane.test/api/session', { method: 'DELETE' }));

    expect(response.status).toBe(200);
    expect(cookieStore.delete).toHaveBeenCalledWith('cognitive_ai_access_token');
  });
});
