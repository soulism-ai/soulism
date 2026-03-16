export interface AuditEmitInput {
  service: string;
  action: string;
  principal: string;
  traceId?: string;
  riskClass?: string;
  personaId?: string;
  resource?: string;
  metadata?: Record<string, unknown>;
}

const defaultAuditSchemaVersion = '1.0.0';

const limitObject = (value: unknown): Record<string, unknown> | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const input = value as Record<string, unknown>;
  const entries = Object.entries(input).slice(0, 40);
  return Object.fromEntries(entries);
};

const normalizePrincipal = (value: unknown): string => {
  if (typeof value === 'string' && value.trim().length > 0) return value;
  return 'unknown';
};

const toAuditPayload = (entry: AuditEmitInput) => ({
  schemaVersion: defaultAuditSchemaVersion,
  id: `audit-${Date.now().toString(36)}-${Math.floor(Math.random() * 1_000_000).toString(16)}`,
  service: entry.service,
  action: entry.action,
  principal: normalizePrincipal(entry.principal),
  traceId: entry.traceId,
  riskClass: entry.riskClass,
  personaId: entry.personaId,
  resource: entry.resource,
  metadata: limitObject(entry.metadata),
  timestamp: new Date().toISOString(),
  prevHash: '',
  hash: ''
});

export const emitAuditEvent = async (
  auditServiceUrl: string | undefined,
  event: AuditEmitInput,
  timeoutMs = 1000
): Promise<boolean> => {
  if (!auditServiceUrl) return false;
  const trimmed = auditServiceUrl.trim().replace(/\/$/, '');
  if (!trimmed) return false;

  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, Math.max(150, Math.min(timeoutMs, 5000)));

  try {
    const response = await fetch(`${trimmed}/audit/events`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify(toAuditPayload(event)),
      signal: controller.signal
    });

    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
};
