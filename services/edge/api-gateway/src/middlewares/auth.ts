import { createHmac, createPublicKey, timingSafeEqual, verify as cryptoVerify } from 'node:crypto';
import { IncomingMessage, ServerResponse } from 'node:http';
import type { readConfig } from '../common/config.js';

type GatewayConfig = ReturnType<typeof readConfig>;

export interface AuthenticatedPrincipal {
  authenticated: boolean;
  subject: string;
  tenantId: string;
  personaId?: string;
  email?: string;
  roles: string[];
  issuer?: string;
  tokenType: 'anonymous' | 'api-key' | 'jwt';
  claims: Record<string, unknown>;
}

type AuthOptions = {
  requiredRoles?: string[];
};

type JwtHeader = {
  alg?: unknown;
  kid?: unknown;
};

type JwtPayload = Record<string, unknown> & {
  sub?: unknown;
  aud?: unknown;
  exp?: unknown;
  nbf?: unknown;
  iss?: unknown;
};

type JwkRecord = Record<string, unknown> & {
  kid?: unknown;
};

type JwksDocument = {
  keys?: JwkRecord[];
};

const jwksCache = new Map<string, { expiresAt: number; keys: Map<string, JwkRecord> }>();

const toTraceId = (req: IncomingMessage): string =>
  req.headers['x-trace-id']?.toString() ?? req.headers['x-request-id']?.toString() ?? `trace-${Date.now()}`;

const sendAuthError = (res: ServerResponse, status: 401 | 403, traceId: string, error: string, reasonCode: string): null => {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.end(
    JSON.stringify({
      error,
      status,
      reasonCode,
      traceId
    })
  );
  return null;
};

const parseBearerToken = (value: string | string[] | undefined): string => {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (/^bearer\s+/i.test(trimmed)) {
    return trimmed.replace(/^bearer\s+/i, '').trim();
  }
  return trimmed;
};

const padBase64 = (value: string): string => {
  const remainder = value.length % 4;
  return remainder === 0 ? value : `${value}${'='.repeat(4 - remainder)}`;
};

const decodeBase64Url = (value: string): Buffer =>
  Buffer.from(padBase64(value.replace(/-/g, '+').replace(/_/g, '/')), 'base64');

const parseJsonSegment = <T>(value: string): T => JSON.parse(decodeBase64Url(value).toString('utf8')) as T;

const stringClaim = (value: unknown): string | undefined => (typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined);

const numericClaim = (value: unknown): number | undefined => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
};

const normalizePem = (value: string): string => (value.includes('\\n') ? value.replace(/\\n/g, '\n') : value);

const parseRoles = (payload: JwtPayload): string[] => {
  const roles = new Set<string>();
  if (Array.isArray(payload.roles)) {
    for (const role of payload.roles) {
      if (typeof role === 'string' && role.trim().length > 0) {
        roles.add(role.trim());
      }
    }
  }
  const scopes = [payload.scope, payload.scp]
    .filter((value): value is string => typeof value === 'string')
    .flatMap((value) => value.split(/\s+/));
  for (const scope of scopes) {
    if (scope.trim().length > 0) {
      roles.add(scope.trim());
    }
  }
  return [...roles];
};

const matchesAudience = (required: string[], candidate: unknown): boolean => {
  if (required.length === 0) return true;
  const audiences = Array.isArray(candidate)
    ? candidate.filter((entry): entry is string => typeof entry === 'string')
    : typeof candidate === 'string'
    ? [candidate]
    : [];
  return required.some((entry) => audiences.includes(entry));
};

