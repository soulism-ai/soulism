import { createHash } from 'node:crypto';
import { IncomingMessage, ServerResponse } from 'node:http';
import { getSigningPostureStatus } from '@soulism/persona-signing/status.js';
import { readJsonBody, sendJson } from '@soulism/shared/http.js';
import { createReadinessReport, probeHttpDependency, probeTaskDependency } from '@soulism/shared/readiness.js';
import { ServiceMetricsCollector, observeHttpRequest } from '@soulism/shared/telemetry.js';
import { readConfig } from './common/config.js';
import { normalizePolicyDecision, toErrorResponse } from './filters.js';
import { authenticateRequest, type AuthenticatedPrincipal } from './middlewares/auth.js';
import { tooLargeBody } from './middlewares/bodySize.js';
import { RateLimiter } from './middlewares/rateLimit.js';
import { attachRequestId } from './middlewares/requestId.js';

const config = readConfig();
const rateLimiter = new RateLimiter(config.rateLimitStorePath, {
  stateBackend: config.rateLimitStateBackend,
  stateRedisUrl: config.rateLimitRedisUrl,
  stateStoreKey: config.rateLimitStoreKey
});
const telemetry = new ServiceMetricsCollector('api-gateway');

type GatewayConfig = ReturnType<typeof readConfig>;

type TargetResolution = {
  base: string;
  upstreamPath: string;
  requiredRoles?: string[];
  normalizePolicy?: boolean;
};

type ServiceStatusResponse = {
  service: string;
  ok: boolean;
  ready: boolean;
  errors?: string[];
  checks?: Array<{
    name: string;
    ok: boolean;
    required: boolean;
    target?: string;
    status?: number;
    latencyMs?: number;
    error?: string;
    skipped?: boolean;
  }>;
  latencyMs: number;
  [key: string]: unknown;
};

const hopByHopHeaders = new Set([
  'authorization',
  'connection',
  'content-length',
  'host',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade'
]);

const internalIdentityHeaders = new Set([
  'x-auth-subject',
  'x-auth-roles',
  'x-auth-token-type',
  'x-authenticated',
  'x-principal-email',
  'x-tenant-id',
  'x-user-id'
]);

const operatorRoles = config.requireAuth ? config.operatorRoles : [];

const requestUrl = (url: string | undefined): URL => new URL(url || '/', 'http://gateway.internal');

const normalizePath = (url: string | undefined): string => requestUrl(url).pathname;

const traceIdFromRequest = (req: IncomingMessage): string => {
  const headers = req.headers as Record<string, string | string[] | undefined>;
  return typeof headers['x-trace-id'] === 'string'
    ? headers['x-trace-id']
    : typeof headers['x-request-id'] === 'string'
      ? headers['x-request-id']
      : `trace-${Date.now()}`;
};

const setResponseTraceHeaders = (res: ServerResponse, traceId: string): void => {
  res.setHeader(config.requestIdHeader, traceId);
  res.setHeader('x-request-id', traceId);
  res.setHeader('x-trace-id', traceId);
};

const sendGatewayError = (
  res: ServerResponse,
  status: number,
  message: string,
  traceId: string,
  reasonCode?: string,
  details?: Record<string, unknown>
): void => {
  sendJson(
    res,
    status,
    toErrorResponse(status, message, {
      reasonCode,
      traceId,
      details
    })
  );
};

const toHeaderValue = (value: string | string[] | undefined): string | undefined => {
  if (Array.isArray(value)) {
    return value.join(', ');
  }
  return typeof value === 'string' ? value : undefined;
};

const isJsonPayload = (value: string | null | undefined): boolean => {
  if (!value) return false;
  const trimmed = value.trim();
  return trimmed.startsWith('{') || trimmed.startsWith('[');
};

const parseJsonSafely = (value: string | null | undefined): unknown => {
  if (!isJsonPayload(value)) return value;
  try {
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
};

const normalizeErrors = (payload: unknown, fallback: string): string[] => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return [fallback];

  const body = payload as Record<string, unknown>;
  const errors = [
    ...(Array.isArray(body.errors) ? body.errors.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0) : []),
    ...(typeof body.reason === 'string' && body.reason.length > 0 ? [body.reason] : []),
    ...(typeof body.error === 'string' && body.error.length > 0 ? [body.error] : []),
    ...(typeof body.message === 'string' && body.message.length > 0 ? [body.message] : [])
  ];

  return errors.length > 0 ? [...new Set(errors)] : [fallback];
};

