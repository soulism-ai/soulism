import { IncomingMessage, OutgoingHttpHeaders, ServerResponse } from 'node:http';

export interface ReadBodyOptions {
  maxBytes?: number;
  required?: boolean;
  allowEmpty?: boolean;
}

export interface SendJsonOptions {
  headers?: OutgoingHttpHeaders;
  statusMessage?: string;
}

const DEFAULT_MAX_BYTES = 1_048_576;

const toNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : undefined;

const readBodyBuffer = async (req: IncomingMessage, maxBytes: number): Promise<Buffer> => {
  const chunks: Buffer[] = [];
  let total = 0;

  for await (const chunk of req) {
    const piece = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += piece.length;
    if (total > maxBytes) {
      throw new Error(`request_body_too_large:${total}>${maxBytes}`);
    }
    chunks.push(piece);
  }

  return chunks.length > 0 ? Buffer.concat(chunks) : Buffer.alloc(0);
};

export const readTextBody = async (req: IncomingMessage, maxBytes = DEFAULT_MAX_BYTES): Promise<string> => {
  const buffer = await readBodyBuffer(req, maxBytes);
  return buffer.toString('utf8');
};

export async function readJsonBody(
  req: IncomingMessage,
  options: ReadBodyOptions = {}
): Promise<Record<string, unknown>> {
  const maxBytes = toNumber(options.maxBytes) ?? DEFAULT_MAX_BYTES;
  const body = (await readTextBody(req, maxBytes)).trim();

  if (!body) {
    if (options.required) {
      throw new Error('request_body_empty');
    }
    if (options.allowEmpty) {
      return {};
    }
    return {};
  }

  try {
    const parsed = JSON.parse(body) as unknown;
    if (parsed && typeof parsed === 'object') {
      return parsed as Record<string, unknown>;
    }
    return { value: parsed };
  } catch (error) {
    throw new Error(`invalid_json:${String(error)}`);
  }
}

export async function readJsonBodyStrict<T extends Record<string, unknown>>(
  req: IncomingMessage,
  options: ReadBodyOptions = {}
): Promise<T> {
  const payload = await readJsonBody(req, options);
  if (!payload || typeof payload !== 'object') {
    throw new Error('json_not_object');
  }
  return payload as T;
}

export function sendJson(res: ServerResponse, status: number, body: unknown, options: SendJsonOptions = {}): void {
  const payload = JSON.stringify(body);
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  if (options.statusMessage) res.statusMessage = options.statusMessage;
  if (options.headers) {
    for (const [key, value] of Object.entries(options.headers)) {
      if (value === undefined) continue;
      res.setHeader(key, value);
    }
  }
  res.end(payload);
}

export function sendText(res: ServerResponse, status: number, body: string, contentType = 'text/plain'): void {
  res.statusCode = status;
  res.setHeader('content-type', contentType);
  res.end(body);
}

export const withBodyLimit = (value: ReadBodyOptions['maxBytes']): ReadBodyOptions => ({ maxBytes: value });
