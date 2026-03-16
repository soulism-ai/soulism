import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { Socket } from 'node:net';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

type RouteHandler = (req: IncomingMessage, res: ServerResponse) => void | Promise<void>;

export interface RunningServer {
  url: string;
  close: () => Promise<void>;
}

export interface PolicyDecisionLike {
  state: 'allow' | 'confirm' | 'deny';
  reasonCode: string;
  reason?: string;
  requirements: Array<{ type: string; value?: string | number; message: string }>;
  budgetSnapshot: {
    remainingBudget: number;
    maxBudget: number;
    windowStart: string;
    windowEnd: string;
  };
  traceId: string;
}

export interface HttpResponse<T = unknown> {
  response: Response;
  body: T;
}

export type FetchPatch = (input: string, init?: RequestInit) => Promise<Response> | Response;

export const startRouteServer = async (route: RouteHandler): Promise<RunningServer> => {
  const sockets = new Set<Socket>();
  const server = createServer((req, res) => {
    Promise.resolve(route(req, res)).catch((error) => {
      res.statusCode = 500;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ error: String(error) }));
    });
  });
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => {
      sockets.delete(socket);
    });
  });

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('failed_to_bind_test_server');
  }

  return {
    url: `http://127.0.0.1:${address.port}`,
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

let stateRootPromise: Promise<string> | null = null;

const ensureStateRoot = async (): Promise<string> => {
  if (!stateRootPromise) {
    stateRootPromise = mkdtemp(join(tmpdir(), 'soulism-state-'));
  }
  return stateRootPromise;
};

const defaultStoreEnv = async (relativeModulePath: string): Promise<Record<string, string>> => {
  const root = await ensureStateRoot();
  const slug = relativeModulePath.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '');

  if (relativeModulePath.includes('/memory-service/')) {
    return { MEMORY_STORE_PATH: join(root, `${slug}.json`) };
  }
  if (relativeModulePath.includes('/risk-budget-service/')) {
    return { RISK_BUDGET_STORE_PATH: join(root, `${slug}.json`) };
  }
  if (relativeModulePath.includes('/audit-ledger-service/')) {
    return { AUDIT_STORE_PATH: join(root, `${slug}.json`) };
  }
  if (relativeModulePath.includes('/api-gateway/')) {
    return { RATE_LIMIT_STORE_PATH: join(root, `${slug}.json`) };
  }
  return {};
};

export const loadRoute = async (
  relativeModulePath: string,
  env: Record<string, string> = {}
): Promise<RouteHandler> => {
  const mergedEnv = {
    ...(await defaultStoreEnv(relativeModulePath)),
    ...env
  };
  for (const [key, value] of Object.entries(mergedEnv)) {
    process.env[key] = value;
  }
  const href = new URL(relativeModulePath, import.meta.url).href;
  const cacheBust = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const module = (await import(`${href}?ts=${cacheBust}`)) as {
    route: RouteHandler;
  };
  return module.route;
};

export const getJson = async <T = unknown>(url: string, init: RequestInit = {}): Promise<HttpResponse<T>> => {
  const response = await fetch(url, init);
  const body = (await response.json().catch(() => ({}))) as T;
  return { response, body };
};

export const postJson = async <T = unknown>(url: string, payload: unknown, init: RequestInit = {}): Promise<HttpResponse<T>> => {
  return getJson<T>(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(init.headers || {}) },
    body: JSON.stringify(payload),
    ...init
  });
};

export const delJson = async <T = unknown>(url: string, init: RequestInit = {}): Promise<HttpResponse<T>> => {
  return getJson<T>(url, {
    method: 'DELETE',
    ...init
  });
};

export const withTempDir = async <T>(name: string, fn: (dir: string) => Promise<T>): Promise<T> => {
  const dir = await mkdtemp(join(tmpdir(), `${name}-`));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};

