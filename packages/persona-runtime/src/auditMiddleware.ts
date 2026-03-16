import { IncomingMessage, ServerResponse } from 'node:http';

export const auditMiddleware = async (req: IncomingMessage & { context?: { traceId?: string } }, _res: ServerResponse, next: () => Promise<void>) => {
  const start = Date.now();
  await next();
  void start;
};
