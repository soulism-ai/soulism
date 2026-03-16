import { describe, expect, it } from 'vitest';
import { deriveServiceAlerts, summarizeObservability } from '../src/api/observability';
import type { ServiceMetricsSummary } from '../src/api/types';

const buildMetrics = (overrides: Partial<ServiceMetricsSummary> = {}): ServiceMetricsSummary => ({
  service: 'api-gateway',
  generatedAt: '2026-03-11T00:00:00.000Z',
  totals: { requests: 50, errors: 0 },
  errorRate: 0,
  latency: { avgMs: 45, p50Ms: 20, p95Ms: 120, maxMs: 200 },
  statusCounts: { '200': 50 },
  metrics: {},
  routes: [],
  recentRequests: [],
  ...overrides
});

describe('observability thresholds', () => {
  it('marks healthy service samples without threshold breaches as healthy', () => {
    const summary = summarizeObservability(buildMetrics());
    expect(summary.severity).toBe('healthy');
    expect(summary.alerts).toHaveLength(0);
  });

  it('raises warning alerts for elevated latency and client errors', () => {
    const alerts = deriveServiceAlerts(
      buildMetrics({
        totals: { requests: 50, errors: 4 },
        errorRate: 0.04,
        latency: { avgMs: 75, p50Ms: 32, p95Ms: 450, maxMs: 600 },
        statusCounts: { '200': 42, '404': 8 }
      })
    );

    expect(alerts.map((alert) => alert.severity)).toContain('warning');
    expect(alerts.some((alert) => alert.message.includes('error rate'))).toBe(true);
    expect(alerts.some((alert) => alert.message.includes('p95 latency'))).toBe(true);
  });

  it('prioritizes critical alerts when server errors dominate the sample', () => {
    const summary = summarizeObservability(
      buildMetrics({
        totals: { requests: 30, errors: 6 },
        errorRate: 0.2,
        latency: { avgMs: 180, p50Ms: 95, p95Ms: 1200, maxMs: 1800 },
        statusCounts: { '200': 24, '503': 6 }
      })
    );

    expect(summary.severity).toBe('critical');
    expect(summary.alerts[0]?.severity).toBe('critical');
    expect(summary.alerts.some((alert) => alert.message.includes('server-error responses'))).toBe(true);
  });
});
