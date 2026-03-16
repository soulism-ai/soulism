import type { ServiceMetricsSummary } from '../api/types';
import { summarizeObservability } from '../api/observability';

type Props = {
  title: string;
  metrics?: ServiceMetricsSummary;
  loading?: boolean;
  error?: string;
};

export const ObservabilityPanel = ({ title, metrics, loading, error }: Props): JSX.Element => {
  const topRoute = metrics?.routes?.[0];
  const summary = summarizeObservability(metrics);
  const statusCounts = metrics
    ? Object.entries(metrics.statusCounts)
        .sort(([left], [right]) => Number(left) - Number(right))
        .map(([status, count]) => `${status} x${count}`)
        .join(', ')
    : '';

  return (
    <section className="panel">
      <div className="panel-head">
        <h3>{title}</h3>
        {metrics && <span className={`pill pill-${summary.severity}`}>{summary.severity}</span>}
      </div>
      {loading && <p>collecting…</p>}
      {error && <p className="danger">error: {error}</p>}
      {metrics && (
        <>
          <p>
            <strong>{metrics.service}</strong>: requests {metrics.totals.requests} / errors {metrics.totals.errors}
          </p>
          <p>
            p95 {metrics.latency.p95Ms}ms / avg {metrics.latency.avgMs}ms / error rate {(metrics.errorRate * 100).toFixed(1)}%
          </p>
          {topRoute && (
            <p>
              top route: {topRoute.route} / {topRoute.requests} req / p95 {topRoute.p95LatencyMs}ms
            </p>
          )}
          {statusCounts && <p>responses: {statusCounts}</p>}
          {summary.alerts.length > 0 && (
            <ul className="status-list">
              {summary.alerts.map((alert) => (
                <li key={`${alert.severity}:${alert.message}`} className={alert.severity === 'critical' ? 'danger' : 'warning'}>
                  {alert.message}
                </li>
              ))}
            </ul>
          )}
          {metrics.recentRequests.length > 0 && (
            <ul className="status-list">
              {metrics.recentRequests.slice(0, 4).map((entry) => (
                <li key={`${entry.timestamp}:${entry.traceId ?? entry.route}`}>
                  {entry.method} {entry.route} / {entry.statusCode} / {entry.latencyMs}ms
                  {entry.traceId ? ` / trace:${entry.traceId}` : ''}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {!loading && !metrics && !error && <p>no telemetry yet</p>}
    </section>
  );
};
