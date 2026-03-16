import { IncomingMessage } from 'node:http';

export const tooLargeBody = (req: IncomingMessage, maxBytes: number): boolean => {
  const len = Number(req.headers['content-length'] || '0');
  return len > maxBytes;
};
