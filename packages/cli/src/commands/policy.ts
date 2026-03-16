import { readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { PolicyRequest, PolicyDecision, PolicyState } from '@soulism/persona-policy/decision.js';
import { ToolScope, RiskClass } from '@soulism/persona-policy/scopes.js';
import { PolicyReasonCode, normalizeBudgetSnapshot } from '@soulism/shared/contracts.js';

export type PolicyCheckOptions = {
  endpoint?: string;
  input?: string;
  timeoutMs?: string;
  expectState?: string;
  outputMode?: string;
  allowConfirm?: string;
  requireBudget?: string;
  requireRequirements?: string;
};

export type PolicyDecisionState = PolicyState;
export type PolicyCheckExitCode = 0 | 1 | 2 | 3 | 4;

type PolicyDecisionResponse = Omit<PolicyDecision, 'requirements'> & {
  requirements: Array<{ type: string; message: string; value?: string | number }>;
};

const validToolScope = (value: string): value is PolicyRequest['tool'] => {
  return Object.values(ToolScope).includes(value as PolicyRequest['tool']);
};

const validRiskClass = (value: string): value is PolicyRequest['riskClass'] => {
  return Object.values(RiskClass).includes(value as PolicyRequest['riskClass']);
};

const validReasonCode = (value: string): value is PolicyDecision['reasonCode'] => {
  return Object.values(PolicyReasonCode).includes(value as PolicyDecision['reasonCode']);
};

const validState = (value: string | undefined): value is PolicyDecisionState => {
  return value === 'allow' || value === 'confirm' || value === 'deny';
};

const normalizeTimeout = (value: string | undefined): number => {
  if (!value) return 5_000;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 5_000;
  return Math.min(parsed, 60_000);
};

const parseRequireBoolean = (value: string | undefined): boolean => {
  if (!value) return false;
  const normalized = value.toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'y';
};

const parsePolicyCheckPayload = (input: string): unknown => {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error('policy request body is empty');
  }

  try {
    return JSON.parse(trimmed);
  } catch (error) {
    throw new Error(`invalid policy request JSON: ${String(error)}`);
  }
};

const ensurePolicyRequestShape = (value: unknown): PolicyRequest => {
  if (!value || typeof value !== 'object') {
    throw new Error('policy request must be an object');
  }
  const request = value as Record<string, unknown>;
  const required = ['personaId', 'userId', 'tenantId', 'tool', 'action', 'riskClass'];
  for (const key of required) {
    if (!request[key]) {
      throw new Error(`policy request missing required field: ${key}`);
    }
  }

  const riskClass = String(request.riskClass);
  if (!validRiskClass(riskClass)) {
    throw new Error(`invalid riskClass: ${riskClass}`);
  }
  const tool = String(request.tool);
  if (!validToolScope(tool)) {
    throw new Error(`invalid tool: ${tool}`);
  }

  return {
    personaId: String(request.personaId),
    userId: String(request.userId),
    tenantId: String(request.tenantId),
    tool,
    action: String(request.action),
    riskClass,
    payload: typeof request.payload === 'object' && request.payload !== null ? (request.payload as Record<string, unknown>) : undefined,
    traceId: request.traceId ? String(request.traceId) : `cli-${Date.now()}`
  };
};

const readPolicyInput = (policyRequestArg: string | undefined, inputPath: string | undefined): string => {
  if (inputPath) {
    const absolute = isAbsolute(inputPath) ? inputPath : resolve(process.cwd(), inputPath);
    return readFileSync(absolute, 'utf8');
  }

  if (policyRequestArg) {
    try {
      const absolute = resolve(process.cwd(), policyRequestArg);
      return readFileSync(absolute, 'utf8');
    } catch {
      // Treat the token itself as inline JSON when it is not a readable file path.
      const trimmed = policyRequestArg.trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    }
  }

  return readFileSync(0, 'utf8');
};

const normalizePolicyRequirement = (entry: unknown): { type: string; message: string; value?: string | number } => {
  if (!entry || typeof entry !== 'object') {
    return { type: 'unknown', message: '' };
  }
  const value = entry as { type?: unknown; message?: unknown; value?: unknown };
  return {
    type: typeof value.type === 'string' ? value.type : 'unknown',
    message: typeof value.message === 'string' ? value.message : '',
    value: typeof value.value === 'string' || typeof value.value === 'number' ? value.value : undefined
  };
};

