import { randomUUID } from 'node:crypto';
import { resolveSoulismConfig, type ResolveConfigInput } from './config.js';
import {
  buildPolicyRequest,
  formatBudget,
  renderResult,
  type SoulismRunResult,
  type PolicyBudgetSnapshot,
  type PolicyDecision,
  type PolicyRequirement
} from './ui.js';

type PersonaRecord = {
  id: string;
  name?: string;
  description?: string;
};

type PersonaListResponse = {
  personas?: PersonaRecord[];
};

type RiskClass = 'low' | 'medium' | 'high' | 'critical';

type ToolChoice = 'tool:webfetch' | 'memory:write' | 'memory:read' | 'filesystem:read' | 'filesystem:write';

type ToolContext = {
  personaId: string;
  userId: string;
  tenantId: string;
  traceId: string;
  tool: ToolChoice;
  confirm: boolean;
  confirmMode: boolean;
  toolServiceUrl: string;
};

type PolicyPayload = {
  state?: 'allow' | 'confirm' | 'deny';
  reasonCode?: string;
  reason?: string;
  requirements?: PolicyRequirement[];
  budgetSnapshot?: PolicyBudgetSnapshot;
  traceId?: string;
  policyVersion?: string;
  decisionId?: string;
  schemaVersion?: string;
  issuedAt?: string;
  requestedPolicyUrl?: string;
};

const parseRiskClass = (value: string | undefined, fallback: RiskClass): RiskClass => {
  if (value === 'low' || value === 'medium' || value === 'high' || value === 'critical') return value;
  return fallback;
};

const readJson = async <T>(response: Response): Promise<T | null> => {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
};

const defaultBudgetSnapshot = (): PolicyBudgetSnapshot => {
  const now = new Date().toISOString();
  return {
    remainingBudget: 0,
    maxBudget: 0,
    windowStart: now,
    windowEnd: now
  };
};

const normalizePolicyDecision = (payload: unknown, fallbackTraceId: string): PolicyDecision => {
  const raw = typeof payload === 'object' && payload ? (payload as Record<string, unknown>) : {};
  const requirements = Array.isArray(raw.requirements) ? (raw.requirements.filter(
    (entry): entry is PolicyRequirement =>
      Boolean(entry) && typeof entry === 'object' && typeof (entry as Record<string, unknown>).type === 'string'
  )) : [];
  return {
    state: raw.state === 'allow' || raw.state === 'confirm' || raw.state === 'deny' ? (raw.state as PolicyDecision['state']) : 'deny',
    reasonCode: typeof raw.reasonCode === 'string' ? raw.reasonCode : 'policy_unavailable',
    reason: typeof raw.reason === 'string' ? raw.reason : undefined,
    requirements,
    budgetSnapshot:
      raw.budgetSnapshot && typeof raw.budgetSnapshot === 'object'
        ? {
            remainingBudget: Number((raw.budgetSnapshot as Record<string, unknown>).remainingBudget) || 0,
            maxBudget: Number((raw.budgetSnapshot as Record<string, unknown>).maxBudget) || 0,
            windowStart:
              typeof (raw.budgetSnapshot as Record<string, unknown>).windowStart === 'string'
                ? String((raw.budgetSnapshot as Record<string, unknown>).windowStart)
                : new Date().toISOString(),
            windowEnd:
              typeof (raw.budgetSnapshot as Record<string, unknown>).windowEnd === 'string'
                ? String((raw.budgetSnapshot as Record<string, unknown>).windowEnd)
                : new Date().toISOString()
          }
        : defaultBudgetSnapshot(),
    traceId: typeof raw.traceId === 'string' ? raw.traceId : fallbackTraceId,
    policyVersion: typeof raw.policyVersion === 'string' ? raw.policyVersion : 'v1',
    decisionId: typeof raw.decisionId === 'string' ? raw.decisionId : `decision-${Date.now()}`,
    schemaVersion: typeof raw.schemaVersion === 'string' ? raw.schemaVersion : '1.0.0',
    issuedAt:
      typeof raw.issuedAt === 'string'
        ? raw.issuedAt
        : new Date().toISOString(),
    requestedPolicyUrl: typeof raw.requestedPolicyUrl === 'string' ? raw.requestedPolicyUrl : undefined
  };
};

const toToolResult = (tool: string, status: number, ok: boolean, contentType: string, body: string, url: string): SoulismRunResult['tool'] => ({
  status,
  ok,
  contentType,
  body,
  url
});