const readRawBody = async (req: IncomingMessage): Promise<string | undefined> => {
  const method = (req.method || 'GET').toUpperCase();
  if (method === 'GET' || method === 'HEAD') return undefined;

  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) return undefined;
  return Buffer.concat(chunks).toString('utf8');
};

const buildGatewayChecks = async (gatewayConfig: GatewayConfig) =>
  Promise.all([
    probeTaskDependency('rate-limit-store', () => rateLimiter.ready(), { target: gatewayConfig.rateLimitReadyTarget }),
    probeHttpDependency('policy-gate', gatewayConfig.policyService),
    probeHttpDependency('risk-budget', gatewayConfig.riskBudgetService),
    probeHttpDependency('persona-registry', gatewayConfig.personaRegistryService),
    probeHttpDependency('memory', gatewayConfig.memoryService),
    probeHttpDependency('tool-files', gatewayConfig.filesService),
    probeHttpDependency('tool-webfetch', gatewayConfig.webfetchService),
    probeHttpDependency('audit-ledger', gatewayConfig.auditService)
  ]);

const buildGatewayStatus = async (): Promise<ServiceStatusResponse> => {
  const startedAt = Date.now();
  const checks = await buildGatewayChecks(config);
  const report = createReadinessReport('api-gateway', checks, startedAt);
  return {
    service: 'api-gateway',
    ok: true,
    ready: report.ready,
    errors: report.errors,
    checks: report.checks,
    latencyMs: report.latencyMs ?? Date.now() - startedAt
  };
};

const buildGatewayMetrics = () => telemetry.snapshot();

const buildSigningStatus = () =>
  getSigningPostureStatus({
    productionMode: config.productionMode,
    strictSigning: config.strictSigning,
    signaturePolicyMode: config.signaturePolicyMode,
    signingPublicKey: config.signingPublicKey,
    signingPublicKeyPath: config.signingPublicKeyPath,
    kmsProvidersPolicyPath: config.kmsProvidersPolicyPath,
    signingRotationPolicyPath: config.signingRotationPolicyPath,
    providerKeyMaps: {
      aws: {
        keyMapJson: config.kmsAwsKeysJson,
        keyMapPath: config.kmsAwsKeysPath
      },
      gcp: {
        keyMapJson: config.kmsGcpKeysJson,
        keyMapPath: config.kmsGcpKeysPath
      },
      azure: {
        keyMapJson: config.kmsAzureKeysJson,
        keyMapPath: config.kmsAzureKeysPath
      }
    }
  });

const requestDocument = async (
  base: string,
  path: string
): Promise<{ response: Response | null; payload: unknown; rawError?: string }> => {
  try {
    const response = await fetch(`${base}${path}`, {
      method: 'GET',
      headers: {
        accept: 'application/json'
      }
    });
    const raw = await response.text().catch(() => '');
    return {
      response,
      payload: parseJsonSafely(raw)
    };
  } catch (error) {
    return {
      response: null,
      payload: { error: error instanceof Error ? error.message : String(error) },
      rawError: error instanceof Error ? error.message : String(error)
    };
  }
};

const buildDependencyStatus = async (service: string, base: string): Promise<ServiceStatusResponse> => {
  const startedAt = Date.now();
  const [health, ready] = await Promise.all([requestDocument(base, '/health'), requestDocument(base, '/ready')]);

  const healthPayload = health.payload && typeof health.payload === 'object' && !Array.isArray(health.payload)
    ? (health.payload as Record<string, unknown>)
    : {};
  const readyPayload = ready.payload && typeof ready.payload === 'object' && !Array.isArray(ready.payload)
    ? (ready.payload as Record<string, unknown>)
    : {};

  const healthOk = !!health.response && health.response.ok && healthPayload.ok !== false;
  const readyOk = !!ready.response && ready.response.ok && readyPayload.ok !== false && readyPayload.ready !== false;
  const errors = [
    ...(healthOk ? [] : normalizeErrors(health.payload, health.response ? `health_http_${health.response.status}` : 'health_unreachable')),
    ...(readyOk ? [] : normalizeErrors(ready.payload, ready.response ? `ready_http_${ready.response.status}` : 'ready_unreachable'))
  ];

  return {
    ...healthPayload,
    service: typeof healthPayload.service === 'string' ? healthPayload.service : service,
    ok: healthOk,
    ready: healthOk && readyOk,
    errors: errors.length > 0 ? [...new Set(errors)] : undefined,
    checks: Array.isArray(readyPayload.checks) ? (readyPayload.checks as ServiceStatusResponse['checks']) : undefined,
    latencyMs: Date.now() - startedAt
  };
};

