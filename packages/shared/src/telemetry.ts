import { ServerResponse } from 'node:http';

export interface HttpRequestMetricSample {
  traceId?: string;
  method: string;
  route: string;
  statusCode: number;
  latencyMs: number;
  timestamp: string;
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

export interface ServiceMetricsSnapshot {
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

type ObserveRequestOptions = {
  method: string;
  route: string;
  traceId?: string;
};

const percentile = (values: number[], ratio: number): number => {
  if (values.length === 0) return 0;
  const index = Math.max(0, Math.min(values.length - 1, Math.ceil(values.length * ratio) - 1));
  return values[index] ?? 0;
};

const round = (value: number): number => Math.round(value * 100) / 100;

const metricPrefix = (service: string): string => service.replace(/[^a-zA-Z0-9]+/g, '_');

export class ServiceMetricsCollector {
  private readonly service: string;
  private readonly maxSamples: number;
  private readonly samples: HttpRequestMetricSample[] = [];

  constructor(service: string, maxSamples = 500) {
    this.service = service;
    this.maxSamples = Math.max(10, maxSamples);
  }

  record(sample: HttpRequestMetricSample): void {
    this.samples.push(sample);
    if (this.samples.length > this.maxSamples) {
      this.samples.splice(0, this.samples.length - this.maxSamples);
    }
  }

  snapshot(): ServiceMetricsSnapshot {
    const samples = [...this.samples];
    const latencies = samples.map((entry) => entry.latencyMs).sort((left, right) => left - right);
    const totalRequests = samples.length;
    const totalErrors = samples.filter((entry) => entry.statusCode >= 400).length;
    const statusCounts: Record<string, number> = {};
    const routeBuckets = new Map<string, HttpRequestMetricSample[]>();

    for (const sample of samples) {
      const statusKey = String(sample.statusCode);
      statusCounts[statusKey] = (statusCounts[statusKey] ?? 0) + 1;
      const routeKey = `${sample.method} ${sample.route}`;
      const bucket = routeBuckets.get(routeKey);
      if (bucket) {
        bucket.push(sample);
      } else {
        routeBuckets.set(routeKey, [sample]);
      }
    }

    const routes = [...routeBuckets.entries()]
      .map(([route, entries]) => {
        const routeLatencies = entries.map((entry) => entry.latencyMs).sort((left, right) => left - right);
        const errors = entries.filter((entry) => entry.statusCode >= 400).length;
        const avgLatency = routeLatencies.length > 0 ? routeLatencies.reduce((sum, entry) => sum + entry, 0) / routeLatencies.length : 0;
        const latest = entries[entries.length - 1];
        return {
          route,
          requests: entries.length,
          errors,
          errorRate: entries.length > 0 ? round(errors / entries.length) : 0,
          avgLatencyMs: round(avgLatency),
          p95LatencyMs: percentile(routeLatencies, 0.95),
          lastStatusCode: latest?.statusCode ?? 0,
          lastTraceId: latest?.traceId
        } satisfies RouteMetricsSummary;
      })
      .sort((left, right) => right.requests - left.requests || right.p95LatencyMs - left.p95LatencyMs)
      .slice(0, 8);

    const avgLatency = latencies.length > 0 ? latencies.reduce((sum, entry) => sum + entry, 0) / latencies.length : 0;
    const prefix = metricPrefix(this.service);
    const metrics: Record<string, number> = {
      [`${prefix}_request_total`]: totalRequests,
      [`${prefix}_error_total`]: totalErrors,
      [`${prefix}_latency_p95_ms`]: percentile(latencies, 0.95)
    };

    for (const [status, count] of Object.entries(statusCounts)) {
      metrics[`${prefix}_status_${status}_total`] = count;
    }

    return {
      service: this.service,
      generatedAt: new Date().toISOString(),
      totals: {
        requests: totalRequests,
        errors: totalErrors
      },
      errorRate: totalRequests > 0 ? round(totalErrors / totalRequests) : 0,
      latency: {
        avgMs: round(avgLatency),
        p50Ms: percentile(latencies, 0.5),
        p95Ms: percentile(latencies, 0.95),
        maxMs: latencies.length > 0 ? latencies[latencies.length - 1] ?? 0 : 0
      },
      statusCounts,
      metrics,
      routes,
      recentRequests: samples.slice(-20).reverse()
    };
  }
}

export const observeHttpRequest = (
  collector: ServiceMetricsCollector,
  res: ServerResponse,
  options: ObserveRequestOptions
): void => {
  const startedAt = Date.now();
  let recorded = false;

  const commit = () => {
    if (recorded) return;
    recorded = true;
    collector.record({
      traceId: options.traceId,
      method: options.method,
      route: options.route,
      statusCode: res.statusCode || 200,
      latencyMs: Date.now() - startedAt,
      timestamp: new Date().toISOString()
    });
  };

  res.once('finish', commit);
  res.once('close', commit);
};

export { ServiceMetricsCollector as ServiceTelemetryCollector };