export const writePersonaPack = async (
  dir: string,
  fileName: string,
  id: string,
  overrides: Record<string, unknown> = {}
): Promise<void> => {
  const pack = {
    id,
    version: '1.0.0',
    schemaVersion: '1.0.0',
    persona: {
      id,
      name: `Persona ${id}`,
      description: `Persona ${id} description`,
      systemPrompt: `System prompt for ${id}`,
      userPromptTemplate: `User prompt for ${id}`,
      extends: [],
      traits: [],
      allowedTools: [],
      deniedTools: [],
      style: { tone: 'neutral', constraints: [], examples: [] },
      riskClass: 'low',
      metadata: {}
    },
    provenance: {
      source: 'test',
      createdAt: Date.now()
    },
    ...overrides
  };
  await writeFile(join(dir, fileName), JSON.stringify(pack, null, 2), 'utf8');
};

export const assertPolicyDecision = (
  decision: Record<string, unknown> | PolicyDecisionLike,
  expected: {
    state?: PolicyDecisionLike['state'];
    reasonCode?: string;
    mustHaveRequirements?: number;
    minRemainingBudget?: number;
    traceId?: string;
  }
): void => {
  if (!decision || typeof decision !== 'object') {
    throw new Error('policy_decision_not_an_object');
  }
  const state = decision.state;
  const reasonCode = decision.reasonCode;
  const traceId = decision.traceId;
  const requirements = decision.requirements;
  const budgetSnapshot = decision.budgetSnapshot;

  if (!['allow', 'confirm', 'deny'].includes(String(state))) {
    throw new Error(`policy_decision_invalid_state:${String(state)}`);
  }
  if (expected.state && state !== expected.state) {
    throw new Error(`policy_decision_state_mismatch:${String(state)}:${expected.state}`);
  }
  if (expected.reasonCode && reasonCode !== expected.reasonCode) {
    throw new Error(`policy_decision_reason_mismatch:${String(reasonCode)}:${expected.reasonCode}`);
  }
  if (expected.traceId && traceId !== expected.traceId) {
    throw new Error(`policy_decision_trace_mismatch:${String(traceId)}:${expected.traceId}`);
  }
  if (!Array.isArray(requirements)) {
    throw new Error('policy_decision_requirements_missing');
  }
  if (expected.mustHaveRequirements !== undefined && requirements.length < expected.mustHaveRequirements) {
    throw new Error(`policy_decision_requirements_too_few:${requirements.length}:${expected.mustHaveRequirements}`);
  }

  if (!budgetSnapshot || typeof budgetSnapshot !== 'object') {
    throw new Error('policy_decision_budget_snapshot_missing');
  }
  const budget = budgetSnapshot as Record<string, unknown>;
  const remainingBudget = budget.remainingBudget;
  if (!Number.isFinite(Number(remainingBudget))) {
    throw new Error('policy_decision_remaining_budget_invalid');
  }
  if (expected.minRemainingBudget !== undefined && Number(remainingBudget) < expected.minRemainingBudget) {
    throw new Error(`policy_decision_remaining_budget_too_low:${remainingBudget}:${expected.minRemainingBudget}`);
  }
  if (typeof budget.maxBudget !== 'number' || budget.maxBudget <= 0) {
    throw new Error('policy_decision_max_budget_invalid');
  }
  if (typeof budget.windowStart !== 'string' || typeof budget.windowEnd !== 'string') {
    throw new Error('policy_decision_budget_window_missing');
  }
};

export const normalizeFetchUrl = (input: string | URL | Request): string => {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  if (typeof (input as Request)?.url === 'string') return (input as Request).url;
  return String(input);
};

export const withPatchedFetch = async <T>(route: FetchPatch, run: () => Promise<T>): Promise<T> => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (input: string | URL | Request, init?: RequestInit) => {
    const url = normalizeFetchUrl(input);
    return route(url, init) as Response | Promise<Response>;
  };

  try {
    return await run();
  } finally {
    globalThis.fetch = originalFetch;
  }
};
