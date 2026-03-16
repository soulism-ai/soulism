export interface HealthReport {
  service: string;
  ok: boolean;
  ready?: boolean;
  errors?: string[];
  latencyMs?: number;
  checks?: {
    name: string;
    ok: boolean;
    required: boolean;
    target?: string;
    status?: number;
    latencyMs?: number;
    error?: string;
    skipped?: boolean;
  }[];
  [key: string]: unknown;
}

export interface RouteMetricsSummary {
  route: string;
  requests: number;
  errors: number;
  errorRate: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  lastStatusCode: number;
  lastTraceId?: string;
}

export interface HttpRequestMetricSample {
  traceId?: string;
  method: string;
  route: string;
  statusCode: number;
  latencyMs: number;
  timestamp: string;
}

export interface ServiceMetricsSummary {
  service: string;
  generatedAt: string;
  totals: {
    requests: number;
    errors: number;
  };
  errorRate: number;
  latency: {
    avgMs: number;
    p50Ms: number;
    p95Ms: number;
    maxMs: number;
  };
  statusCounts: Record<string, number>;
  metrics: Record<string, number>;
  routes: RouteMetricsSummary[];
  recentRequests: HttpRequestMetricSample[];
}

export interface KmsProviderSigningStatus {
  provider: 'aws' | 'gcp' | 'azure';
  enabled: boolean;
  keyId?: string;
  ready: boolean;
  mock: boolean;
  source: string;
  allowMockInCi: boolean;
  publicKeyPresent: boolean;
  error?: string;
}

export interface SigningRotationChannelStatus {
  channel: string;
  currentKeyId: string;
  previousKeyId?: string;
  rotatedAt: string;
  ageDays: number;
  rotationIntervalDays: number;
  overdue: boolean;
  providerCoverage: Array<'aws' | 'gcp' | 'azure'>;
}

export interface SigningPostureStatus {
  mode: 'dev' | 'strict' | 'enforced';
  productionMode: boolean;
  strictSigning: boolean;
  publicKeyConfigured: boolean;
  publicKeySource: 'path' | 'env' | 'none';
  publicKeyPath?: string;
  providers: KmsProviderSigningStatus[];
  channels: SigningRotationChannelStatus[];
  issues: string[];
  ready: boolean;
  generatedAt: string;
  policyPaths: {
    kmsProviders: string;
    rotation: string;
  };
}

export interface PersonaRecord {
  id: string;
  name?: string;
  pack?: {
    persona?: Record<string, unknown>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface AuthIdentity {
  authenticated: boolean;
  subject: string;
  tenantId: string;
  personaId?: string;
  email?: string;
  roles: string[];
  issuer?: string;
  tokenType: 'anonymous' | 'api-key' | 'jwt';
  claims?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface PolicyCheckRequest {
  personaId: string;
  userId: string;
  tenantId: string;
  tool: string;
  action: string;
  riskClass: 'low' | 'medium' | 'high' | 'critical';
  traceId: string;
}

export interface PolicyCheckResponse {
  state: 'allow' | 'confirm' | 'deny';
  reasonCode: string;
  reason?: string;
  requirements: {
    type: string;
    message: string;
    value?: string | number | boolean;
  }[];
  budgetSnapshot: {
    remainingBudget: number;
    maxBudget: number;
    windowStart: string;
    windowEnd: string;
  };
  traceId?: string;
  policyVersion?: string;
  decisionId?: string;
  schemaVersion?: string;
  issuedAt?: string;
  [key: string]: unknown;
}

export interface AuditEvent {
  id: string;
  principal: string;
  service: string;
  action: string;
  traceId?: string;
  timestamp: string;
  schemaVersion?: string;
  resource?: string;
  principalName?: string;
  policyTraceId?: string;
  [key: string]: unknown;
}

export interface BudgetSnapshot {
  remainingBudget: number;
  maxBudget: number;
  windowStart: string;
  windowEnd: string;
}

export interface BudgetEntry {
  key: string;
  remainingBudget: number;
  maxBudget: number;
  windowStart: string;
  windowEnd: string;
  max?: number;
  remaining?: number;
  riskClass?: string;
}

export interface BudgetListResponse {
  budgets?: BudgetEntry[];
  service?: string;
  [key: string]: unknown;
}
