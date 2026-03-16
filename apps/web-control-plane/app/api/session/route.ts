import { cookies } from 'next/headers';
import { isSessionAuthError, issueOperatorSessionToken } from '../../../src/server/session-auth';

export const dynamic = 'force-dynamic';

const sessionCookieName = 'cognitive_ai_access_token';
const sessionMaxAgeSeconds = 60 * 60 * 12;
const gatewayUpstreamUrl = (): string | null => {
  const configured = process.env.COGNITIVE_API_GATEWAY_URL?.trim();
  return configured && configured.length > 0 ? configured.replace(/\/+$/, '') : null;
};

const sameOriginRequest = (request: Request): boolean => {
  const origin = request.headers.get('origin');
  if (!origin) return true;

  try {
    return origin === new URL(request.url).origin;
  } catch {
    return false;
  }
};

const rejectCrossOrigin = () =>
  Response.json(
    {
      message: 'Cross-origin session mutation is not allowed.',
      reasonCode: 'cross_origin_forbidden'
    },
    { status: 403 }
  );

const noStoreHeaders = {
  headers: {
    'cache-control': 'no-store'
  }
} as const;

const validateGatewayToken = async (token: string): Promise<Response | null> => {
  const gatewayUrl = gatewayUpstreamUrl();
  if (!gatewayUrl) {
    return Response.json(
      {
        message: 'Gateway upstream is not configured.',
        reasonCode: 'gateway_upstream_missing'
      },
      { status: 503 }
    );
  }

  const upstreamResponse = await fetch(`${gatewayUrl}/auth/me`, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/json'
    }
  });

  if (upstreamResponse.ok) return null;

  const payload = (await upstreamResponse.json().catch(() => ({}))) as { message?: string; error?: string; reasonCode?: string };
  return Response.json(
    {
      message: payload.message || payload.error || 'Token validation failed.',
      reasonCode: payload.reasonCode || 'invalid_token'
    },
    {
      status: upstreamResponse.status === 401 || upstreamResponse.status === 403 ? upstreamResponse.status : 502,
      headers: {
        'cache-control': 'no-store'
      }
    }
  );
};

const writeSessionCookie = async (token: string) => {
  const store = await cookies();
  store.set(sessionCookieName, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: sessionMaxAgeSeconds
  });
};

const clearSessionCookie = async () => {
  const store = await cookies();
  store.delete(sessionCookieName);
};

const sessionErrorResponse = (error: unknown): Response => {
  if (!isSessionAuthError(error)) {
    return Response.json(
      {
        message: 'Session token issuance failed.',
        reasonCode: 'session_issue_failed'
      },
      {
        status: 500,
        headers: {
          'cache-control': 'no-store'
        }
      }
    );
  }

  const status = error.code === 'session_auth_invalid_credentials' ? 401 : 500;
  const message =
    error.code === 'session_auth_invalid_credentials'
      ? 'Invalid operator credentials.'
      : 'Operator token issuance is not configured for this deployment.';

  return Response.json(
    {
      message,
      reasonCode: error.code
    },
    {
      status,
      headers: {
        'cache-control': 'no-store'
      }
    }
  );
};

export async function POST(request: Request) {
  if (!sameOriginRequest(request)) {
    return rejectCrossOrigin();
  }

  const body = (await request.json().catch(() => ({}))) as {
    token?: unknown;
    username?: unknown;
    password?: unknown;
    includeToken?: unknown;
    persistCookie?: unknown;
  };
  const token = typeof body.token === 'string' ? body.token.trim() : '';
  const persistCookie = body.persistCookie !== false;

  if (token.length === 0) {
    const username = typeof body.username === 'string' ? body.username.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';

    if (username.length === 0 && password.length === 0) {
      await clearSessionCookie();
      return Response.json({ ok: true, authenticated: false }, noStoreHeaders);
    }

    try {
      const issued = await issueOperatorSessionToken({
        username,
        password
      });

      const validationError = await validateGatewayToken(issued.token);
      if (validationError) {
        return validationError;
      }

      if (persistCookie) {
        await writeSessionCookie(issued.token);
      } else {
        await clearSessionCookie();
      }

      return Response.json(
        {
          ok: true,
          authenticated: true,
          ...(body.includeToken === true ? { token: issued.token, expiresAt: issued.expiresAt } : {})
        },
        noStoreHeaders
      );
    } catch (error) {
      return sessionErrorResponse(error);
    }
  }

  const validationError = await validateGatewayToken(token);
  if (validationError) {
    return validationError;
  }

  if (persistCookie) {
    await writeSessionCookie(token);
  } else {
    await clearSessionCookie();
  }

  return Response.json({ ok: true, authenticated: true }, noStoreHeaders);
}

export async function DELETE(request: Request) {
  if (!sameOriginRequest(request)) {
    return rejectCrossOrigin();
  }

  await clearSessionCookie();
  return Response.json({ ok: true, authenticated: false }, noStoreHeaders);
}
