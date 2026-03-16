import type { AuditEvent } from '../api/types';

type Props = {
  events: AuditEvent[];
  loading?: boolean;
  principalFilter: string;
  serviceFilter: string;
  onPrincipalChange: (next: string) => void;
  onServiceChange: (next: string) => void;
  onRefresh: () => void;
};

export const AuditViewer = ({
  events,
  loading,
  principalFilter,
  serviceFilter,
  onPrincipalChange,
  onServiceChange,
  onRefresh
}: Props): JSX.Element => {
  const formatTime = (event: AuditEvent): string => event.timestamp || (event as { ts?: string }).ts || 'unknown';

  return (
    <section className="panel">
      <div className="panel-head">
        <h3>Audit events</h3>
        <button type="button" onClick={onRefresh} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>
      <div className="session-grid">
        <label className="field">
          Principal
          <input value={principalFilter} onChange={(event) => onPrincipalChange(event.target.value)} placeholder="operator-1" />
        </label>
        <label className="field">
          Service
          <input value={serviceFilter} onChange={(event) => onServiceChange(event.target.value)} placeholder="api-gateway" />
        </label>
      </div>
      {!loading && <p>{events.length} event(s) returned.</p>}
      {loading && <p>Loading audit ledger...</p>}
      {!loading && events.length === 0 && <p>No events returned.</p>}
      <ul className="audit-list">
        {events.map((event) => (
          <li key={event.id}>
            <strong>{formatTime(event)}</strong> | {event.service} / {event.action} / {event.principal}
            {event.traceId ? ` / trace:${event.traceId}` : ''}
            {event.resource ? ` / resource:${event.resource}` : ''}
          </li>
        ))}
      </ul>
    </section>
  );
};
