import { createServer, type Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withStubbedFetch } from '../../../../../test/helpers/fetch.js';
import { route } from '../../src/routes.js';

describe('tool-webfetch-service routes', () => {
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
    await withStubbedFetch(
      [
        {
          match: 'http://localhost:4001/ready',
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

  it('blocks private-address webfetch requests', async () => {
    const response = await fetch(`${baseUrl}/webfetch`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: 'http://127.0.0.1' })
    });
    expect(response.status).toBe(403);
  });
});
