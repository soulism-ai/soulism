import { createHash, createHmac, createPrivateKey, randomUUID, sign as cryptoSign, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';

export type SessionJwtAlgorithm = 'HS256' | 'RS256' | 'EdDSA';

export type IssuedSessionToken = {
  token: string;
  expiresAt: string;
  claims: Record<string, unknown>;
};

export type SessionIssuerStatus = {
  enabled: boolean;
  required: boolean;
  ready: boolean;
  algorithm: SessionJwtAlgorithm | '';
  issues: string[];
};

type SessionAuthErrorCode =
  | 'session_auth_invalid_credentials'
  | 'session_auth_credentials_not_configured'
  | 'session_auth_issuer_not_configured'
  | 'session_auth_signing_key_missing'
  | 'session_auth_algorithm_invalid';

type SessionAuthConfig = {
  username: string;
  password: string;
  subject: string;
  tenantId: string;
  roles: string[];
  email?: string;
  issuer: string;
  audience: string[];
  algorithm: SessionJwtAlgorithm;
  keyId?: string;
  secret: string;
  privateKey: string;
  expiresInSeconds: number;
};

const supportedAlgorithms = new Set<SessionJwtAlgorithm>(['HS256', 'RS256', 'EdDSA']);

const authError = (code: SessionAuthErrorCode): Error => {
  const error = new Error(code);
  (error as Error & { code: SessionAuthErrorCode }).code = code;
  return error;
};

export const isSessionAuthError = (value: unknown): value is Error & { code: SessionAuthErrorCode } =>
  value instanceof Error && typeof (value as { code?: unknown }).code === 'string';

const envFirst = (...names: string[]): string => {
  for (const name of names) {
    const value = process.env[name];
    if (typeof value !== 'string') continue;
    const normalized = value.trim();
    if (normalized.length > 0) return normalized;
  }
  return '';
};

const splitCsv = (value: string): string[] =>
  value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

const normalizePem = (value: string): string => (value.includes('\\n') ? value.replace(/\\n/g, '\n') : value);

const encodeSegment = (value: unknown): string => Buffer.from(JSON.stringify(value)).toString('base64url');

const envSet = (...names: string[]): boolean => envFirst(...names).length > 0;

const envBool = (name: string, defaultValue = false): boolean => {
  const raw = process.env[name];
  if (typeof raw !== 'string') return defaultValue;
  const normalized = raw.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return defaultValue;
};

const secureEqual = (expected: string, candidate: string): boolean => {
  if (expected.length === 0 || candidate.length === 0) return false;
  const expectedDigest = createHash('sha256').update(expected).digest();
  const candidateDigest = createHash('sha256').update(candidate).digest();
  return timingSafeEqual(expectedDigest, candidateDigest);
};

const readPrivateKey = async (): Promise<string> => {
  const inline = envFirst('CONTROL_PLANE_JWT_PRIVATE_KEY', 'AUTH_JWT_PRIVATE_KEY');
  if (inline.length > 0) return normalizePem(inline);

  const path = envFirst('CONTROL_PLANE_JWT_PRIVATE_KEY_PATH', 'AUTH_JWT_PRIVATE_KEY_PATH');
  if (path.length === 0) return '';

  const raw = await readFile(path, 'utf8');
  return normalizePem(raw);
};

const resolveAlgorithm = (configured: string, privateKey: string): SessionJwtAlgorithm => {
  const normalized = configured.trim().toUpperCase();
  if (normalized.length > 0) {
    if (!supportedAlgorithms.has(normalized as SessionJwtAlgorithm)) {
      throw authError('session_auth_algorithm_invalid');
    }
    return normalized as SessionJwtAlgorithm;
  }

  if (privateKey.length > 0) return 'RS256';
  return 'HS256';
};

const readConfig = async (): Promise<SessionAuthConfig> => {
  const username = envFirst('CONTROL_PLANE_AUTH_USERNAME');
  const password = envFirst('CONTROL_PLANE_AUTH_PASSWORD');
  if (username.length === 0 || password.length === 0) {
    throw authError('session_auth_credentials_not_configured');
  }

  const issuer = envFirst('CONTROL_PLANE_JWT_ISSUER', 'AUTH_JWT_ISSUER');
  if (issuer.length === 0) {
    throw authError('session_auth_issuer_not_configured');
  }

  const privateKey = await readPrivateKey();
  const secret = envFirst('CONTROL_PLANE_JWT_SECRET', 'AUTH_JWT_SECRET');
  const algorithm = resolveAlgorithm(envFirst('CONTROL_PLANE_JWT_ALGORITHM', 'AUTH_JWT_ALGORITHM'), privateKey);

  if (algorithm === 'HS256' && secret.length === 0) {
    throw authError('session_auth_signing_key_missing');
  }

  if (algorithm !== 'HS256' && privateKey.length === 0) {
    throw authError('session_auth_signing_key_missing');
  }

  const roles = splitCsv(envFirst('CONTROL_PLANE_AUTH_ROLES', 'AUTH_OPERATOR_ROLES') || 'operator');
  const expiresInSeconds = Number(envFirst('CONTROL_PLANE_JWT_EXPIRES_IN_SECONDS') || '3600');

  return {
    username,
    password,
    subject: envFirst('CONTROL_PLANE_AUTH_SUBJECT') || username,
    tenantId: envFirst('CONTROL_PLANE_AUTH_TENANT_ID') || 'default',
    roles,
    email: envFirst('CONTROL_PLANE_AUTH_EMAIL') || undefined,
    issuer,
    audience: splitCsv(envFirst('CONTROL_PLANE_JWT_AUDIENCE', 'AUTH_JWT_AUDIENCE') || 'control-plane'),
    algorithm,
    keyId: envFirst('CONTROL_PLANE_JWT_KEY_ID') || undefined,
    secret,
    privateKey,
    expiresInSeconds: Number.isFinite(expiresInSeconds) && expiresInSeconds > 0 ? expiresInSeconds : 3600
  };
};

const signJwt = (header: Record<string, unknown>, payload: Record<string, unknown>, config: SessionAuthConfig): string => {
  const encodedHeader = encodeSegment(header);
  const encodedPayload = encodeSegment(payload);
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  if (config.algorithm === 'HS256') {
    const signature = createHmac('sha256', config.secret).update(signingInput).digest('base64url');
    return `${signingInput}.${signature}`;
  }

  const privateKey = createPrivateKey(config.privateKey);
  const signature =
    config.algorithm === 'RS256'
      ? cryptoSign('RSA-SHA256', Buffer.from(signingInput), privateKey)
      : cryptoSign(null, Buffer.from(signingInput), privateKey);
  return `${signingInput}.${signature.toString('base64url')}`;
};

export const getOperatorSessionIssuerStatus = async (): Promise<SessionIssuerStatus> => {
  const required = envBool('CONTROL_PLANE_REQUIRE_SESSION_ISSUER', false);
  const usernameConfigured = envSet('CONTROL_PLANE_AUTH_USERNAME');
  const passwordConfigured = envSet('CONTROL_PLANE_AUTH_PASSWORD');
  const issuerConfigured = envSet('CONTROL_PLANE_JWT_ISSUER', 'AUTH_JWT_ISSUER');
  const secretConfigured = envSet('CONTROL_PLANE_JWT_SECRET', 'AUTH_JWT_SECRET');
  const privateKeyInlineConfigured = envSet('CONTROL_PLANE_JWT_PRIVATE_KEY', 'AUTH_JWT_PRIVATE_KEY');
  const privateKeyPathConfigured = envSet('CONTROL_PLANE_JWT_PRIVATE_KEY_PATH', 'AUTH_JWT_PRIVATE_KEY_PATH');
  const enabled =
    required ||
    usernameConfigured ||
    passwordConfigured ||
    issuerConfigured ||
    secretConfigured ||
    privateKeyInlineConfigured ||
    privateKeyPathConfigured;

  if (!enabled) {
    return {
      enabled: false,
      required,
      ready: true,
      algorithm: '',
      issues: []
    };
  }

  const issues: string[] = [];
  if (!usernameConfigured) issues.push('username_missing');
  if (!passwordConfigured) issues.push('password_missing');
  if (!issuerConfigured) issues.push('issuer_missing');

  let privateKey = '';
  if (privateKeyPathConfigured) {
    try {
      privateKey = await readPrivateKey();
      if (privateKey.length === 0) {
        issues.push('private_key_path_empty');
      }
    } catch {
      issues.push('private_key_unreadable');
    }
  } else if (privateKeyInlineConfigured) {
    privateKey = normalizePem(envFirst('CONTROL_PLANE_JWT_PRIVATE_KEY', 'AUTH_JWT_PRIVATE_KEY'));
  }

  let algorithm: SessionJwtAlgorithm | '' = '';
  try {
    algorithm = resolveAlgorithm(envFirst('CONTROL_PLANE_JWT_ALGORITHM', 'AUTH_JWT_ALGORITHM'), privateKey);
  } catch {
    issues.push('algorithm_invalid');
  }

  if (algorithm === 'HS256' && !secretConfigured) {
    issues.push('signing_secret_missing');
  }

  if ((algorithm === 'RS256' || algorithm === 'EdDSA') && privateKey.length === 0) {
    issues.push('signing_private_key_missing');
  }

  return {
    enabled: true,
    required,
    ready: issues.length === 0,
    algorithm,
    issues
  };
};

export const issueOperatorSessionToken = async (input: {
  username: string;
  password: string;
}): Promise<IssuedSessionToken> => {
  const config = await readConfig();
  const username = input.username.trim();
  const password = input.password;

  if (!secureEqual(config.username, username) || !secureEqual(config.password, password)) {
    throw authError('session_auth_invalid_credentials');
  }

  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + config.expiresInSeconds;
  const payload: Record<string, unknown> = {
    sub: config.subject,
    tenantId: config.tenantId,
    roles: config.roles,
    iss: config.issuer,
    aud: config.audience.length === 1 ? config.audience[0] : config.audience,
    iat: issuedAt,
    nbf: issuedAt - 5,
    exp: expiresAt,
    jti: randomUUID()
  };

  if (config.email) {
    payload.email = config.email;
  }

  const header: Record<string, unknown> = {
    alg: config.algorithm,
    typ: 'JWT'
  };

  if (config.keyId) {
    header.kid = config.keyId;
  }

  return {
    token: signJwt(header, payload, config),
    expiresAt: new Date(expiresAt * 1000).toISOString(),
    claims: payload
  };
};
