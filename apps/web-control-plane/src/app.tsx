'use client';

import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { ControlPlaneClient } from './api/client';
import { summarizeObservability } from './api/observability';
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
} from './api/types';
import { AuditViewer } from './components/AuditViewer';
import { HealthPanel } from './components/HealthPanel';
import { ObservabilityPanel } from './components/ObservabilityPanel';
import { PersonaPicker } from './components/PersonaPicker';
import { PolicyConsole } from './components/PolicyConsole';
import { SigningStatusPanel } from './components/SigningStatusPanel';
import { defaultGatewayServiceUrl } from './config';

const storageKey = 'soulism.control-plane.session';
const defaultGatewayUrl = defaultGatewayServiceUrl();
const serviceKeys = ['gateway', 'policy', 'risk-budget', 'persona', 'memory', 'files', 'webfetch', 'audit'] as const;

type ServiceKey = (typeof serviceKeys)[number];
type AuthStrategy = 'credentials' | 'token';
type SessionConfig = {
  gatewayServiceUrl: string;
  authToken: string;
};
type SessionDraft = SessionConfig & {
  authStrategy: AuthStrategy;
  username: string;
  password: string;
};
type StoredSessionConfig = Pick<SessionDraft, 'gatewayServiceUrl' | 'authStrategy'>;

const emptySession = (): SessionDraft => ({
  gatewayServiceUrl: defaultGatewayUrl,
  authToken: '',
  authStrategy: 'credentials',
  username: '',
  password: ''
});

const readStoredSession = (): SessionDraft | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredSessionConfig>;
    if (typeof parsed.gatewayServiceUrl !== 'string') return null;
    return {
      gatewayServiceUrl: parsed.gatewayServiceUrl,
      authToken: '',
      authStrategy: parsed.authStrategy === 'token' ? 'token' : 'credentials',
      username: '',
      password: ''
    };
  } catch {
    return null;
  }
};

const persistSession = (value: SessionDraft | SessionConfig | null): void => {
  if (typeof window === 'undefined') return;
  if (!value) {
    window.localStorage.removeItem(storageKey);
    return;
  }
  const stored: StoredSessionConfig = {
    gatewayServiceUrl: value.gatewayServiceUrl,
    authStrategy: 'authStrategy' in value ? value.authStrategy : 'credentials'
  };
  window.localStorage.setItem(storageKey, JSON.stringify(stored));
};

const isProxyGatewayUrl = (value: string): boolean => value.trim().startsWith('/');

const syncProxySessionToken = async (token: string): Promise<void> => {
  const trimmed = token.trim();
  const response = await fetch('/api/session', trimmed.length > 0
    ? {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({ token: trimmed })
      }
    : {
        method: 'DELETE'
      });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { message?: string; error?: string };
    throw new Error(body.message || body.error || `session_sync_failed_${response.status}`);
  }
};

const issueSessionToken = async (
  username: string,
  password: string,
  options: { includeToken: boolean; persistCookie: boolean }
): Promise<{ token?: string; expiresAt?: string }> => {
  const response = await fetch('/api/session', {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      username: username.trim(),
      password,
      includeToken: options.includeToken,
      persistCookie: options.persistCookie
    })
  });

  const body = (await response.json().catch(() => ({}))) as { message?: string; error?: string; token?: string; expiresAt?: string };
  if (!response.ok) {
    throw new Error(body.message || body.error || `session_issue_failed_${response.status}`);
  }

  return {
    token: typeof body.token === 'string' ? body.token : undefined,
    expiresAt: typeof body.expiresAt === 'string' ? body.expiresAt : undefined
  };
};

const requirementLabel = (requirements: PolicyCheckResponse['requirements']) =>
  requirements && requirements.length
    ? requirements.map((entry) => `${entry.type}: ${entry.message}${entry.value !== undefined ? ` (${entry.value})` : ''}`).join(', ')
    : 'no requirements';

