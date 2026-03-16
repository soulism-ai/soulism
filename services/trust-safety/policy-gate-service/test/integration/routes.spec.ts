import { createServer, type Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { route } from '../../src/routes.js';

describe('policy-gate-service routes', () => {
  let server: Server;
  let baseUrl = '';

  beforeAll(async () => {
    server = createServer((req, res) => {
      void route(req, res);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  });

  it('serves health and ready endpoints', async () => {
    const health = await fetch(`${baseUrl}/health`);
    const ready = await fetch(`${baseUrl}/ready`);
    expect(health.status).toBe(200);
    expect(ready.status).toBe(200);
  });

  it('evaluates policy decision state for valid requests', async () => {
    const response = await fetch(`${baseUrl}/policy/check`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        personaId: 'p1',
        userId: 'u1',
        tenantId: 't1',
        tool: 'tool:webfetch',
        action: 'fetch',
        riskClass: 'low',
        traceId: 'policy-int-test'
      })
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as { state: string; traceId: string };
    expect(['allow', 'confirm', 'deny']).toContain(body.state);
    expect(body.traceId).toBe('policy-int-test');
  });
});