const buildDependencyMetrics = async (service: string, base: string) => {
  const { response, payload } = await requestDocument(base, '/metrics');
  if (response?.ok && payload && typeof payload === 'object' && !Array.isArray(payload)) {
    return payload;
  }
  throw new Error(normalizeErrors(payload, response ? `metrics_http_${response.status}` : 'metrics_unreachable').join('; '));
};

const resolveAdminService = (service: string): string | null | undefined => {
  if (service === 'gateway') return null;
  if (service === 'policy') return config.policyService;
  if (service === 'risk-budget') return config.riskBudgetService;
  if (service === 'persona') return config.personaRegistryService;
  if (service === 'memory') return config.memoryService;
  if (service === 'files') return config.filesService;
  if (service === 'webfetch') return config.webfetchService;
  if (service === 'audit') return config.auditService;
  return undefined;
};

const resolveTarget = (path: string): TargetResolution | null => {
  if (path.startsWith('/policy/')) {
    return { base: config.policyService, upstreamPath: path, normalizePolicy: true };
  }
  if (path.startsWith('/persona/')) {
    return { base: config.personaRegistryService, upstreamPath: path.replace('/persona/', '/personas/') };
  }
  if (path.startsWith('/personas')) {
    return { base: config.personaRegistryService, upstreamPath: path };
  }
  if (path.startsWith('/memory')) {
    return { base: config.memoryService, upstreamPath: path };
  }
  if (path.startsWith('/tools/webfetch')) {
    return { base: config.webfetchService, upstreamPath: path.replace('/tools/webfetch', '/webfetch') };
  }
  if (path.startsWith('/tools/files')) {
    return { base: config.filesService, upstreamPath: path.replace('/tools/files', '/files') };
  }
  if (path === '/audit') {
    return { base: config.auditService, upstreamPath: '/audit/events', requiredRoles: operatorRoles };
  }
  if (path.startsWith('/audit/')) {
    return { base: config.auditService, upstreamPath: path, requiredRoles: operatorRoles };
  }
  if (path === '/budgets' || path.startsWith('/budgets/')) {
    return { base: config.riskBudgetService, upstreamPath: path, requiredRoles: operatorRoles };
  }
  return null;
};

const buildUpstreamHeaders = (
  req: IncomingMessage,
  principal: AuthenticatedPrincipal,
  traceId: string,
  options: { personaId?: string } = {}
): Headers => {
  const headers = new Headers();

  for (const [name, rawValue] of Object.entries(req.headers)) {
    const lowerName = name.toLowerCase();
    if (hopByHopHeaders.has(lowerName) || internalIdentityHeaders.has(lowerName)) continue;
    if (lowerName === 'x-persona-id') continue;
    const value = toHeaderValue(rawValue);
    if (!value) continue;
    headers.set(name, value);
  }

  headers.set(config.requestIdHeader, traceId);
  headers.set('x-request-id', traceId);
  headers.set('x-trace-id', traceId);
  headers.set('x-authenticated', principal.authenticated ? 'true' : 'false');
  headers.set('x-auth-subject', principal.subject);
  headers.set('x-auth-roles', principal.roles.join(','));
  headers.set('x-auth-token-type', principal.tokenType);
  headers.set('x-user-id', principal.subject);
  headers.set('x-tenant-id', principal.tenantId);

  const personaId = options.personaId ?? principal.personaId ?? req.headers['x-persona-id']?.toString();
  if (personaId) {
    headers.set('x-persona-id', personaId);
  }

  if (principal.email) {
    headers.set('x-principal-email', principal.email);
  }

  return headers;
};

