import { getOperatorSessionIssuerStatus } from '../../src/server/session-auth';

export const dynamic = 'force-dynamic';

const healthPayload = async () => ({
  service: 'web-control-plane',
  ok: true,
  ready: true,
  runtime: 'nextjs',
  gatewayConfigured: Boolean(process.env.COGNITIVE_API_GATEWAY_URL?.trim()),
  sessionIssuer: await getOperatorSessionIssuerStatus(),
  timestamp: new Date().toISOString()
});

export async function GET() {
  return Response.json(await healthPayload());
}

export async function HEAD() {
  const payload = await healthPayload();
  return new Response(null, {
    status: payload.ready ? 200 : 503,
    headers: {
      'content-type': 'application/json'
    }
  });
}
