import { McpRequest, McpResponse, Transport } from '../types.js';

interface HttpTransportOptions {
  headers?: Record<string, string>;
  timeoutMs?: number;
  retries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  backoffFactor?: number;
}

export class HttpTransport implements Transport {
  constructor(
    private readonly endpoint: string,
    private readonly options: HttpTransportOptions = {}
  ) {}

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async sendRaw(message: McpRequest): Promise<McpResponse> {
    const endpoint = this.endpoint.replace(/\/+$/, '');
    const timeoutMs = Math.max(100, Math.min(60_000, this.options.timeoutMs || 10_000));
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(endpoint, {
      method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          ...(this.options.headers || {})
        },
        body: JSON.stringify(message),
        signal: controller.signal
      });

      if (!response.ok) {
        const responseText = await response.text();
        return { id: message.id, error: { code: `http_${response.status}`, message: responseText || response.statusText } };
      }

      const payload = await response.text();
      if (!payload || payload.trim().length === 0) {
        return { id: message.id, error: { code: 'http_empty_response', message: 'empty body from MCP server' } };
      }

      let parsed: McpResponse;
      try {
        parsed = JSON.parse(payload) as McpResponse;
      } catch {
        return {
          id: message.id,
          error: { code: 'http_protocol_error', message: `unable to parse MCP response json: ${payload.slice(0, 128)}` }
        };
      }

      if (!parsed || typeof parsed.id !== 'string') {
        return { id: message.id, error: { code: 'http_protocol_error', message: 'invalid MCP response schema' } };
      }

      if (parsed.error) {
        const errorCode = typeof parsed.error.code === 'string' && parsed.error.code.length > 0 ? parsed.error.code : 'http_protocol_error';
        const errorMessage = typeof parsed.error.message === 'string' && parsed.error.message.length > 0 ? parsed.error.message : 'protocol error in transport response';
        return { id: parsed.id, error: { code: errorCode, message: errorMessage } };
      }
      return parsed;
    } finally {
      clearTimeout(timeout);
    }
  }

  async send(message: McpRequest): Promise<McpResponse> {
    const retries = Math.max(0, Math.min(5, this.options.retries || 0));
    const baseDelayMs = this.options.baseDelayMs || 100;
    const maxDelayMs = this.options.maxDelayMs || 1_000;
    const backoffFactor = this.options.backoffFactor || 1.9;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        const response = await this.sendRaw(message);
        if (!response.error || response.error.code !== 'http_502' && response.error.code !== 'http_503' && response.error.code !== 'http_504') {
          return response;
        }
      } catch (error) {
        if (attempt >= retries) {
          return { id: message.id, error: { code: 'http_network_error', message: String(error) } };
        }
      }

      const backoff = Math.min(maxDelayMs, Math.floor(baseDelayMs * Math.pow(backoffFactor, attempt)));
      await this.sleep(backoff);
    }
    return { id: message.id, error: { code: 'http_unreachable', message: 'transport unavailable after retries' } };
  }

  async close(): Promise<void> {
    return;
  }
}
