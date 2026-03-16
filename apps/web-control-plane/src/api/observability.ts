import type { ServiceMetricsSummary } from './types';

export type ObservabilitySeverity = 'healthy' | 'warning' | 'critical';

export interface ServiceAlert {
  severity: ObservabilitySeverity;
  message: string;
}

const severityRank: Record<ObservabilitySeverity, number> = {
  healthy: 0,
  warning: 1,
  critical: 2
};

const percent = (value: number): string => `${(value * 100).toFixed(1)}%`;

const countStatuses = (metrics: ServiceMetricsSummary, predicate: (status: number) => boolean): number =>
  Object.entries(metrics.statusCounts).reduce((sum, [status, count]) => {
    return predicate(Number(status)) ? sum + count : sum;
  }, 0);

export const deriveServiceAlerts = (metrics?: ServiceMetricsSummary): ServiceAlert[] => {
  if (!metrics) return [];

  const alerts: ServiceAlert[] = [];
  const serverErrors = countStatuses(metrics, (status) => status >= 500);
  const clientErrors = countStatuses(metrics, (status) => status >= 400 && status < 500);

  if (metrics.errorRate >= 0.1) {
    alerts.push({ severity: 'critical', message: `error rate ${percent(metrics.errorRate)} is above the 10% threshold` });
  } else if (metrics.errorRate >= 0.02) {
    alerts.push({ severity: 'warning', message: `error rate ${percent(metrics.errorRate)} is above the 2% threshold` });
  }

  if (metrics.latency.p95Ms >= 1000) {
    alerts.push({ severity: 'critical', message: `p95 latency ${metrics.latency.p95Ms}ms is above the 1000ms threshold` });
  } else if (metrics.latency.p95Ms >= 400) {
    alerts.push({ severity: 'warning', message: `p95 latency ${metrics.latency.p95Ms}ms is above the 400ms threshold` });
  }

  if (serverErrors >= 3) {
    alerts.push({ severity: 'critical', message: `${serverErrors} server-error responses observed in the current sample window` });
  } else if (serverErrors > 0) {
    alerts.push({ severity: 'warning', message: `${serverErrors} server-error responses observed in the current sample window` });
  }

  if (metrics.totals.requests >= 20 && clientErrors >= 5) {
    alerts.push({ severity: 'warning', message: `${clientErrors} client-error responses observed in the current sample window` });
  }

  return alerts.sort((left, right) => severityRank[right.severity] - severityRank[left.severity] || left.message.localeCompare(right.message));
};

export const summarizeObservability = (metrics?: ServiceMetricsSummary): { severity: ObservabilitySeverity; alerts: ServiceAlert[] } => {
  const alerts = deriveServiceAlerts(metrics);
  return {
    severity: alerts[0]?.severity ?? 'healthy',
    alerts
  };
};
