import { createServer, type Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { route } from '../../src/routes.js';

describe('persona-registry-service routes', () => {
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

  it('lists personas endpoint response shape', async () => {
    const response = await fetch(`${baseUrl}/personas`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { personas: unknown[] };
    expect(Array.isArray(body.personas)).toBe(true);
  });
});