const parsePolicyDecision = (value: unknown): PolicyDecisionResponse => {
  if (!value || typeof value !== 'object') {
    throw new Error('policy response payload is invalid');
  }
  const decision = value as Record<string, unknown>;
  const state = String(decision.state || '');
  if (!validState(state)) {
    throw new Error(`policy response invalid state: ${state}`);
  }
  if (typeof decision.reasonCode !== 'string' || decision.reasonCode.length === 0) {
    throw new Error('policy response missing reasonCode');
  }
  if (typeof decision.traceId !== 'string' || !decision.traceId) {
    throw new Error('policy response missing traceId');
  }
  if (typeof decision.personaId !== 'string' || !decision.personaId) {
    throw new Error('policy response missing personaId');
  }

  const requirements = Array.isArray(decision.requirements)
    ? decision.requirements.map((entry) => normalizePolicyRequirement(entry))
    : [];
  if (!Array.isArray(requirements)) {
    throw new Error('policy response requirements must be an array');
  }

  const budgetSnapshot = decision.budgetSnapshot;
  if (!budgetSnapshot || typeof budgetSnapshot !== 'object') {
    throw new Error('policy response missing budgetSnapshot');
  }

  const tool = String(decision.tool || '');
  if (!validToolScope(tool)) {
    throw new Error(`policy response invalid tool: ${tool}`);
  }

  const riskClass = String(decision.riskClass || '');
  if (!validRiskClass(riskClass)) {
    throw new Error(`policy response invalid riskClass: ${riskClass}`);
  }

  const reasonCode = String(decision.reasonCode);
  if (!validReasonCode(reasonCode)) {
    throw new Error(`policy response invalid reasonCode: ${reasonCode}`);
  }
  if (typeof decision.policyVersion !== 'string' || !decision.policyVersion) {
    throw new Error('policy response missing policyVersion');
  }
  if (typeof decision.decisionId !== 'string' || !decision.decisionId) {
    throw new Error('policy response missing decisionId');
  }
  if (typeof decision.issuedAt !== 'string' || !decision.issuedAt) {
    throw new Error('policy response missing issuedAt');
  }

  return {
    state,
    reasonCode,
    reason: typeof decision.reason === 'string' ? decision.reason : undefined,
    personaId: decision.personaId,
    tool,
    riskClass,
    requiresConfirmation: decision.requiresConfirmation === true,
    requirements,
    budgetSnapshot: normalizeBudgetSnapshot(budgetSnapshot),
    policyVersion: decision.policyVersion,
    traceId: decision.traceId,
    decisionId: decision.decisionId,
    schemaVersion: typeof decision.schemaVersion === 'string' && decision.schemaVersion ? decision.schemaVersion : '1.0.0',
    issuedAt: decision.issuedAt,
    signatureMode:
      decision.signatureMode === 'dev' || decision.signatureMode === 'strict' || decision.signatureMode === 'enforced'
        ? decision.signatureMode
        : undefined,
    metadata: typeof decision.metadata === 'object' && decision.metadata !== null ? (decision.metadata as Record<string, unknown>) : undefined
  };
};

const renderDecision = (decision: PolicyDecisionResponse): string => {
  return JSON.stringify(
    {
      state: decision.state,
      reasonCode: decision.reasonCode,
      reason: decision.reason,
      requirements: decision.requirements,
      budgetSnapshot: decision.budgetSnapshot,
      traceId: decision.traceId,
      decisionId: decision.decisionId,
      policyVersion: decision.policyVersion,
      schemaVersion: decision.schemaVersion,
      issuedAt: decision.issuedAt
    },
    null,
    2
  );
};

