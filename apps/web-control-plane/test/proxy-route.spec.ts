import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET, POST } from '../app/api/[...slug]/route';

const originalGatewayUrl = process.env.COGNITIVE_API_GATEWAY_URL;

describe('control-plane gateway proxy route', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    if (originalGatewayUrl === undefined) {
      delete process.env.COGNITIVE_API_GATEWAY_URL;
      return;
    }
    process.env.COGNITIVE_API_GATEWAY_URL = originalGatewayUrl;
  });

  it('forwards same-origin GET requests to the configured gateway upstream', async () => {
    process.env.COGNITIVE_API_GATEWAY_URL = 'http://gateway.test/';

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ authenticated: false }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
          'content-length': '24'
        }
      })
    );

    const response = await GET(
      new Request('https://control-plane.test/api/auth/me?view=full', {
        headers: {
          authorization: 'Bearer operator-token',
          'x-trace-id': 'trace-123'
        }
      })
    );

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [input, init] = fetchSpy.mock.calls[0] ?? [];
    expect(String(input)).toBe('http://gateway.test/auth/me?view=full');
    const headers = new Headers(init?.headers);
    expect(init?.method).toBe('GET');
    expect(headers.get('authorization')).toBe('Bearer operator-token');
    expect(headers.get('host')).toBeNull();
    expect(response.status).toBe(200);
    expect(response.headers.get('content-length')).toBeNull();
    await expect(response.json()).resolves.toEqual({ authenticated: false });
  });

  it('forwards request bodies for mutating calls', async () => {
    process.env.COGNITIVE_API_GATEWAY_URL = 'http://gateway.test';

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 202,
        headers: {
          'content-type': 'application/json'
        }
      })
    );

    const requestBody = JSON.stringify({ personaId: 'operator', action: 'read' });
    const response = await POST(
      new Request('https://control-plane.test/api/policy/check', {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: requestBody
      })
    );

    const [, init] = fetchSpy.mock.calls[0] ?? [];
    expect(init?.method).toBe('POST');
    expect(Buffer.from(init?.body as ArrayBuffer).toString('utf8')).toBe(requestBody);
    expect(response.status).toBe(202);
  });

  it('uses the server-side session cookie when no authorization header is supplied', async () => {
    process.env.COGNITIVE_API_GATEWAY_URL = 'http://gateway.test';

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ authenticated: true }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
          'set-cookie': 'upstream=should-not-forward'
        }
      })
    );

    const response = await GET(
      new Request('https://control-plane.test/api/auth/me', {
        headers: {
          cookie: 'cognitive_ai_access_token=operator-token'
        }
      })
    );

    const [, init] = fetchSpy.mock.calls[0] ?? [];
    const headers = new Headers(init?.headers);
    expect(headers.get('authorization')).toBe('Bearer operator-token');
    expect(headers.get('cookie')).toBeNull();
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('returns a 500 response when the upstream is not configured', async () => {
    delete process.env.COGNITIVE_API_GATEWAY_URL;

    const response = await GET(new Request('https://control-plane.test/api/auth/me'));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      reasonCode: 'gateway_upstream_missing'
    });
  });
});