const copyUpstreamHeaders = (res: ServerResponse, upstreamResponse: Response, traceId: string): void => {
  upstreamResponse.headers.forEach((value, name) => {
    const lowerName = name.toLowerCase();
    if (hopByHopHeaders.has(lowerName)) return;
    res.setHeader(name, value);
  });
  res.setHeader(config.requestIdHeader, traceId);
  res.setHeader('x-request-id', traceId);
  res.setHeader('x-trace-id', traceId);
};

const writeUpstreamPayload = async (
  res: ServerResponse,
  upstreamResponse: Response,
  traceId: string
): Promise<void> => {
  const raw = await upstreamResponse.text();
  const contentType = upstreamResponse.headers.get('content-type') || 'application/json';
  const parsed = parseJsonSafely(raw);

  if (!upstreamResponse.ok) {
    const upstream = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
    sendGatewayError(
      res,
      upstreamResponse.status,
      'policy_service_error',
      typeof upstream?.traceId === 'string' ? upstream.traceId : traceId,
      typeof upstream?.reasonCode === 'string' ? upstream.reasonCode : 'upstream_error',
      {
        upstream: upstreamResponse.url,
        status: upstreamResponse.status,
        body: raw,
        contentType
      }
    );
    return;
  }

  if (contentType.includes('application/json') || isJsonPayload(raw)) {
    const decision = normalizePolicyDecision(parsed, traceId);
    if (!decision) {
      sendGatewayError(res, 502, 'invalid_policy_response', traceId, 'invalid_policy_response', {
        upstream: upstreamResponse.url,
        body: raw
      });
      return;
    }
    sendJson(res, upstreamResponse.status, decision, { statusMessage: upstreamResponse.statusText });
    return;
  }

  sendJson(res, upstreamResponse.status, raw, { statusMessage: upstreamResponse.statusText });
};

const forwardRequest = async (
  req: IncomingMessage,
  res: ServerResponse,
  principal: AuthenticatedPrincipal,
  target: TargetResolution,
  traceId: string
): Promise<void> => {
  const parsedUrl = requestUrl(req.url);
  const rawBody = await readRawBody(req);
  const response = await fetch(`${target.base}${target.upstreamPath}${parsedUrl.search}`, {
    method: req.method,
    headers: buildUpstreamHeaders(req, principal, traceId),
    body: rawBody
  });

  if (target.normalizePolicy) {
    await writeUpstreamPayload(res, response, traceId);
    return;
  }

  const text = await response.text();
  res.statusCode = response.status;
  copyUpstreamHeaders(res, response, traceId);
  if (!res.hasHeader('content-type')) {
    res.setHeader('content-type', response.headers.get('content-type') || 'application/json');
  }
  res.end(text);
};

const forwardPolicyCheck = async (
  req: IncomingMessage,
  res: ServerResponse,
  principal: AuthenticatedPrincipal,
  target: TargetResolution,
  traceId: string
): Promise<void> => {
  let body: Record<string, unknown>;
  try {
    body = await readJsonBody(req, { required: true });
  } catch (error) {
    sendGatewayError(res, 400, 'invalid_request', traceId, 'invalid_request', {
      error: String(error)
    });
    return;
  }

  const personaId =
    principal.personaId ||
    (typeof body.personaId === 'string' && body.personaId.length > 0 ? body.personaId : undefined);
  const forwardedBody = {
    ...body,
    traceId: typeof body.traceId === 'string' && body.traceId.length > 0 ? body.traceId : traceId,
    userId: principal.subject,
    tenantId: principal.tenantId,
    ...(personaId ? { personaId } : {})
  };

  const response = await fetch(`${target.base}${target.upstreamPath}`, {
    method: req.method,
    headers: buildUpstreamHeaders(req, principal, traceId, { personaId }),
    body: JSON.stringify(forwardedBody)
  });
  await writeUpstreamPayload(res, response, traceId);
};

