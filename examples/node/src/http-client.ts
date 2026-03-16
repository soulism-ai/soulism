const baseUrl = (process.env.GATEWAY_URL ?? 'http://localhost:8080').replace(/\/$/, '');

const headers: Record<string, string> = {
  'content-type': 'application/json',
  'x-api-key': process.env.API_KEY ?? 'local-dev-key',
  'x-user-id': 'example-user',
  'x-tenant-id': 'example-tenant',
  'x-persona-id': 'default'
};

const getJson = async (path: string) => {
  const res = await fetch(`${baseUrl}${path}`, { headers });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
};

const postJson = async (path: string, payload: unknown) => {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
};

const run = async () => {
  const health = await getJson('/health');
  const ready = await getJson('/ready');
  const policy = await postJson('/policy/check', {
    personaId: 'default',
    userId: 'example-user',
    tenantId: 'example-tenant',
    tool: 'tool:webfetch',
    action: 'fetch',
    riskClass: 'low',
    traceId: 'node-http-example'
  });

  console.log(
    JSON.stringify(
      {
        health,
        ready,
        policy
      },
      null,
      2
    )
  );
};

void run();
