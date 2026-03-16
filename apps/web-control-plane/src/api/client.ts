import type {
  AuditEvent,
  AuthIdentity,
  BudgetListResponse,
  HealthReport,
  PersonaRecord,
  PolicyCheckRequest,
  PolicyCheckResponse,
  SigningPostureStatus,
  ServiceMetricsSummary
} from './types';
import { defaultGatewayServiceUrl } from '../config';

export interface ApiClientOptions {
  gatewayServiceUrl?: string;
  authToken?: string;
}

const defaultOptions = (): Required<ApiClientOptions> => ({
  gatewayServiceUrl: defaultGatewayServiceUrl(),
  authToken: ''
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isHealthReport = (value: unknown): value is HealthReport =>
  isRecord(value) && typeof value.service === 'string' && typeof value.ok === 'boolean';

const parseJson = async <T>(response: Response): Promise<T> => {
  const raw = await response.text();
  if (!raw) {
    return {} as T;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    return { message: raw } as T;
  }
};

const errorMessage = (payload: unknown, status: number): string => {
  if (!isRecord(payload)) return `Request failed ${status}`;
  return (
    (typeof payload.message === 'string' && payload.message) ||
    (typeof payload.error === 'string' && payload.error) ||
    (typeof payload.reason === 'string' && payload.reason) ||
    `Request failed ${status}`
  );
};

export class ControlPlaneClient {
  private options: Required<ApiClientOptions>;

  constructor(options?: ApiClientOptions) {
    this.options = {
      ...defaultOptions(),
      ...(options ?? {})
    };
  }

  private authHeaders(headers: HeadersInit = {}): Headers {
    const next = new Headers(headers);
    if (this.options.authToken.trim().length > 0) {
      next.set('authorization', `Bearer ${this.options.authToken.trim()}`);
    }
    return next;
  }

  private async requestDocument(path: string, init: RequestInit = {}): Promise<{ response: Response; payload: unknown }> {
    const response = await fetch(`${this.options.gatewayServiceUrl}${path}`, {
      ...init,
      credentials: this.options.gatewayServiceUrl.startsWith('/') ? 'same-origin' : init.credentials,
      headers: this.authHeaders(init.headers)
    });
    return {
      response,
      payload: await parseJson(response)
    };
  }

  private async requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
    const { response, payload } = await this.requestDocument(path, init);
    if (!response.ok) {
      throw new Error(errorMessage(payload, response.status));
    }
    return payload as T;
  }

  async authMe(): Promise<AuthIdentity> {
    return this.requestJson<AuthIdentity>('/auth/me');
  }

  async health(service: string): Promise<HealthReport> {
    const { response, payload } = await this.requestDocument(`/admin/services/${encodeURIComponent(service)}/status`);
    if (isHealthReport(payload)) {
      return payload;
    }
    throw new Error(errorMessage(payload, response.status));
  }

  async metrics(service: string): Promise<ServiceMetricsSummary> {
    return this.requestJson<ServiceMetricsSummary>(`/admin/services/${encodeURIComponent(service)}/metrics`);
  }

  async signingStatus(): Promise<SigningPostureStatus> {
    return this.requestJson<SigningPostureStatus>('/admin/signing/status');
  }

  async personas(): Promise<PersonaRecord[]> {
    const payload = await this.requestJson<{ personas: PersonaRecord[] }>('/personas');
    return payload.personas ?? [];
  }

  async effectivePersona(personaId: string): Promise<PersonaRecord | null> {
    return this.requestJson<PersonaRecord | null>(`/personas/${encodeURIComponent(personaId)}/effective`);
  }

  async policyCheck(payload: Omit<PolicyCheckRequest, 'traceId'>): Promise<PolicyCheckResponse> {
    return this.requestJson<PolicyCheckResponse>('/policy/check', {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        ...payload,
        traceId: globalThis.crypto?.randomUUID?.() ?? `trace-${Date.now()}`
      })
    });
  }

  async auditEvents(filters: { principal?: string; service?: string } = {}): Promise<AuditEvent[]> {
    const qs = new URLSearchParams();
    if (filters.principal) qs.set('principal', filters.principal);
    if (filters.service) qs.set('service', filters.service);
    return this.requestJson<AuditEvent[]>(`/audit/events${qs.toString() ? `?${qs}` : ''}`);
  }

  async budgets(): Promise<BudgetListResponse> {
    const payload = await this.requestJson<BudgetListResponse | BudgetListResponse['budgets']>('/budgets');
    return Array.isArray(payload)
      ? { budgets: payload }
      : payload ?? {};
  }
}
