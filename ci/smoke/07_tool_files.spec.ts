import { describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import { readJsonBody, sendJson } from '@soulism/shared/http.js';
import { getJson, loadRoute, postJson, startRouteServer, withTempDir } from './helpers.js';

type PolicyState = 'allow' | 'confirm' | 'deny';

interface PolicyDecisionResponse {
  state: PolicyState;
  reasonCode: string;
  requirements: Array<{ type: string; value?: string; message: string }>;
  budgetSnapshot: {
    remainingBudget: number;
    maxBudget: number;
    windowStart: string;
    windowEnd: string;
  };
  traceId: string;
  error?: string;
}

interface FileResponse {
  ok?: boolean;
  deleted?: string;
  content?: string;
  error?: string;
  state?: PolicyState;
}

const policyStub = async (state: 'allow' | 'confirm' | 'deny', reasonCode = 'ok') => {
  const server = createServer(async (req, res) => {
    if (req.method !== 'POST' || req.url !== '/policy/check') {
      sendJson(res, 404, { error: 'not_found' });
      return;
    }

    const body = await readJsonBody(req);
    const traceId = String(body.traceId || `trace-${Date.now()}`);
    sendJson(res, 200, {
      state,
      reasonCode,
      requirements:
        reasonCode === 'ok'
          ? []
          : [
              {
                type: 'policy',
                value: traceId,
                message: `test-policy-${state}-${reasonCode}`
              }
            ],
      budgetSnapshot: {
        remainingBudget: 97,
        maxBudget: 100,
        windowStart: new Date().toISOString(),
        windowEnd: new Date(Date.now() + 60000).toISOString()
      },
      traceId
    });
  });

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('policy_stub_bind_failed');
  const url = `http://127.0.0.1:${addr.port}`;
  return {
    url,
    close: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  };
};

describe('smoke: tool-files boundary and policy preflight', () => {
  it('blocks traversal/mime, enforces policy, and supports delete by scope/path', async () => {
    await withTempDir('tool-files-smoke', async (dir) => {
      const allowPolicy = await policyStub('allow', 'ok');
      const filesRoute = await loadRoute('../../services/mcp/tool-files-service/src/routes.ts', {
        POLICY_SERVICE_URL: allowPolicy.url,
        TOOL_FILES_ROOT: dir,
        TOOL_FILES_EXTENSIONS: '.txt,.md,.json',
        TOOL_FILES_OVERWRITE: 'false'
      });
      const files = await startRouteServer(filesRoute);

      const deniedPolicy = await policyStub('deny', 'tool_not_in_policy');
      const denyRoute = await loadRoute('../../services/mcp/tool-files-service/src/routes.ts', {
        POLICY_SERVICE_URL: deniedPolicy.url,
        TOOL_FILES_ROOT: dir,
        TOOL_FILES_EXTENSIONS: '.txt,.md,.json'
      });
      const denied = await startRouteServer(denyRoute);

      const confirmPolicy = await policyStub('confirm', 'missing_signature');
      const confirmRoute = await loadRoute('../../services/mcp/tool-files-service/src/routes.ts', {
        POLICY_SERVICE_URL: confirmPolicy.url,
        TOOL_FILES_ROOT: dir,
        TOOL_FILES_EXTENSIONS: '.txt,.md,.json'
      });
      const confirm = await startRouteServer(confirmRoute);

      const writeAllowed = await postJson<FileResponse>(
        `${files.url}/files/write`,
        { path: 'notes/hello.txt', content: 'hello' },
        {
          headers: {
            'x-persona-id': 'persona-1',
            'x-user-id': 'user-1',
            'x-tenant-id': 'tenant-1'
          }
        }
      );
      expect(writeAllowed.response.status).toBe(200);

      const readAllowed = await postJson<FileResponse>(`${files.url}/files/read`, { path: 'notes/hello.txt' }, {
        headers: {
          'x-persona-id': 'persona-1',
          'x-user-id': 'user-1',
          'x-tenant-id': 'tenant-1'
        }
      });
      expect(readAllowed.response.status).toBe(200);
      expect(readAllowed.body.content).toBe('hello');

      const blockedTraversal = await postJson<FileResponse>(`${files.url}/files/read`, { path: '../etc/passwd' }, {
        headers: {
          'x-persona-id': 'persona-1',
          'x-user-id': 'user-1',
          'x-tenant-id': 'tenant-1'
        }
      });
      expect(blockedTraversal.response.status).toBe(403);
      expect(blockedTraversal.body.error).toBe('path_escape');

      const blockedMime = await postJson<FileResponse>(
        `${files.url}/files/write`,
        { path: 'notes/binary.exe', content: 'x' },
        {
          headers: {
            'x-persona-id': 'persona-1',
            'x-user-id': 'user-1',
            'x-tenant-id': 'tenant-1'
          }
        }
      );
      expect(blockedMime.response.status).toBe(403);
      expect(blockedMime.body.error).toBe('path_or_mime_denied');

      const overwriteBlocked = await postJson<FileResponse>(`${files.url}/files/write`, { path: 'notes/hello.txt', content: 'world' }, {
        headers: {
          'x-persona-id': 'persona-1',
          'x-user-id': 'user-1',
          'x-tenant-id': 'tenant-1'
        }
      });
      expect(overwriteBlocked.response.status).toBe(409);

      const confirmRequired = await postJson<PolicyDecisionResponse>(`${confirm.url}/files/write`, { path: 'notes/confirm.txt', content: 'need-confirm' }, {
        headers: {
          'x-persona-id': 'persona-1',
          'x-user-id': 'user-1',
          'x-tenant-id': 'tenant-1',
          'x-trace-id': 'need-confirm'
        }
      });
      expect(confirmRequired.response.status).toBe(403);
      expect(confirmRequired.body.state).toBe('confirm');
      expect(confirmRequired.body.error).toBe('confirmation_required');

      const confirmWrite = await postJson<FileResponse>(
        `${confirm.url}/files/write`,
        { path: 'notes/confirm.txt', content: 'need-confirm' },
        {
          headers: {
            'x-persona-id': 'persona-1',
            'x-user-id': 'user-1',
            'x-tenant-id': 'tenant-1',
            'x-trace-id': 'need-confirm',
            'x-policy-confirmed': 'true'
          }
        }
      );
      expect(confirmWrite.response.status).toBe(200);

      const denyRead = await postJson<PolicyDecisionResponse>(`${denied.url}/files/read`, { path: 'notes/confirm.txt' }, {
        headers: {
          'x-persona-id': 'persona-1',
          'x-user-id': 'user-1',
          'x-tenant-id': 'tenant-1',
          'x-trace-id': 'deny'
        }
      });
      expect(denyRead.response.status).toBe(403);
      expect(denyRead.body.state).toBe('deny');
      expect(denyRead.body.error).toBe('policy_denied');

      const deleteDenied = await getJson<FileResponse>(`${denied.url}/files/confirm.txt`, {
        method: 'DELETE',
        headers: {
          'x-persona-id': 'persona-1',
          'x-user-id': 'user-1',
          'x-tenant-id': 'tenant-1',
          'x-trace-id': 'deny'
        }
      });
      expect(deleteDenied.response.status).toBe(403);

      const deleteSuccess = await getJson<FileResponse>(`${files.url}/files/confirm.txt`, {
        method: 'DELETE',
        headers: {
          'x-persona-id': 'persona-1',
          'x-user-id': 'user-1',
          'x-tenant-id': 'tenant-1'
        }
      });
      expect(deleteSuccess.response.status).toBe(200);
      expect(deleteSuccess.body.ok).toBe(true);
      expect(deleteSuccess.body.deleted).toBe('confirm.txt');

      const deletedRead = await postJson<FileResponse>(`${files.url}/files/read`, { path: 'notes/confirm.txt' }, {
        headers: {
          'x-persona-id': 'persona-1',
          'x-user-id': 'user-1',
          'x-tenant-id': 'tenant-1'
        }
      });
      expect(deletedRead.response.status).toBe(404);

      const otherUserRead = await postJson<FileResponse>(`${files.url}/files/read`, { path: 'notes/hello.txt' }, {
        headers: {
          'x-persona-id': 'persona-1',
          'x-user-id': 'user-2',
          'x-tenant-id': 'tenant-1',
          'x-trace-id': 'tenant-scope'
        }
      });
      expect(otherUserRead.response.status).toBe(200);

      await Promise.all([allowPolicy.close(), deniedPolicy.close(), confirmPolicy.close(), files.close(), denied.close(), confirm.close()]);
    });
  });
});
