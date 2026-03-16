export interface StubbedFetchResponse {
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
}

export interface StubbedFetchRoute {
  match: string | RegExp | ((url: string) => boolean);
  response: StubbedFetchResponse | (() => StubbedFetchResponse | Promise<StubbedFetchResponse>);
}

const normalizeFetchUrl = (input: string | URL | Request): string => {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
};

const matchesRoute = (route: StubbedFetchRoute['match'], url: string): boolean => {
  if (typeof route === 'string') return route === url;
  if (route instanceof RegExp) return route.test(url);
  return route(url);
};

const toResponse = (payload: StubbedFetchResponse): Response => {
  const status = payload.status ?? 200;
  const headers = new Headers(payload.headers ?? {});
  if (!headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }

  const body =
    payload.body === undefined
      ? ''
      : typeof payload.body === 'string'
      ? payload.body
      : JSON.stringify(payload.body);

  return new Response(body, {
    status,
    headers
  });
};

export const withStubbedFetch = async <T>(
  routes: StubbedFetchRoute[],
  run: () => Promise<T>
): Promise<T> => {
  const originalFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const url = normalizeFetchUrl(input);
    for (const route of routes) {
      if (!matchesRoute(route.match, url)) continue;
      const payload = typeof route.response === 'function' ? await route.response() : route.response;
      return toResponse(payload);
    }
    return originalFetch(input, init);
  };

  try {
    return await run();
  } finally {
    globalThis.fetch = originalFetch;
  }
};
