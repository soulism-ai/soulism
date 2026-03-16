import { getOperatorSessionIssuerStatus } from '../../src/server/session-auth';

export const dynamic = 'force-dynamic';

const upstreamBaseUrl = (): string | null => {
  const configured = process.env.COGNITIVE_API_GATEWAY_URL?.trim();
  return configured && configured.length > 0 ? configured.replace(/\/+$/, '') : null;
};

const readinessPayload = async () => {
  const timestamp = new Date().toISOString();
  const gatewayUrl = upstreamBaseUrl();
  const sessionIssuer = await getOperatorSessionIssuerStatus();

  if (sessionIssuer.required && !sessionIssuer.ready) {
    return {
      service: 'web-control-plane',
      ok: false,
      ready: false,
      runtime: 'nextjs',
      timestamp,
      errors: sessionIssuer.issues.map((issue) => `session_issuer:${issue}`),
      checks: [
        {
          name: 'session-issuer',
          ok: false,
          required: true,
          error: sessionIssuer.issues.join(',')
        }
      ],
      sessionIssuer
    };
  }

  if (!gatewayUrl) {
    return {
      service: 'web-control-plane',
      ok: false,
      ready: false,
      runtime: 'nextjs',
      timestamp,
      errors: ['gateway_upstream_missing'],
      checks: [
        {
          name: 'api-gateway',
          ok: false,
          required: true,
          error: 'gateway_upstream_missing'
        },
        {
          name: 'session-issuer',
          ok: sessionIssuer.ready,
          required: sessionIssuer.required,
          error: sessionIssuer.ready ? undefined : sessionIssuer.issues.join(',')
        }
      ],
      sessionIssuer
    };
  }

  try {
    const response = await fetch(`${gatewayUrl}/ready`, {
      method: 'GET',
      headers: {
        accept: 'application/json'
      }
    });
    const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; ready?: boolean; errors?: string[] };
    const dependencyReady = response.ok && payload.ok !== false && payload.ready !== false;

    return {
      service: 'web-control-plane',
      ok: dependencyReady && (!sessionIssuer.required || sessionIssuer.ready),
      ready: dependencyReady && (!sessionIssuer.required || sessionIssuer.ready),
      runtime: 'nextjs',
      timestamp,
      errors:
        dependencyReady && (!sessionIssuer.required || sessionIssuer.ready)
          ? undefined
          : [
              ...(payload.errors ?? [`gateway_ready_http_${response.status}`]),
              ...(!sessionIssuer.required || sessionIssuer.ready ? [] : sessionIssuer.issues.map((issue) => `session_issuer:${issue}`))
            ],
      checks: [
        {
          name: 'api-gateway',
          ok: dependencyReady,
          required: true,
          target: `${gatewayUrl}/ready`,
          status: response.status
        },
        {
          name: 'session-issuer',
          ok: sessionIssuer.ready,
          required: sessionIssuer.required,
          error: sessionIssuer.ready ? undefined : sessionIssuer.issues.join(',')
        }
      ],
      sessionIssuer
    };
  } catch (error) {
    return {
      service: 'web-control-plane',
      ok: false,
      ready: false,
      runtime: 'nextjs',
      timestamp,
      errors: [String(error)],
      checks: [
        {
          name: 'api-gateway',
          ok: false,
          required: true,
          target: `${gatewayUrl}/ready`,
          error: String(error)
        },
        {
          name: 'session-issuer',
          ok: sessionIssuer.ready,
          required: sessionIssuer.required,
          error: sessionIssuer.ready ? undefined : sessionIssuer.issues.join(',')
        }
      ],
      sessionIssuer
    };
  }
};

export async function GET() {
  const payload = await readinessPayload();
  return Response.json(payload, { status: payload.ready ? 200 : 503 });
}

export async function HEAD() {
  const payload = await readinessPayload();
  return new Response(null, {
    status: payload.ready ? 200 : 503,
    headers: {
      'content-type': 'application/json'
    }
  });
}