export const parsePolicyCheckOptions = (args: string[]): PolicyCheckOptions => {
  const options: PolicyCheckOptions = {};
  for (const arg of args) {
    if (!arg.startsWith('--')) continue;

    const equals = arg.indexOf('=');
    const key = equals === -1 ? arg.slice(2) : arg.slice(2, equals);
    const value = equals === -1 ? 'true' : arg.slice(equals + 1);
    if (!key) continue;

    switch (key) {
      case 'endpoint':
        options.endpoint = value;
        break;
      case 'input':
        options.input = value;
        break;
      case 'timeout':
      case 'timeoutMs':
      case 'timeout-ms':
        options.timeoutMs = value;
        break;
      case 'expect-state':
      case 'expectState':
        options.expectState = value;
        break;
      case 'output':
      case 'output-mode':
      case 'outputMode':
        options.outputMode = value;
        break;
      case 'allow-confirm':
      case 'allowConfirm':
        options.allowConfirm = value;
        break;
      case 'require-budget':
      case 'requireBudget':
        options.requireBudget = value;
        break;
      case 'require-requirements':
      case 'requireRequirements':
        options.requireRequirements = value;
        break;
      default:
        break;
    }
  }
  return options;
};

export const buildPolicyHelp = (): string => `
soulism policy [endpoint] [request]

Positional:
  endpoint              Policy service base URL.
  request               Inline JSON request payload or path to a JSON request file.

Options:
  --endpoint=<url>              Policy service URL override.
  --input=<path>                Read request JSON from a file (alias for positional request path).
  --timeout-ms=<ms>             Request timeout in ms (default 5000, max 60000).
  --expect-state=<allow|confirm|deny>  Assert expected policy state.
  --output-mode=<json|human>     Output format.
  --allow-confirm               Treat confirm as success.
  --require-budget              Fail if budgetSnapshot is not present.
  --require-requirements        Fail if requirements array is not present.
`;

export const buildInvalidStateHelp = (state: string | undefined): string => {
  const display = state || '<empty>';
  return `Invalid --expect-state '${display}'. Allowed values: allow, confirm, deny.`;
};

export const runPolicy = async (
  policyEndpoint: string | undefined,
  requestBody: string | undefined,
  options: PolicyCheckOptions = {}
): Promise<PolicyCheckExitCode> => {
  const endpoint = (options.endpoint || policyEndpoint || process.env.COGNITIVE_POLICY_SERVICE_URL || 'http://localhost:4001').replace(/\/$/, '');
  const timeoutMs = normalizeTimeout(options.timeoutMs);
  const outputMode = options.outputMode === 'json' ? 'json' : 'human';
  const expectedState = options.expectState && validState(options.expectState) ? (options.expectState as PolicyDecisionState) : undefined;

  if (options.expectState && !expectedState) {
    console.error(buildInvalidStateHelp(options.expectState));
    return 1;
  }

  const allowConfirm = parseRequireBoolean(options.allowConfirm);
  const requireBudget = parseRequireBoolean(options.requireBudget);
  const requireRequirements = parseRequireBoolean(options.requireRequirements);

  const input = readPolicyInput(requestBody, options.input);
  const request = ensurePolicyRequestShape(parsePolicyCheckPayload(input));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${endpoint}/policy/check`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
      signal: controller.signal
    });

    if (!response.ok) {
      const responseBody = await response.text();
      throw new Error(`policy-check endpoint rejected request (${response.status}): ${responseBody || response.statusText}`);
    }

    const decision = parsePolicyDecision(await response.json());

    if (requireRequirements && (!Array.isArray(decision.requirements) || decision.requirements.length === 0)) {
      throw new Error('policy response missing requirements array');
    }
    if (requireBudget && !decision.budgetSnapshot) {
      throw new Error('policy response missing budgetSnapshot');
    }
    if (expectedState && decision.state !== expectedState) {
      throw new Error(`policy decision mismatch: expected ${expectedState}, got ${decision.state}`);
    }

    if (outputMode === 'json') {
      console.log(JSON.stringify(decision, null, 2));
    } else {
      console.log(renderDecision(decision));
    }

    if (decision.state === 'allow') {
      return 0;
    }
    if (decision.state === 'confirm' && allowConfirm) {
      return 0;
    }
    return decision.state === 'confirm' ? 2 : 3;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.error(`policy-check timed out after ${timeoutMs}ms`);
      return 4;
    }
    console.error(String(error));
    return 1;
  } finally {
    clearTimeout(timer);
  }
};