export default function App(): JSX.Element {
  const [sessionDraft, setSessionDraft] = useState<SessionDraft>(emptySession);
  const [session, setSession] = useState<SessionConfig | null>(null);
  const [identity, setIdentity] = useState<AuthIdentity | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [personas, setPersonas] = useState<PersonaRecord[]>([]);
  const [selectedPersona, setSelectedPersona] = useState('default');
  const [effectivePersona, setEffectivePersona] = useState<PersonaRecord | null>(null);
  const [health, setHealth] = useState<Record<ServiceKey, HealthReport | undefined>>({} as Record<ServiceKey, HealthReport | undefined>);
  const [healthErrors, setHealthErrors] = useState<Record<ServiceKey, string | undefined>>({} as Record<ServiceKey, string | undefined>);
  const [healthLoading, setHealthLoading] = useState<Record<ServiceKey, boolean>>({} as Record<ServiceKey, boolean>);
  const [metrics, setMetrics] = useState<Record<ServiceKey, ServiceMetricsSummary | undefined>>({} as Record<ServiceKey, ServiceMetricsSummary | undefined>);
  const [metricsErrors, setMetricsErrors] = useState<Record<ServiceKey, string | undefined>>({} as Record<ServiceKey, string | undefined>);
  const [metricsLoading, setMetricsLoading] = useState<Record<ServiceKey, boolean>>({} as Record<ServiceKey, boolean>);
  const [policyDecision, setPolicyDecision] = useState<PolicyCheckResponse | null>(null);
  const [policyError, setPolicyError] = useState<string | null>(null);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditFilters, setAuditFilters] = useState({ principal: '', service: '' });
  const [budgets, setBudgets] = useState<BudgetListResponse>({});
  const [signingStatus, setSigningStatus] = useState<SigningPostureStatus | null>(null);
  const [signingLoading, setSigningLoading] = useState(false);
  const [signingError, setSigningError] = useState<string | null>(null);

  const client = useMemo(
    () => (session ? new ControlPlaneClient({ gatewayServiceUrl: session.gatewayServiceUrl, authToken: session.authToken }) : null),
    [session]
  );

  const activeBudgetEntries = useMemo(() => budgets.budgets ?? [], [budgets]);
  const observabilitySummary = useMemo(() => {
    return serviceKeys.reduce(
      (summary, service) => {
        if (!metrics[service]) {
          summary.pending += 1;
          return summary;
        }
        const severity = summarizeObservability(metrics[service]).severity;
        if (severity === 'critical') summary.critical += 1;
        if (severity === 'warning') summary.warning += 1;
        if (severity === 'healthy') summary.healthy += 1;
        return summary;
      },
      { critical: 0, warning: 0, healthy: 0, pending: 0 }
    );
  }, [metrics]);

  const clearData = () => {
    setIdentity(null);
    setPersonas([]);
    setSelectedPersona('default');
    setEffectivePersona(null);
    setHealth({} as Record<ServiceKey, HealthReport | undefined>);
    setHealthErrors({} as Record<ServiceKey, string | undefined>);
    setHealthLoading({} as Record<ServiceKey, boolean>);
    setMetrics({} as Record<ServiceKey, ServiceMetricsSummary | undefined>);
    setMetricsErrors({} as Record<ServiceKey, string | undefined>);
    setMetricsLoading({} as Record<ServiceKey, boolean>);
    setPolicyDecision(null);
    setPolicyError(null);
    setAuditEvents([]);
    setAuditLoading(false);
    setAuditFilters({ principal: '', service: '' });
    setBudgets({});
    setSigningStatus(null);
    setSigningLoading(false);
    setSigningError(null);
  };

  const refreshHealth = async (activeClient: ControlPlaneClient) => {
    const loading = Object.fromEntries(serviceKeys.map((service) => [service, true])) as Record<ServiceKey, boolean>;
    const nextHealth: Partial<Record<ServiceKey, HealthReport | undefined>> = {};
    const nextErrors: Partial<Record<ServiceKey, string | undefined>> = {};

    setHealthLoading((prev) => ({ ...prev, ...loading }));

    const results = await Promise.all(
      serviceKeys.map(async (service) => {
        try {
          return { service, report: await activeClient.health(service) } as const;
        } catch (error) {
          return { service, error: (error as Error).message } as const;
        }
      })
    );

    for (const result of results) {
      if ('report' in result) {
        nextHealth[result.service] = result.report;
        nextErrors[result.service] = undefined;
      } else {
        nextHealth[result.service] = undefined;
        nextErrors[result.service] = result.error;
      }
    }

    setHealth((prev) => ({ ...prev, ...nextHealth }) as Record<ServiceKey, HealthReport | undefined>);
    setHealthErrors((prev) => ({ ...prev, ...nextErrors }) as Record<ServiceKey, string | undefined>);
    setHealthLoading((prev) => ({
      ...prev,
      ...(Object.fromEntries(serviceKeys.map((service) => [service, false])) as Record<ServiceKey, boolean>)
    }));
  };

  const refreshMetrics = async (activeClient: ControlPlaneClient) => {
    const loading = Object.fromEntries(serviceKeys.map((service) => [service, true])) as Record<ServiceKey, boolean>;
    const nextMetrics: Partial<Record<ServiceKey, ServiceMetricsSummary | undefined>> = {};
    const nextErrors: Partial<Record<ServiceKey, string | undefined>> = {};

    setMetricsLoading((prev) => ({ ...prev, ...loading }));

    const results = await Promise.all(
      serviceKeys.map(async (service) => {
        try {
          return { service, metrics: await activeClient.metrics(service) } as const;
        } catch (error) {
          return { service, error: (error as Error).message } as const;
        }
      })
    );

    for (const result of results) {
      if ('metrics' in result) {
        nextMetrics[result.service] = result.metrics;
        nextErrors[result.service] = undefined;
      } else {
        nextMetrics[result.service] = undefined;
        nextErrors[result.service] = result.error;
      }
    }

    setMetrics((prev) => ({ ...prev, ...nextMetrics }) as Record<ServiceKey, ServiceMetricsSummary | undefined>);
    setMetricsErrors((prev) => ({ ...prev, ...nextErrors }) as Record<ServiceKey, string | undefined>);
    setMetricsLoading((prev) => ({
      ...prev,
      ...(Object.fromEntries(serviceKeys.map((service) => [service, false])) as Record<ServiceKey, boolean>)
    }));
  };

  const refreshBudgets = async (activeClient: ControlPlaneClient) => {
    const next = await activeClient.budgets().catch(() => ({} as BudgetListResponse));
    setBudgets(next);
  };

  const refreshAudit = async (
    activeClient: ControlPlaneClient,
    filters: { principal?: string; service?: string } = auditFilters
  ) => {
    setAuditLoading(true);
    const events = await activeClient
      .auditEvents({
        principal: filters.principal?.trim() || undefined,
        service: filters.service?.trim() || undefined
      })
      .catch(() => []);
    setAuditEvents(events);
    setAuditLoading(false);
  };

  const refreshSigningStatus = async (activeClient: ControlPlaneClient) => {
    setSigningLoading(true);
    setSigningError(null);
    try {
      const status = await activeClient.signingStatus();
      setSigningStatus(status);
    } catch (error) {
      setSigningStatus(null);
      setSigningError((error as Error).message);
    } finally {
      setSigningLoading(false);
    }
  };

  const refreshEffectivePersona = async (activeClient: ControlPlaneClient, personaId: string) => {
    const next = await activeClient.effectivePersona(personaId);
    setEffectivePersona(next);
  };

  const bootstrapSession = async (activeClient: ControlPlaneClient, activeSession: SessionConfig) => {
    const nextIdentity = await activeClient.authMe();
    setIdentity(nextIdentity);
    persistSession(activeSession);

    const listed = await activeClient.personas().catch(() => []);
    setPersonas(listed);
    const preferredPersona =
      (nextIdentity.personaId && listed.some((persona) => persona.id === nextIdentity.personaId) ? nextIdentity.personaId : undefined) ??
      listed[0]?.id ??
      nextIdentity.personaId ??
      'default';
    setSelectedPersona(preferredPersona);

    await Promise.all([
      refreshEffectivePersona(activeClient, preferredPersona).catch(() => setEffectivePersona(null)),
      refreshHealth(activeClient),
      refreshMetrics(activeClient),
      refreshBudgets(activeClient),
      refreshAudit(activeClient),
      refreshSigningStatus(activeClient)
    ]);
  };

  const runPolicyCheck = async (activeClient: ControlPlaneClient, payload: Omit<PolicyCheckRequest, 'traceId'>) => {
    setPolicyError(null);
    const decision = await activeClient.policyCheck(payload);
    setPolicyDecision(decision);
    await refreshBudgets(activeClient);
  };

  useEffect(() => {
    const stored = readStoredSession();
    if (!stored) return;
    setSessionDraft(stored);
    setSession({
      gatewayServiceUrl: stored.gatewayServiceUrl,
      authToken: ''
    });
  }, []);

  useEffect(() => {
    if (!client || !session) return;

    let cancelled = false;
    setAuthLoading(true);
    setAuthError(null);

    const run = async () => {
      try {
        await bootstrapSession(client, session);
      } catch (error) {
        if (cancelled) return;
        clearData();
        if (isProxyGatewayUrl(session.gatewayServiceUrl)) {
          void syncProxySessionToken('').catch(() => {});
        }
        persistSession(null);
        setSession(null);
        setAuthError((error as Error).message);
      } finally {
        if (!cancelled) {
          setAuthLoading(false);
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [client, session]);

  useEffect(() => {
    if (!client || !identity || !selectedPersona) return;
    void refreshEffectivePersona(client, selectedPersona);
  }, [client, identity, selectedPersona]);

  useEffect(() => {
    if (!client || !identity) return;
    const interval = setInterval(() => {
      void Promise.all([refreshHealth(client), refreshMetrics(client)]);
      void refreshSigningStatus(client);
    }, 10000);
    return () => {
      clearInterval(interval);
    };
  }, [client, identity]);

  const onSignIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    clearData();
    setAuthError(null);
    setAuthLoading(true);

    const gatewayServiceUrl = sessionDraft.gatewayServiceUrl.trim() || defaultGatewayUrl;
    const proxySession = isProxyGatewayUrl(gatewayServiceUrl);

    try {
      if (sessionDraft.authStrategy === 'credentials') {
        const issued = await issueSessionToken(sessionDraft.username, sessionDraft.password, {
          includeToken: !proxySession,
          persistCookie: proxySession
        });
        const nextToken = proxySession ? '' : issued.token?.trim() ?? '';

        if (!proxySession && nextToken.length === 0) {
          throw new Error('Session issuer did not return a token for the direct gateway session.');
        }

        setSessionDraft((prev) => ({
          ...prev,
          authToken: '',
          password: ''
        }));
        setSession({
          gatewayServiceUrl,
          authToken: nextToken
        });
        return;
      }

      const authToken = sessionDraft.authToken.trim();
      if (proxySession) {
        await syncProxySessionToken(authToken);
      }

      setSession({
        gatewayServiceUrl,
        authToken: proxySession ? '' : authToken
      });
    } catch (error) {
      setAuthLoading(false);
      setAuthError((error as Error).message);
    }
  };

  const onSignOut = () => {
    if (session && isProxyGatewayUrl(session.gatewayServiceUrl)) {
      void syncProxySessionToken('').catch(() => {});
    }
    persistSession(null);
    clearData();
    setSession(null);
    setAuthLoading(false);
    setSessionDraft((prev) => ({
      ...prev,
      gatewayServiceUrl: prev.gatewayServiceUrl,
      authToken: '',
      password: ''
    }));
  };

  const onPolicyError = async (error: unknown) => {
    setPolicyError((error as Error).message);
    throw error;
  };

  const refreshAll = async () => {
    if (!client || !identity) return;
    await Promise.all([
      refreshHealth(client),
      refreshMetrics(client),
      refreshBudgets(client),
      refreshAudit(client, auditFilters),
      refreshSigningStatus(client),
      refreshEffectivePersona(client, selectedPersona)
    ]);
  };

  if (!session || !identity || !client) {
    return (
      <main className="shell shell-narrow">
        <h1>Cognitive AI Control Plane</h1>
        <section className="section auth-card">
          <h2>Gateway session</h2>
          <p className="muted">Same-origin proxy sessions can mint a short-lived operator JWT on the server and keep it in an HTTP-only cookie. Manual bearer tokens remain available for local debugging and direct gateway connections.</p>
          <form onSubmit={onSignIn}>
            <label className="field">
              API base URL
              <input
                value={sessionDraft.gatewayServiceUrl}
                onChange={(event) =>
                  setSessionDraft((prev) => ({
                    ...prev,
                    gatewayServiceUrl: event.target.value
                  }))
                }
              />
            </label>
            <div className="button-row">
              <button
                type="button"
                className={sessionDraft.authStrategy === 'credentials' ? undefined : 'button-secondary'}
                onClick={() =>
                  setSessionDraft((prev) => ({
                    ...prev,
                    authStrategy: 'credentials',
                    authToken: ''
                  }))
                }
              >
                Operator credentials
              </button>
              <button
                type="button"
                className={sessionDraft.authStrategy === 'token' ? undefined : 'button-secondary'}
                onClick={() =>
                  setSessionDraft((prev) => ({
                    ...prev,
                    authStrategy: 'token',
                    password: ''
                  }))
                }
              >
                Bearer token
              </button>
            </div>
            {sessionDraft.authStrategy === 'credentials' ? (
              <>
                <p className="muted">
                  Server-side token issuance validates the operator credentials, signs a short-lived JWT, and verifies it against the gateway before the session becomes active.
                </p>
                <label className="field">
                  Operator username
                  <input
                    value={sessionDraft.username}
                    onChange={(event) =>
                      setSessionDraft((prev) => ({
                        ...prev,
                        username: event.target.value
                      }))
                    }
                  />
                </label>
                <label className="field">
                  Operator password
                  <input
                    type="password"
                    value={sessionDraft.password}
                    onChange={(event) =>
                      setSessionDraft((prev) => ({
                        ...prev,
                        password: event.target.value
                      }))
                    }
                  />
                </label>
              </>
            ) : (
              <label className="field">
                Bearer token
                <textarea
                  className="token-input"
                  value={sessionDraft.authToken}
                  onChange={(event) =>
                    setSessionDraft((prev) => ({
                      ...prev,
                      authToken: event.target.value
                    }))
                  }
                  rows={5}
                />
              </label>
            )}
            <div className="button-row">
              <button type="submit" disabled={authLoading}>
                {authLoading ? 'Connecting…' : 'Sign in'}
              </button>
            </div>
          </form>
          {authError && <p className="danger">{authError}</p>}
        </section>
      </main>
    );
  }

  return (
    <main className="shell">
      <header className="session-banner">
        <div>
          <p className="eyebrow">Authenticated operator session</p>
          <h1>Cognitive AI Control Plane</h1>
          <p className="muted">
            {identity.subject} / tenant {identity.tenantId} / {identity.tokenType}
            {identity.email ? ` / ${identity.email}` : ''}
          </p>
          <p className="muted">roles: {identity.roles.length > 0 ? identity.roles.join(', ') : 'none'}</p>
        </div>
        <div className="session-actions">
          <code>{session.gatewayServiceUrl}</code>
          <div className="button-row">
            <button type="button" onClick={() => void refreshAll()}>
              Refresh data
            </button>
            <button type="button" className="button-secondary" onClick={onSignOut}>
              Sign out
            </button>
          </div>
        </div>
      </header>

      <section className="section">
        <h2>Service health</h2>
        <div className="grid">
          {serviceKeys.map((service) => (
            <HealthPanel
              key={service}
              title={service}
              status={health[service]}
              loading={healthLoading[service]}
              error={healthErrors[service]}
            />
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <div>
            <h2>Observability</h2>
            <p className="muted">
              {observabilitySummary.critical} critical / {observabilitySummary.warning} warning / {observabilitySummary.healthy} healthy / {observabilitySummary.pending} pending samples
            </p>
          </div>
        </div>
        <div className="grid">
          {serviceKeys.map((service) => (
            <ObservabilityPanel
              key={service}
              title={service}
              metrics={metrics[service]}
              loading={metricsLoading[service]}
              error={metricsErrors[service]}
            />
          ))}
        </div>
      </section>

      <SigningStatusPanel status={signingStatus ?? undefined} loading={signingLoading} error={signingError ?? undefined} />

      <section className="section">
        <div className="section-head">
          <div>
            <h2>Policy budgets</h2>
            <p className="muted">Current rate-limit budget state as observed through the gateway.</p>
          </div>
          <button type="button" onClick={() => void refreshBudgets(client)}>
            Refresh budgets
          </button>
        </div>
        <div className="budget-grid">
          {activeBudgetEntries.length === 0 && <p>No budget entries yet.</p>}
          {activeBudgetEntries.map((entry) => (
            <div key={entry.key} className="panel">
              <div>{entry.key}</div>
              <pre>{`${entry.remainingBudget ?? entry.remaining}/${entry.maxBudget ?? entry.max}`}</pre>
              <small>{entry.windowStart} → {entry.windowEnd}</small>
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <PersonaPicker personas={personas} value={selectedPersona} onChange={setSelectedPersona} />
      </section>

      <section className="section">
        <h3>Active effective persona</h3>
        <pre>{JSON.stringify(effectivePersona ?? {}, null, 2)}</pre>
      </section>

      <section className="section">
        <PolicyConsole
          personaId={selectedPersona}
          userId={identity.subject}
          tenantId={identity.tenantId}
          onSubmit={(payload) => runPolicyCheck(client, payload).catch(onPolicyError)}
        />
      </section>

      <section className="section">
        <h3>Policy decision</h3>
        {policyError && <p className="danger">{policyError}</p>}
        {policyDecision ? (
          <pre>
            {[
              `state=${policyDecision.state}`,
              `reason=${policyDecision.reasonCode}`,
              `reason-details=${policyDecision.reason ?? ''}`,
              `requirements=${requirementLabel(policyDecision.requirements ?? [])}`,
              `budget=${policyDecision.budgetSnapshot?.remainingBudget ?? '?'} / ${policyDecision.budgetSnapshot?.maxBudget ?? '?'}`,
              `trace=${policyDecision.traceId ?? 'n/a'}`
            ].join('\n')}
          </pre>
        ) : (
          <p>Run a policy check to see a live decision.</p>
        )}
      </section>

      <section className="section">
        <AuditViewer
          events={auditEvents}
          loading={auditLoading}
          principalFilter={auditFilters.principal}
          serviceFilter={auditFilters.service}
          onPrincipalChange={(principal) => setAuditFilters((prev) => ({ ...prev, principal }))}
          onServiceChange={(service) => setAuditFilters((prev) => ({ ...prev, service }))}
          onRefresh={() => void refreshAudit(client, auditFilters)}
        />
      </section>
    </main>
  );
}
