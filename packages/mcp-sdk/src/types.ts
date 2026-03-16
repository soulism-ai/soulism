export type TransportType = 'stdio' | 'http' | 'sse';

export interface McpRequest {
  id: string;
  method: string;
  params?: Record<string, unknown>;
}

export interface McpResponse {
  id: string;
  result?: unknown;
  error?: {
    code: string;
    message: string;
  };
}

export interface Transport {
  send(message: McpRequest): Promise<McpResponse>;
  close(): Promise<void>;
  metadata?(): {
    transport: TransportType;
    endpoint?: string;
  };
}

export interface ClientConfig {
  toolTimeoutMs?: number;
  transportTimeoutMs?: number;
  retries?: number;
  retryBaseDelayMs?: number;
  retryMaxDelayMs?: number;
  retryBackoffMultiplier?: number;
  headers?: Record<string, string>;
  userAgent?: string;
}
