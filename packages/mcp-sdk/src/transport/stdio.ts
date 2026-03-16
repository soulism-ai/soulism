import { createInterface } from 'node:readline';
import { McpRequest, McpResponse, Transport } from '../types.js';

interface StdioTransportOptions {
  timeoutMs?: number;
}

type Resolver = {
  resolve: (response: McpResponse) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

export class StdioTransport implements Transport {
  private readonly input = process.stdin;
  private readonly output = process.stdout;
  private readonly options: StdioTransportOptions;
  private readonly pending = new Map<string, Resolver>();
  private closed = false;

  constructor(options: StdioTransportOptions = {}) {
    this.options = options;
    this.initParser();
  }

  private initParser(): void {
    const rl = createInterface({
      input: this.input
    });

    const processLine = (line: string): void => {
      const normalized = line.trim();
      if (!normalized) return;
      let response: unknown;
      try {
        response = JSON.parse(normalized);
      } catch {
        return;
      }
      if (!response || typeof response !== 'object' || Array.isArray(response)) return;
      const parsed = response as { id?: string };
      const responseId = parsed.id;
      if (!responseId) return;
      const matcher = this.pending.get(responseId);
      if (!matcher) return;

      matcher.resolve(parsed as McpResponse);
      clearTimeout(matcher.timer);
      this.pending.delete(responseId);
    };

    rl.on('line', processLine);
    rl.on('close', () => {
      for (const resolver of this.pending.values()) {
        clearTimeout(resolver.timer);
        resolver.reject(new Error('stdio transport closed'));
      }
      this.pending.clear();
      this.closed = true;
    });
  }

  async send(message: McpRequest): Promise<McpResponse> {
    if (this.closed) throw new Error('stdio transport is closed');

    const requestId = message.id;
    const timeoutMs = Math.max(250, Math.min(60_000, this.options.timeoutMs || 10_000));
    return new Promise<McpResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`stdio request timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pending.set(requestId, {
        resolve: (response) => {
          resolve(response);
        },
        reject,
        timer
      });

      const encoded = JSON.stringify(message);
      this.output.write(encoded + '\n');
    });
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    for (const resolver of this.pending.values()) {
      clearTimeout(resolver.timer);
      resolver.reject(new Error('stdio transport closing'));
    }
    this.pending.clear();
    this.input.removeAllListeners();
    this.input.unref?.();
    this.output.cork?.();
    this.output.uncork?.();
  }
}