const callWebfetchTool = async (context: ToolContext, targetUrl: string, method = 'GET'): Promise<SoulismRunResult['tool']> => {
  const response = await fetch(`${context.toolServiceUrl}/webfetch`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-persona-id': context.personaId,
      'x-user-id': context.userId,
      'x-tenant-id': context.tenantId,
      'x-trace-id': context.traceId,
      'x-policy-confirmed': context.confirm ? 'true' : 'false'
    },
    body: JSON.stringify({
      url: targetUrl,
      method
    })
  });

  const toolBody = (await readJson<{
    body?: string;
    status?: number;
    ok?: boolean;
    contentType?: string;
  }>(response)) ?? {};

  const rawBody = toolBody.body;
  return toToolResult(
    'tool:webfetch',
    response.status,
    response.ok,
    toolBody.contentType ?? response.headers.get('content-type') ?? 'text/plain',
    typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody ?? ''),
    targetUrl
  );
};

const callMemoryWriteTool = async (
  context: ToolContext,
  payload: { scope?: string; value: string; ttlMs?: number }
): Promise<SoulismRunResult['tool']> => {
  const response = await fetch(`${context.toolServiceUrl}/memory/write`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-persona-id': context.personaId,
      'x-user-id': context.userId,
      'x-tenant-id': context.tenantId,
      'x-trace-id': context.traceId,
      'x-risk-class': 'medium',
      'x-policy-confirmed': context.confirm ? 'true' : 'false'
    },
    body: JSON.stringify({
      scope: payload.scope ?? 'session',
      ttlMs: payload.ttlMs ?? 86_400_000,
      value: parseValue(payload.value)
    })
  });

  const toolBody = (await readJson<Record<string, unknown>>(response)) ?? {};
  return toToolResult(
    'memory:write',
    response.status,
    response.ok,
    response.headers.get('content-type') ?? 'application/json',
    JSON.stringify(toolBody),
    '/memory/write'
  );
};

const callMemoryReadTool = async (
  context: ToolContext,
  payload: { scope?: string }
): Promise<SoulismRunResult['tool']> => {
  const endpoint = `${context.toolServiceUrl}/memory/list?scope=${encodeURIComponent(payload.scope ?? 'session')}`;
  const response = await fetch(endpoint, {
    method: 'GET',
    headers: {
      'x-persona-id': context.personaId,
      'x-user-id': context.userId,
      'x-tenant-id': context.tenantId,
      'x-trace-id': context.traceId,
      'x-risk-class': 'low',
      'x-policy-confirmed': context.confirm ? 'true' : 'false'
    }
  });

  const toolBody = (await readJson<Record<string, unknown>>(response)) ?? {};
  return toToolResult(
    'memory:read',
    response.status,
    response.ok,
    response.headers.get('content-type') ?? 'application/json',
    JSON.stringify(toolBody),
    endpoint
  );
};

