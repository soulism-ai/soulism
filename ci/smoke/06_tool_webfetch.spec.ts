import { readJsonBody, sendJson } from '@soulism/shared/http.js';
import { describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import type { Socket } from 'node:net';
import { withPatchedFetch, loadRoute, postJson, startRouteServer } from './helpers.js';

const withPolicyStub = async (state: 'allow' | 'confirm' | 'deny', reasonCode: string) => {
  const sockets = new Set<Socket>();
  const server = createServer(async (req, res) => {
    if (req.method !== 'POST' || req.url !== '/policy/check') {
      sendJson(res, 404, { error: 'not_found' });
      return;
    }

    const body = await readJsonBody(req);
    const traceId = String(body.traceId || `trace-${Date.now()}`);
    const payload = {
      state,
      reasonCode,
      requirements: [
        {
          type: 'policy',
          value: traceId,
          message: `policy-stub:${state}:${reasonCode}`
        }
      ],
      budgetSnapshot: {
        remainingBudget: 97,
        maxBudget: 100,
        windowStart: new Date().toISOString(),
        windowEnd: new Date(Date.now() + 60000).toISOString()
      },
      traceId
    };

    sendJson(res, 200, payload);
  });
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => {
      sockets.delete(socket);
    });
  });

  await new Promise<void>((resolve) => server.listen(0, () => resolve()));
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('policy_stub_bind_failed');
  }
  const policyStub = `http://127.0.0.1:${address.port}`;
  return {
    url: policyStub,
    close: async () => {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
        for (const socket of sockets) {
          socket.destroy();
        }
      });
    }
  };
};

describe('smoke: tool-webfetch preflight and egress contracts', () => {
  it('enforces allowlist + policy preflight and sanitizes responses', async () => {
    const policy = await withPolicyStub('allow', 'ok');
    const route = await loadRoute('../../services/mcp/tool-webfetch-service/src/routes.ts', {
      POLICY_SERVICE_URL: policy.url,
      TOOL_WEBFETCH_ALLOWLIST: 'allowed.example.local,openai.com',
      TOOL_WEBFETCH_MAX_BYTES: '64'
    });
    const webfetch = await startRouteServer(route);
    const allowPayload = 'A'.repeat(220);

    const originalFetch = globalThis.fetch;
    await withPatchedFetch(
      async (input, init) => {
        const url = String(input);
        if (url.startsWith('https://allowed.example.local')) {
          return new Response(allowPayload, {
            status: 200,
            headers: {
              'content-type': 'text/plain'
            }
          });
        }

        return (originalFetch as typeof fetch).call(globalThis, input as string, init);
      },
      async () => {
        const allowed = await postJson(`${webfetch.url}/webfetch`, {
          url: 'https://allowed.example.local/resource'
        });
        expect(allowed.response.status).toBe(200);
        expect(allowed.body.status).toBe(200);
        expect(allowed.body.ok).toBe(true);
        expect(allowed.body.url).toBe('https://allowed.example.local/resource');
        expect(allowed.body.contentType).toBe('text/plain');
        expect(typeof allowed.body.body).toBe('string');
        expect(allowed.body.body.length).toBeLessThanOrEqual(64);

        const blocked = await postJson(`${webfetch.url}/webfetch`, {
          url: 'https://disallowed.example.org/resource'
        });
        expect(blocked.response.status).toBe(403);
        expect(blocked.body.error).toBe('ssrf_blocked');

        const privateBlocked = await postJson(`${webfetch.url}/webfetch`, {
          url: 'http://localhost:3000/resource'
        });
        expect(privateBlocked.response.status).toBe(403);
        expect(privateBlocked.body.error).toBe('ssrf_blocked');
      }
    );

    await policy.close();
    await webfetch.close();
  });

  it('propagates policy confirm/deny states from precheck', async () => {
    const runningPolicy = await withPolicyStub('confirm', 'missing_signature');
    const route = await loadRoute('../../services/mcp/tool-webfetch-service/src/routes.ts', {
      POLICY_SERVICE_URL: runningPolicy.url,
      TOOL_WEBFETCH_ALLOWLIST: 'allowed.example.local'
    });
    const webfetch = await startRouteServer(route);

    const confirmResponse = await postJson(`${webfetch.url}/webfetch`, {
      url: 'https://allowed.example.local/resource'
    });
    expect(confirmResponse.response.status).toBe(403);
    expect(confirmResponse.body.state).toBe('confirm');
    expect(confirmResponse.body.error).toBe('confirmation_required');
    expect(confirmResponse.body.reasonCode).toBe('missing_signature');

    const denied = await withPolicyStub('deny', 'tool_not_in_policy');
    const deniedRoute = await loadRoute('../../services/mcp/tool-webfetch-service/src/routes.ts', {
      POLICY_SERVICE_URL: denied.url,
      TOOL_WEBFETCH_ALLOWLIST: 'allowed.example.local'
    });
    const deniedServer = await startRouteServer(deniedRoute);

    const deniedResponse = await postJson(`${deniedServer.url}/webfetch`, {
      url: 'https://allowed.example.local/resource'
    });
    expect(deniedResponse.response.status).toBe(403);
    expect(deniedResponse.body.state).toBe('deny');
    expect(deniedResponse.body.error).toBe('policy_denied');
    expect(deniedResponse.body.reasonCode).toBe('tool_not_in_policy');

    await Promise.all([runningPolicy.close(), denied.close(), webfetch.close(), deniedServer.close()]);
  });
});
