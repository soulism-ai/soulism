import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.cwd();
const failures: string[] = [];

const run = async () => {
  const policyPath = join(root, 'ci/policies/telemetry.pipeline.json');
  const collectorPath = join(root, 'infra/k8s/otel-collector-config.yaml');

  const policyRaw = await readFile(policyPath, 'utf8').catch(() => '');
  if (!policyRaw) {
    failures.push(`${policyPath}: missing_or_empty`);
  } else {
    const policy = JSON.parse(policyRaw) as {
      schemaVersion?: string;
      service?: string;
      collectors?: Array<{ name: string; endpoint: string; protocol: string }>;
      exporters?: Array<{ name: string; type: string; endpoint: string }>;
      serviceLevelObjectives?: Array<{ id: string; metric: string; target: number; window: string }>;
      alertRouting?: Array<{ severity: string; channel: string; target: string }>;
    };
    if (policy.schemaVersion !== '1.0.0') failures.push(`${policyPath}: invalid_schemaVersion`);
    if (!policy.service) failures.push(`${policyPath}: missing_service`);
    if (!Array.isArray(policy.collectors) || policy.collectors.length === 0) {
      failures.push(`${policyPath}: missing_collectors`);
    }
    if (!Array.isArray(policy.exporters) || policy.exporters.length < 2) {
      failures.push(`${policyPath}: missing_exporters`);
    }
    if (!Array.isArray(policy.serviceLevelObjectives) || policy.serviceLevelObjectives.length === 0) {
      failures.push(`${policyPath}: missing_slos`);
    }
    if (!Array.isArray(policy.alertRouting) || policy.alertRouting.length === 0) {
      failures.push(`${policyPath}: missing_alert_routing`);
    }
  }

  const collectorRaw = await readFile(collectorPath, 'utf8').catch(() => '');
  if (!collectorRaw) {
    failures.push(`${collectorPath}: missing_or_empty`);
  } else {
    const requiredTokens = [
      'receivers:',
      'otlp:',
      'processors:',
      'batch:',
      'memory_limiter:',
      'exporters:',
      'logging:',
      'otlphttp:',
      'service:',
      'pipelines:',
      'metrics:',
      'traces:',
      'logs:'
    ];
    for (const token of requiredTokens) {
      if (!collectorRaw.includes(token)) failures.push(`${collectorPath}: missing_token(${token})`);
    }
  }

  if (failures.length > 0) {
    console.error('Telemetry pipeline validation failed:');
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }

  console.log('Telemetry pipeline validation passed.');
};

void run();