export async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
  attachRequestId(req);
  const traceId = traceIdFromRequest(req);
  setResponseTraceHeaders(res, traceId);

  const method = (req.method || 'GET').toUpperCase();
  const path = normalizePath(req.url);
  observeHttpRequest(telemetry, res, { method, route: path, traceId });

  if (method === 'GET' && path === '/health') {
    sendJson(res, 200, { ok: true, service: 'api-gateway' });
    return;
  }

  if (method === 'GET' && path === '/metrics') {
    sendJson(res, 200, buildGatewayMetrics());
    return;
  }

  if (method === 'GET' && path === '/ready') {
    const startedAt = Date.now();
    const report = createReadinessReport('api-gateway', await buildGatewayChecks(config), startedAt);
    sendJson(res, report.ready ? 200 : 503, report);
    return;
  }

  try {
    await rateLimiter.ready();
  } catch (error) {
    sendGatewayError(res, 503, 'rate_limit_store_unavailable', traceId, 'rate_limit_store_unavailable', {
      storePath: config.rateLimitStorePath,
      backendTarget: config.rateLimitReadyTarget,
      error: String(error)
    });
    return;
  }

  if (tooLargeBody(req, 1_048_576)) {
    sendGatewayError(res, 413, 'payload_too_large', traceId, 'payload_too_large');
    return;
  }

  const authorizationKey = toHeaderValue(req.headers.authorization);
  const rateKey = authorizationKey
    ? `auth:${createHash('sha256').update(authorizationKey).digest('hex')}`
    : req.socket.remoteAddress || 'unknown';
  if (!(await rateLimiter.checkRateLimit(rateKey, config.rateMax, config.rateWindowMs))) {
    sendGatewayError(res, 429, 'rate_limited', traceId, 'rate_limited');
    return;
  }

  if (method === 'GET' && path === '/auth/me') {
    const principal = await authenticateRequest(req, res, config);
    if (!principal) return;
    sendJson(res, 200, principal);
    return;
  }

  if (method === 'GET' && path.startsWith('/admin/services/') && path.endsWith('/status')) {
    const principal = await authenticateRequest(req, res, config, { requiredRoles: operatorRoles });
    if (!principal) return;

    const service = decodeURIComponent(path.slice('/admin/services/'.length, -'/status'.length));
    const base = resolveAdminService(service);
    if (base === undefined) {
      sendGatewayError(res, 404, 'not_found', traceId, 'not_found');
      return;
    }

    const report = base === null ? await buildGatewayStatus() : await buildDependencyStatus(service, base);
    sendJson(res, report.ok && report.ready ? 200 : 503, report);
    return;
  }

  if (method === 'GET' && path.startsWith('/admin/services/') && path.endsWith('/metrics')) {
    const principal = await authenticateRequest(req, res, config, { requiredRoles: operatorRoles });
    if (!principal) return;

    const service = decodeURIComponent(path.slice('/admin/services/'.length, -'/metrics'.length));
    const base = resolveAdminService(service);
    if (base === undefined) {
      sendGatewayError(res, 404, 'not_found', traceId, 'not_found');
      return;
    }

    try {
      const report = base === null ? buildGatewayMetrics() : await buildDependencyMetrics(service, base);
      sendJson(res, 200, report);
    } catch (error) {
      sendGatewayError(res, 503, 'metrics_unavailable', traceId, 'metrics_unavailable', {
        service,
        error: String(error)
      });
    }
    return;
  }

  if (method === 'GET' && path === '/admin/signing/status') {
    const principal = await authenticateRequest(req, res, config, { requiredRoles: operatorRoles });
    if (!principal) return;

    const status = await buildSigningStatus();
    sendJson(res, status.ready ? 200 : 503, status);
    return;
  }

  const target = resolveTarget(path);
  if (!target) {
    sendGatewayError(res, 404, 'not_found', traceId, 'not_found');
    return;
  }

  const principal = await authenticateRequest(req, res, config, { requiredRoles: target.requiredRoles ?? [] });
  if (!principal) return;

  try {
    if (target.normalizePolicy && path === '/policy/check' && method === 'POST') {
      await forwardPolicyCheck(req, res, principal, target, traceId);
      return;
    }

    await forwardRequest(req, res, principal, target, traceId);
  } catch (error) {
    sendGatewayError(res, 502, 'upstream_unavailable', traceId, 'upstream_unreachable', {
      upstream: target.base,
      error: String(error)
    });
  }
}
