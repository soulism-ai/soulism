import { createHmac, generateKeyPairSync, verify as cryptoVerify } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { issueOperatorSessionToken } from '../src/server/session-auth';

const envKeys = [
  'CONTROL_PLANE_AUTH_USERNAME',
  'CONTROL_PLANE_AUTH_PASSWORD',
  'CONTROL_PLANE_AUTH_SUBJECT',
  'CONTROL_PLANE_AUTH_TENANT_ID',
  'CONTROL_PLANE_AUTH_ROLES',
  'CONTROL_PLANE_AUTH_EMAIL',
  'CONTROL_PLANE_JWT_ISSUER',
  'CONTROL_PLANE_JWT_AUDIENCE',
  'CONTROL_PLANE_JWT_SECRET',
  'CONTROL_PLANE_JWT_PRIVATE_KEY',
  'CONTROL_PLANE_JWT_PRIVATE_KEY_PATH',
  'CONTROL_PLANE_JWT_ALGORITHM',
  'CONTROL_PLANE_JWT_EXPIRES_IN_SECONDS',
  'CONTROL_PLANE_JWT_KEY_ID'
] as const;

const originalEnv = new Map(envKeys.map((key) => [key, process.env[key]]));

const restoreEnv = () => {
  for (const key of envKeys) {
    const previous = originalEnv.get(key);
    if (previous === undefined) {
      delete process.env[key];
      continue;
    }
    process.env[key] = previous;
  }
};

const decodeSegment = <T>(value: string): T => JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as T;

describe('issueOperatorSessionToken', () => {
  afterEach(() => {
    restoreEnv();
  });

  it('issues HS256 session tokens with operator claims', async () => {
    process.env.CONTROL_PLANE_AUTH_USERNAME = 'ops';
    process.env.CONTROL_PLANE_AUTH_PASSWORD = 'super-secret';
    process.env.CONTROL_PLANE_AUTH_SUBJECT = 'operator-1';
    process.env.CONTROL_PLANE_AUTH_TENANT_ID = 'tenant-a';
    process.env.CONTROL_PLANE_AUTH_ROLES = 'operator,admin';
    process.env.CONTROL_PLANE_AUTH_EMAIL = 'ops@example.com';
    process.env.CONTROL_PLANE_JWT_ISSUER = 'https://issuer.example';
    process.env.CONTROL_PLANE_JWT_AUDIENCE = 'control-plane';
    process.env.CONTROL_PLANE_JWT_SECRET = 'gateway-secret';
    process.env.CONTROL_PLANE_JWT_EXPIRES_IN_SECONDS = '900';

    const issued = await issueOperatorSessionToken({
      username: 'ops',
      password: 'super-secret'
    });

    const [encodedHeader, encodedPayload, encodedSignature] = issued.token.split('.');
    const header = decodeSegment<Record<string, unknown>>(encodedHeader);
    const payload = decodeSegment<Record<string, unknown>>(encodedPayload);
    const signingInput = `${encodedHeader}.${encodedPayload}`;
    const signature = createHmac('sha256', 'gateway-secret').update(signingInput).digest('base64url');

    expect(signature).toBe(encodedSignature);
    expect(header).toMatchObject({
      alg: 'HS256',
      typ: 'JWT'
    });
    expect(payload).toMatchObject({
      sub: 'operator-1',
      tenantId: 'tenant-a',
      iss: 'https://issuer.example',
      aud: 'control-plane',
      email: 'ops@example.com'
    });
    expect(payload.roles).toEqual(['operator', 'admin']);
    expect(typeof payload.jti).toBe('string');
    expect(issued.expiresAt).toBe(new Date(Number(payload.exp) * 1000).toISOString());
  });

  it('issues RS256 session tokens when a private key is configured', async () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048
    });

    process.env.CONTROL_PLANE_AUTH_USERNAME = 'ops';
    process.env.CONTROL_PLANE_AUTH_PASSWORD = 'super-secret';
    process.env.CONTROL_PLANE_JWT_ISSUER = 'https://issuer.example';
    process.env.CONTROL_PLANE_JWT_PRIVATE_KEY = privateKey.export({ type: 'pkcs1', format: 'pem' }).toString();
    process.env.CONTROL_PLANE_JWT_ALGORITHM = 'RS256';

    const issued = await issueOperatorSessionToken({
      username: 'ops',
      password: 'super-secret'
    });

    const [encodedHeader, encodedPayload, encodedSignature] = issued.token.split('.');
    const header = decodeSegment<Record<string, unknown>>(encodedHeader);
    const signingInput = `${encodedHeader}.${encodedPayload}`;
    const signature = Buffer.from(encodedSignature, 'base64url');

    expect(header).toMatchObject({
      alg: 'RS256',
      typ: 'JWT'
    });
    expect(cryptoVerify('RSA-SHA256', Buffer.from(signingInput), publicKey, signature)).toBe(true);
  });

  it('rejects invalid credentials', async () => {
    process.env.CONTROL_PLANE_AUTH_USERNAME = 'ops';
    process.env.CONTROL_PLANE_AUTH_PASSWORD = 'super-secret';
    process.env.CONTROL_PLANE_JWT_ISSUER = 'https://issuer.example';
    process.env.CONTROL_PLANE_JWT_SECRET = 'gateway-secret';

    await expect(
      issueOperatorSessionToken({
        username: 'ops',
        password: 'wrong-secret'
      })
    ).rejects.toMatchObject({
      message: 'session_auth_invalid_credentials'
    });
  });
});
