import type { HealthReport } from '../api/types';

type Props = {
  title: string;
  status?: HealthReport;
  loading?: boolean;
  error?: string;
};

export const HealthPanel = ({ title, status, loading, error }: Props): JSX.Element => {
  const checks = status?.checks ?? [];

  return (
    <section className="panel">
      <h3>{title}</h3>
      {loading && <p>checking…</p>}
      {error && <p className="danger">error: {error}</p>}
      {status && (
        <>
          <p>
            <strong>{status.service}</strong>: {status.ok ? 'healthy' : 'unhealthy'}
            {status.ready !== undefined && ` / ready: ${status.ready ? 'true' : 'false'}`}
            {status.latencyMs !== undefined && ` / latency: ${status.latencyMs}ms`}
          </p>
          {status.errors && status.errors.length > 0 && (
            <ul className="status-list">
              {status.errors.map((message) => (
                <li key={message} className="danger">
                  {message}
                </li>
              ))}
            </ul>
          )}
          {checks.length > 0 && (
            <ul className="status-list">
              {checks.map((check) => (
                <li key={`${check.name}:${check.target ?? 'local'}`} className={check.ok ? undefined : 'danger'}>
                  {check.name}: {check.ok ? (check.skipped ? 'skipped' : 'ready') : 'not ready'}
                  {!check.required && ' (optional)'}
                  {check.target ? ` / target: ${check.target}` : ''}
                  {check.error ? ` / ${check.error}` : ''}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {!loading && !status && !error && <p>not checked yet</p>}
    </section>
  );
};
