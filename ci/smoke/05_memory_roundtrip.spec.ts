import { describe, expect, it } from 'vitest';
import { delJson, getJson, loadRoute, postJson, startRouteServer } from './helpers.js';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('smoke: memory roundtrip', () => {
  it('supports policy-confirmed writes, scope isolation, delete-by-id, and expiry cleanup', async () => {
    const shortTtlMs = 25;
    const expiryWaitMs = 50;
    const policyRoute = await loadRoute('../../services/trust-safety/policy-gate-service/src/routes.ts');
    const policy = await startRouteServer(policyRoute);

    const memoryRoute = await loadRoute('../../services/mcp/memory-service/src/routes.ts', {
      POLICY_SERVICE_URL: policy.url
    });
    const memory = await startRouteServer(memoryRoute);

    const sessionWrite = await postJson(
      `${memory.url}/memory/write`,
      { scope: 'session', value: { note: 'hello' }, ttlMs: 60000 },
      {
        headers: {
          'x-persona-id': 'persona-1',
          'x-user-id': 'user-1',
          'x-tenant-id': 'tenant-1',
          'x-policy-confirmed': 'true'
        }
      }
    );
    expect(sessionWrite.response.status).toBe(200);

    const globalWrite = await postJson(
      `${memory.url}/memory/write`,
      { scope: 'global', value: { note: 'global' }, ttlMs: 60000 },
      {
        headers: {
          'x-persona-id': 'persona-1',
          'x-user-id': 'user-1',
          'x-tenant-id': 'tenant-1',
          'x-policy-confirmed': 'true'
        }
      }
    );
    expect(globalWrite.response.status).toBe(200);

    const shortLived = await postJson(
      `${memory.url}/memory/write`,
      { scope: 'session', value: { note: 'short' }, ttlMs: shortTtlMs },
      {
        headers: {
          'x-persona-id': 'persona-1',
          'x-user-id': 'user-1',
          'x-tenant-id': 'tenant-1',
          'x-policy-confirmed': 'true'
        }
      }
    );
    expect(shortLived.response.status).toBe(200);

    const preDeleteNoConfirm = await postJson(
      `${memory.url}/memory/write`,
      { scope: 'session', value: { note: 'must confirm' }, ttlMs: 60000 },
      {
        headers: {
          'x-persona-id': 'persona-1',
          'x-user-id': 'user-1',
          'x-tenant-id': 'tenant-1'
        }
      }
    );
    expect(preDeleteNoConfirm.response.status).toBe(403);
    expect(preDeleteNoConfirm.body.state).toBe('confirm');
    expect(preDeleteNoConfirm.body.error).toBe('confirmation_required');

    const sessionListBefore = await getJson(`${memory.url}/memory/list?scope=session`, {
      headers: {
        'x-persona-id': 'persona-1',
        'x-user-id': 'user-1',
        'x-tenant-id': 'tenant-1'
      }
    });
    expect(sessionListBefore.response.status).toBe(200);
    expect(Array.isArray(sessionListBefore.body.items)).toBe(true);
    expect(sessionListBefore.body.items.length).toBeGreaterThanOrEqual(2);

    const globalList = await getJson(`${memory.url}/memory/list?scope=global`, {
      headers: {
        'x-persona-id': 'persona-1',
        'x-user-id': 'user-1',
        'x-tenant-id': 'tenant-1'
      }
    });
    expect(globalList.response.status).toBe(200);
    expect(globalList.body.items.some((entry: { id: string }) => entry.id === globalWrite.body.id)).toBe(true);

    const otherUserList = await getJson(`${memory.url}/memory/list?scope=session`, {
      headers: {
        'x-persona-id': 'persona-1',
        'x-user-id': 'user-2',
        'x-tenant-id': 'tenant-1'
      }
    });
    expect(otherUserList.response.status).toBe(200);
    expect(otherUserList.body.items.length).toBe(0);

    await wait(expiryWaitMs);
    const sessionListAfter = await getJson(`${memory.url}/memory/list?scope=session`, {
      headers: {
        'x-persona-id': 'persona-1',
        'x-user-id': 'user-1',
        'x-tenant-id': 'tenant-1'
      }
    });
    expect(sessionListAfter.response.status).toBe(200);
    expect(sessionListAfter.body.items.some((entry: { id: string }) => entry.id === shortLived.body.id)).toBe(false);

    const removeByUser2 = await delJson(`${memory.url}/memory/${globalWrite.body.id}`, {
      headers: {
        'x-persona-id': 'persona-1',
        'x-user-id': 'user-2',
        'x-tenant-id': 'tenant-1',
        'x-policy-confirmed': 'true'
      }
    });
    expect(removeByUser2.response.status).toBe(404);

    const removeSession = await delJson(`${memory.url}/memory/${sessionWrite.body.id}`, {
      headers: {
        'x-persona-id': 'persona-1',
        'x-user-id': 'user-1',
        'x-tenant-id': 'tenant-1',
        'x-policy-confirmed': 'true'
      }
    });
    expect(removeSession.response.status).toBe(200);

    const removeGlobal = await delJson(`${memory.url}/memory/${globalWrite.body.id}`, {
      headers: {
        'x-persona-id': 'persona-1',
        'x-user-id': 'user-1',
        'x-tenant-id': 'tenant-1',
        'x-policy-confirmed': 'true'
      }
    });
    expect(removeGlobal.response.status).toBe(200);

    await memory.close();
    await policy.close();
  });
});