const callFilesTool = async (
  context: ToolContext,
  payload: { path: string; content?: string; method: 'read' | 'write' }
): Promise<SoulismRunResult['tool']> => {
  const endpoint = payload.method === 'read' ? '/files/read' : '/files/write';
  const response = await fetch(`${context.toolServiceUrl}${endpoint}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-persona-id': context.personaId,
      'x-user-id': context.userId,
      'x-tenant-id': context.tenantId,
      'x-trace-id': context.traceId,
      'x-policy-confirmed': context.confirm ? 'true' : 'false'
    },
    body: JSON.stringify({
      path: payload.path,
      content: payload.content ?? ''
    })
  });

  const toolBody = (await readJson<Record<string, unknown>>(response)) ?? {};
  return toToolResult(
    payload.method,
    response.status,
    response.ok,
    response.headers.get('content-type') ?? 'application/json',
    JSON.stringify(toolBody),
    `${context.toolServiceUrl}${endpoint}`
  );
};

const parseValue = (input: string): unknown => {
  try {
    return JSON.parse(input);
  } catch {
    return input;
  }
};

const resolveToolExecutor = (tool: ToolChoice, context: ToolContext, params: SoulismParams): Promise<SoulismRunResult['tool']> => {
  if (tool === 'tool:webfetch') {
    return callWebfetchTool(context, params.targetUrl ?? 'https://example.com', params.httpMethod ?? 'GET');
  }

  if (tool === 'memory:write') {
    return callMemoryWriteTool(context, {
      scope: params.memoryScope ?? 'session',
      ttlMs: params.memoryTtlMs,
      value: params.memoryValue ?? '{}'
    });
  }

  if (tool === 'memory:read') {
    return callMemoryReadTool(context, { scope: params.memoryScope ?? 'session' });
  }

  return callFilesTool(context, {
    path: params.filePath ?? '/session.txt',
    content: params.fileContent,
    method: tool === 'filesystem:write' ? 'write' : 'read'
  });
};

export interface SoulismParams {
  targetUrl?: string;
  personaId?: string;
  userId?: string;
  tenantId?: string;
  tool?: ToolChoice;
  action?: string;
  riskClass?: RiskClass;
  confirm?: boolean;
  confirmMode?: boolean;
  config?: ResolveConfigInput;
  httpMethod?: string;
  memoryScope?: string;
  memoryValue?: string;
  memoryTtlMs?: number;
  filePath?: string;
  fileContent?: string;
}

export const runSoulismFlow = async (params: SoulismParams = {}): Promise<SoulismRunResult> => {
  const config = resolveSoulismConfig(params.config);
  const policyTraceId = randomUUID();
  const userId = params.userId ?? 'cli-user';
  const tenantId = params.tenantId ?? 'default';
  const selectedTool = params.tool ?? 'tool:webfetch';
  const riskClass: RiskClass = parseRiskClass(params.riskClass, 'medium');
  const confirm = params.confirm === true;
  const confirmMode = params.confirmMode === true;
  const policyTool: ToolChoice = selectedTool;
  const policyAction = params.action ?? 'fetch';

  const personaResponse = await fetch(`${config.personaRegistryUrl}/personas`, {
    headers: {
      'x-trace-id': policyTraceId,
      'content-type': 'application/json'
    }
  });
  const personaPayload = (await readJson<PersonaListResponse>(personaResponse)) ?? {};
  const personas = personaPayload.personas ?? [];
  const selectedPersonaId = params.personaId ?? personas[0]?.id ?? 'default';
  const selectedPersona = personas.find((entry) => entry.id === selectedPersonaId) ?? null;

  const policyRequest = buildPolicyRequest({
    personaId: selectedPersonaId,
    userId,
    tenantId,
    tool: policyTool,
    action: policyAction,
    riskClass,
    traceId: policyTraceId
  });

  const policyResponse = await fetch(`${config.policyServiceUrl}/policy/check`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-trace-id': policyTraceId
    },
    body: JSON.stringify(policyRequest)
  });
  const policyPayload = (await readJson<PolicyPayload>(policyResponse)) ?? {};
  const policy = normalizePolicyDecision(policyPayload, policyTraceId);

  if (policy.state !== 'allow' && (!confirmMode || !confirm)) {
    return {
      traceId: policyTraceId,
      personaId: selectedPersonaId,
      persona: selectedPersona ? { id: selectedPersona.id, name: selectedPersona.name, description: selectedPersona.description } : null,
      policy,
      confirmed: policy.state === 'confirm',
      tool: toToolResult(
        selectedTool,
        403,
        false,
        'application/json',
        JSON.stringify({
          state: policy.state,
          reasonCode: policy.reasonCode,
          reason: policy.reason,
          requirements: policy.requirements,
          budget: policy.budgetSnapshot,
          blockedBy: policy.state === 'confirm' ? 'requires-confirmation' : 'policy-deny',
          budgetDisplay: formatBudget(policy.budgetSnapshot)
        }),
        config.webfetchServiceUrl
      )
    };
  }

  const toolServiceUrl = policyTool === 'tool:webfetch'
    ? config.webfetchServiceUrl
    : policyTool === 'memory:write' || policyTool === 'memory:read'
      ? config.memoryServiceUrl ?? config.webfetchServiceUrl
      : config.filesServiceUrl ?? config.webfetchServiceUrl;

  const toolContext: ToolContext = {
    personaId: selectedPersonaId,
    userId,
    tenantId,
    traceId: policyTraceId,
    tool: policyTool,
    confirm: policy.state === 'confirm' ? confirm : false,
    confirmMode,
    toolServiceUrl
  };

  const tool = await resolveToolExecutor(policyTool, toolContext, params);
  return {
    traceId: policyTraceId,
    personaId: selectedPersonaId,
    persona: selectedPersona ? { id: selectedPersona.id, name: selectedPersona.name, description: selectedPersona.description } : null,
    policy: {
      ...policy,
      state: policy.state
    },
    confirmed: policy.state === 'confirm',
    tool
  };
};

const hasArg = (name: string): boolean => process.argv.includes(`--${name}`);

const cliArg = (name: string): string | undefined => {
  const found = process.argv.find((candidate) => candidate.startsWith(`--${name}=`));
  return found ? found.split('=').slice(1).join('=') : undefined;
};

const cliInt = (name: string, fallback: number): number => {
  const value = cliArg(name);
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
};

if (process.argv[1] && (process.argv[1].endsWith('index.ts') || process.argv[1].endsWith('index.js'))) {
  runSoulismFlow({
    targetUrl: cliArg('target'),
    personaId: cliArg('persona'),
    userId: cliArg('user'),
    tenantId: cliArg('tenant'),
    tool: (cliArg('tool') as ToolChoice | undefined) ?? 'tool:webfetch',
    riskClass: parseRiskClass(cliArg('risk') as RiskClass | undefined, 'medium'),
    action: cliArg('action'),
    confirmMode: hasArg('confirm-mode'),
    confirm: hasArg('confirm'),
    httpMethod: cliArg('method') ?? 'GET',
    memoryScope: cliArg('scope'),
    memoryValue: cliArg('value'),
    memoryTtlMs: cliInt('ttlMs', 86_400_000),
    filePath: cliArg('file'),
    fileContent: cliArg('content')
  })
    .then((result) => {
      console.log(renderResult(result));
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
