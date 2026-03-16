import { McpRequest, McpResponse, Transport, ClientConfig } from './types.js';
import { randomUUID } from 'node:crypto';

export class McpClient {
  constructor(private readonly transport: Transport, private readonly config: ClientConfig = {}) {}

  async callMethod(method: string, params?: Record<string, unknown>): Promise<McpResponse> {
    const requestId = randomUUID();
    const effectiveMethod = method.trim();
    const message: McpRequest = {
      id: requestId,
      method: effectiveMethod,
      params
    };

    const timeout = this.config.toolTimeoutMs ?? 15_000;
    const transportTimeout = this.config.transportTimeoutMs ?? timeout;
    const deadlineMs = Math.max(100, Math.min(60_000, transportTimeout));
    const retries = Math.max(0, Math.min(5, this.config.retries ?? 0));
    const headers = this.config.headers ?? {};
    const requestEnvelope = { ...message, headers, userAgent: this.config.userAgent };
    const timeoutMessage = `MCP call timeout ${effectiveMethod} (${deadlineMs}ms)`;

    let lastError: string | undefined;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        if (!requestEnvelope.method) {
          throw new Error('mcp_method_missing');
        }

        const response = await Promise.race([
          this.transport.send(requestEnvelope),
          new Promise<never>((_resolve, reject) => {
            const timer = setTimeout(() => {
              reject(new Error(timeoutMessage));
            }, deadlineMs);
            timer.unref();
          })
        ]);

        if (!response || response.id !== requestId) {
          throw new Error(`MCP response id mismatch: expected ${requestId}, received ${response ? response.id : 'undefined'}`);
        }
        if (response.error) return response;
        return response;
      } catch (error) {
        lastError = String(error);
        if (attempt >= retries) {
          throw error;
        }
        const sleepMs = 25 * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, Math.min(500, sleepMs)));
      }
    }

    throw new Error(lastError || 'MCP call failed');
  }

  async close(): Promise<void> {
    await this.transport.close();
  }
}
