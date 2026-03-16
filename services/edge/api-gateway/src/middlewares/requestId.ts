import { IncomingMessage } from 'node:http';
import { randomUUID } from 'node:crypto';
import { createTraceContext } from '@soulism/shared/trace.js';

export const attachRequestId = (req: IncomingMessage) => {
  const headers = req.headers as Record<string, string | string[] | undefined>;
  const current = headers['x-request-id'];
  if (!current) {
    headers['x-request-id'] = randomUUID();
  }
  const trace = createTraceContext({ requestId: headers['x-request-id']?.toString() || '' });
  req.headers['x-trace-id'] = trace.traceId;
  req.headers['x-span-id'] = trace.spanId;
};
