import { McpRequest, McpResponse, Transport } from '../types.js';

export class SseTransport implements Transport {
  private readonly endpoint: string;
  private readonly timeoutMs: number;
  private readonly retries: number;

  constructor(
    endpoint: string,
    options: { timeoutMs?: number; retries?: number; streamPath?: string } = {}
  ) {
    this.endpoint = endpoint;
    this.timeoutMs = Math.max(250, Math.min(120_000, options.timeoutMs || 12_000));
    this.retries = Math.max(0, Math.min(5, options.retries || 0));
    this.streamPath = options.streamPath || '/stream';
  }

  private readonly streamPath: string;

  private parseSsePayload(payloadText: string): McpResponse | null {
    const dataLines = payloadText
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.replace(/^data:\s*/, ''));

    for (const data of dataLines.reverse()) {
      if (!data || data === '[DONE]') continue;
      try {
        const parsed = JSON.parse(data) as McpResponse;
        if (parsed && typeof parsed === 'object' && typeof parsed.id === 'string') {
          return parsed;
        }
      } catch {
        continue;
      }
    }
    return null;
  }

  private async request(message: McpRequest, endpoint: string): Promise<McpResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'text/event-stream, application/json' },
        body: JSON.stringify(message),
        signal: controller.signal
      });

      if (!response.ok) {
        return { id: message.id, error: { code: `sse_${response.status}`, message: response.statusText } };
      }

      const contentType = response.headers.get('content-type') || '';
      const payload = await response.text();
      if (contentType.includes('text/event-stream')) {
        const sseResponse = this.parseSsePayload(payload);
        if (sseResponse) {
          return sseResponse;
        }
      }

      try {
        const parsed = JSON.parse(payload) as McpResponse;
        if (parsed && typeof parsed.id === 'string') {
          return parsed;
        }
      } catch {
        // noop
      }

      if (!payload.trim()) {
        return { id: message.id, error: { code: 'sse_empty', message: 'empty SSE body' } };
      }
      return { id: message.id, result: payload };
    } finally {
      clearTimeout(timeout);
    }
  }

  async send(message: McpRequest): Promise<McpResponse> {
    const baseEndpoint = this.endpoint.replace(/\/+$/, '');
    const endpoint = `${baseEndpoint}${this.streamPath}`;
    for (let attempt = 0; attempt <= this.retries; attempt += 1) {
      try {
        const response = await this.request(message, endpoint);
        const isTransientCode = response.error !== undefined && /^sse_5\d\d$/.test(response.error.code);
        if (response.error && isTransientCode && attempt < this.retries) {
          await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
          continue;
        }
        return response;
      } catch (error) {
        if (attempt >= this.retries) {
          return {
            id: message.id,
            error: {
              code: 'sse_transport_error',
              message: String(error)
            }
          };
        }
        await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
      }
    }

    return {
      id: message.id,
      error: {
        code: 'sse_unreachable',
        message: 'SSE transport could not complete request'
      }
    };
  }

  async close(): Promise<void> {
    return;
  }
}