const fetchJwksKey = async (config: GatewayConfig, header: JwtHeader) => {
  if (!config.authJwtJwksUrl) {
    throw new Error('jwt_public_key_missing');
  }

  const kid = stringClaim(header.kid);
  if (!kid) {
    throw new Error('jwt_kid_missing');
  }

  const now = Date.now();
  let cached = jwksCache.get(config.authJwtJwksUrl);
  if (!cached || cached.expiresAt <= now) {
    const response = await fetch(config.authJwtJwksUrl, {
      method: 'GET',
      headers: {
        accept: 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`jwks_http_${response.status}`);
    }

    const payload = (await response.json().catch(() => ({}))) as JwksDocument;
    const keys = new Map<string, JwkRecord>();
    for (const entry of payload.keys ?? []) {
      const entryKid = stringClaim(entry.kid);
      if (!entryKid) continue;
      keys.set(entryKid, entry);
    }

    cached = {
      expiresAt: now + Math.max(5_000, config.authJwtJwksCacheTtlMs),
      keys
    };
    jwksCache.set(config.authJwtJwksUrl, cached);
  }

  const jwk = cached.keys.get(kid);
  if (!jwk) {
    throw new Error('jwt_jwks_kid_not_found');
  }

  return createPublicKey({
    key: jwk as any,
    format: 'jwk'
  });
};

const verifyJwtToken = async (token: string, config: GatewayConfig): Promise<AuthenticatedPrincipal> => {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('jwt_malformed');
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = parseJsonSegment<JwtHeader>(encodedHeader);
  const payload = parseJsonSegment<JwtPayload>(encodedPayload);
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = decodeBase64Url(encodedSignature);
  const algorithm = stringClaim(header.alg);

  if (algorithm === 'HS256') {
    if (!config.authJwtSecret) throw new Error('jwt_secret_missing');
    const expected = createHmac('sha256', config.authJwtSecret).update(signingInput).digest();
    if (expected.length !== signature.length || !timingSafeEqual(expected, signature)) {
      throw new Error('jwt_signature_invalid');
    }
  } else if (algorithm === 'RS256' || algorithm === 'EdDSA') {
    const key = config.authJwtPublicKey
      ? createPublicKey(normalizePem(config.authJwtPublicKey))
      : await fetchJwksKey(config, header);
    const verified =
      algorithm === 'RS256'
        ? cryptoVerify('RSA-SHA256', Buffer.from(signingInput), key, signature)
        : cryptoVerify(null, Buffer.from(signingInput), key, signature);
    if (!verified) {
      throw new Error('jwt_signature_invalid');
    }
  } else {
    throw new Error('jwt_algorithm_unsupported');
  }

  const now = Math.floor(Date.now() / 1000);
  const exp = numericClaim(payload.exp);
  const nbf = numericClaim(payload.nbf);
  if (exp !== undefined && now >= exp) throw new Error('jwt_expired');
  if (nbf !== undefined && now < nbf) throw new Error('jwt_not_yet_valid');
  if (config.authJwtIssuer && stringClaim(payload.iss) !== config.authJwtIssuer) {
    throw new Error('jwt_issuer_invalid');
  }
  if (!matchesAudience(config.authJwtAudience, payload.aud)) {
    throw new Error('jwt_audience_invalid');
  }

  const subject = stringClaim(payload.sub) || stringClaim(payload.userId);
  const tenantId = stringClaim(payload.tenantId) || stringClaim(payload.tenant_id) || stringClaim(payload.tid);
  if (!subject) throw new Error('jwt_subject_missing');
  if (!tenantId) throw new Error('jwt_tenant_missing');

  return {
    authenticated: true,
    subject,
    tenantId,
    personaId: stringClaim(payload.personaId) || stringClaim(payload.persona_id),
    email: stringClaim(payload.email),
    roles: parseRoles(payload),
    issuer: stringClaim(payload.iss),
    tokenType: 'jwt',
    claims: payload
  };
};

const anonymousPrincipal = (req: IncomingMessage): AuthenticatedPrincipal => ({
  authenticated: false,
  subject: req.headers['x-user-id']?.toString() ?? 'anonymous',
  tenantId: req.headers['x-tenant-id']?.toString() ?? 'default',
  personaId: req.headers['x-persona-id']?.toString() || undefined,
  roles: [],
  tokenType: 'anonymous',
  claims: {}
});

const buildApiKeyPrincipal = (config: GatewayConfig): AuthenticatedPrincipal => ({
  authenticated: true,
  subject: config.apiKeyUserId,
  tenantId: config.apiKeyTenantId,
  roles: config.apiKeyRoles,
  tokenType: 'api-key',
  claims: {}
});

const hasRequiredRole = (principal: AuthenticatedPrincipal, requiredRoles: string[]): boolean => {
  if (requiredRoles.length === 0) return true;
  if (principal.roles.includes('admin')) return true;
  return requiredRoles.some((role) => principal.roles.includes(role));
};

export const authenticateRequest = async (
  req: IncomingMessage,
  res: ServerResponse,
  config: GatewayConfig,
  options: AuthOptions = {}
): Promise<AuthenticatedPrincipal | null> => {
  const traceId = toTraceId(req);
  const requiredRoles = options.requiredRoles ?? [];

  if (!config.requireAuth) {
    const principal = anonymousPrincipal(req);
    return hasRequiredRole(principal, requiredRoles)
      ? principal
      : sendAuthError(res, 403, traceId, 'forbidden', 'forbidden');
  }

  const token = parseBearerToken(req.headers.authorization);
  if (!token) {
    return sendAuthError(res, 401, traceId, 'unauthorized', 'unauthorized');
  }

  let principal: AuthenticatedPrincipal;
  try {
    if (config.authMode === 'api-key') {
      if (!config.apiKey || token !== config.apiKey) {
        return sendAuthError(res, 401, traceId, 'unauthorized', 'unauthorized');
      }
      principal = buildApiKeyPrincipal(config);
    } else {
      principal = await verifyJwtToken(token, config);
    }
  } catch (error) {
    return sendAuthError(res, 401, traceId, 'unauthorized', String(error));
  }

  if (!hasRequiredRole(principal, requiredRoles)) {
    return sendAuthError(res, 403, traceId, 'forbidden', 'forbidden');
  }

  return principal;
};
