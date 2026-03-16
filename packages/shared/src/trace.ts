import { randomUUID } from 'node:crypto';

export interface TraceContext {
  requestId: string;
  traceId: string;
  spanId: string;
  tenantId?: string;
  userId?: string;
}

export function parseTraceHeaders(headers: Record<string, string | string[] | undefined>): TraceContext {
  const pick = (name: string): string | undefined => {
    const value = headers[name] ?? headers[name.toLowerCase()];
    if (Array.isArray(value)) return value[0];
    return value;
  };

  const requestId = pick('x-request-id') ?? randomUUID();
  const traceId = pick('x-trace-id') ?? requestId;
  const spanId = pick('x-span-id') ?? randomUUID();

  return {
    requestId,
    traceId,
    spanId,
    tenantId: pick('x-tenant-id'),
    userId: pick('x-user-id')
  };
}

export function createTraceContext(overrides: Partial<TraceContext> = {}): TraceContext {
  return {
    requestId: randomUUID(),
    traceId: randomUUID(),
    spanId: randomUUID(),
    ...overrides
  };
}
