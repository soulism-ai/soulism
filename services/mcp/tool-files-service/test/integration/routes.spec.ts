import { createServer, type Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withStubbedFetch } from '../../../../../test/helpers/fetch.js';
import { route } from '../../src/routes.js';

describe('tool-files-service routes', () => {
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

  it('blocks path traversal attempt on read', async () => {
    const response = await fetch(`${baseUrl}/files/read`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-user-id': 'u1',
        'x-tenant-id': 't1',
        'x-persona-id': 'p1'
      },
      body: JSON.stringify({ path: '../../../etc/passwd' })
    });
    expect(response.status).toBe(403);
  });
});
