export const dynamic = 'force-dynamic';

const sessionCookieName = 'cognitive_ai_access_token';
const blockedRequestHeaders = new Set([
  'connection',
  'content-length',
  'cookie',
  'host',
  'x-auth-subject',
  'x-auth-roles',
  'x-auth-token-type',
  'x-authenticated',
  'x-principal-email',
  'x-tenant-id',
  'x-user-id',
  'x-forwarded-for',
  'x-forwarded-host',
  'x-forwarded-port',
  'x-forwarded-proto'
]);

const blockedResponseHeaders = new Set(['content-length', 'content-encoding', 'transfer-encoding', 'set-cookie']);

const upstreamBaseUrl = (): string | null => {
  const configured = process.env.COGNITIVE_API_GATEWAY_URL?.trim();
  return configured && configured.length > 0 ? configured.replace(/\/+$/, '') : null;
};

const readSessionToken = (request: Request): string => {
  const cookieHeader = request.headers.get('cookie') || '';
  for (const part of cookieHeader.split(';')) {
    const [rawName, ...rawValue] = part.split('=');
    if (rawName?.trim() !== sessionCookieName) continue;
    const value = rawValue.join('=').trim();
    if (!value) return '';
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  return '';
};

const filteredRequestHeaders = (request: Request): Headers => {
  const headers = new Headers();

  request.headers.forEach((value, key) => {
    if (blockedRequestHeaders.has(key.toLowerCase())) return;
    headers.set(key, value);
  });

  if (!headers.has('authorization')) {
    const sessionToken = readSessionToken(request);
    if (sessionToken.length > 0) {
      headers.set('authorization', `Bearer ${sessionToken}`);
    }
  }

  return headers;
};

const filteredResponseHeaders = (headers: Headers): Headers => {
  const next = new Headers(headers);
  for (const header of blockedResponseHeaders) {
    next.delete(header);
  }
  return next;
};

const upstreamUrlForRequest = (request: Request): URL => {
  const base = upstreamBaseUrl();
  if (!base) {
    throw new Error('missing_gateway_upstream');
  }

  const incoming = new URL(request.url);
  const upstream = new URL(base);
  const strippedPath = incoming.pathname.replace(/^\/api/, '') || '/';
  upstream.pathname = `${upstream.pathname.replace(/\/+$/, '')}${strippedPath}`;
  upstream.search = incoming.search;
  return upstream;
};

const forward = async (request: Request): Promise<Response> => {
  const upstreamBase = upstreamBaseUrl();
  if (!upstreamBase) {
    return Response.json(
      {
        message: 'Gateway upstream is not configured.',
        reasonCode: 'gateway_upstream_missing'
      },
      { status: 500 }
    );
  }

  const method = request.method.toUpperCase();
  const init: RequestInit = {
    method,
    headers: filteredRequestHeaders(request),
    redirect: 'manual'
  };

  if (method !== 'GET' && method !== 'HEAD') {
    init.body = await request.arrayBuffer();
  }

  const response = await fetch(upstreamUrlForRequest(request), init);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: filteredResponseHeaders(response.headers)
  });
};

export async function GET(request: Request) {
  return forward(request);
}

export async function POST(request: Request) {
  return forward(request);
}

export async function PUT(request: Request) {
  return forward(request);
}

export async function PATCH(request: Request) {
  return forward(request);
}

export async function DELETE(request: Request) {
  return forward(request);
}

export async function OPTIONS(request: Request) {
  return forward(request);
}

export async function HEAD(request: Request) {
  return forward(request);
}
