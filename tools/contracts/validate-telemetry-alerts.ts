import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

type AlertDefinition = {
  id: string;
  name: string;
  severity: 'warning' | 'high' | 'critical';
  metric: string;
  condition: string;
  threshold: number;
  window: string;
  for: string;
  channel: string;
  runbook: string;
};

type AlertPolicy = {
  schemaVersion: string;
  service: string;
  alerts: AlertDefinition[];
  channels: Record<string, { enabled: boolean; destination: string }>;
};

const root = process.cwd();
const failures: string[] = [];

const run = async () => {
  const schemaPath = join(root, 'packages/contracts/schemas/telemetry-alert.schema.json');
  const policyPath = join(root, 'ci/policies/alerts.policy.json');

  const schemaRaw = await readFile(schemaPath, 'utf8').catch(() => '');
  if (!schemaRaw) failures.push(`${schemaPath}: missing_or_empty`);
  else {
    const schema = JSON.parse(schemaRaw) as Record<string, unknown>;
    if (!schema['$id']) failures.push(`${schemaPath}: missing_$id`);
    if (!schema['properties']) failures.push(`${schemaPath}: missing_properties`);
  }

  const policy = JSON.parse(await readFile(policyPath, 'utf8')) as AlertPolicy;
  if (!policy.schemaVersion) failures.push(`${policyPath}: missing_schemaVersion`);
  if (!policy.service) failures.push(`${policyPath}: missing_service`);
  if (!Array.isArray(policy.alerts) || policy.alerts.length < 4) {
    failures.push(`${policyPath}: alerts_should_have_minimum_4_rules`);
  }

  for (const alert of policy.alerts || []) {
    if (!alert.id) failures.push(`${policyPath}: alert_missing_id`);
    if (!alert.name) failures.push(`${policyPath}: alert_missing_name(${alert.id || 'unknown'})`);
    if (!['warning', 'high', 'critical'].includes(alert.severity)) {
      failures.push(`${policyPath}: alert_invalid_severity(${alert.id || 'unknown'})`);
    }
    if (!alert.metric) failures.push(`${policyPath}: alert_missing_metric(${alert.id || 'unknown'})`);
    if (!Number.isFinite(alert.threshold)) failures.push(`${policyPath}: alert_invalid_threshold(${alert.id || 'unknown'})`);
    if (!alert.window) failures.push(`${policyPath}: alert_missing_window(${alert.id || 'unknown'})`);
    if (!alert.for) failures.push(`${policyPath}: alert_missing_for(${alert.id || 'unknown'})`);
    if (!alert.channel) failures.push(`${policyPath}: alert_missing_channel(${alert.id || 'unknown'})`);
    if (!alert.runbook) failures.push(`${policyPath}: alert_missing_runbook(${alert.id || 'unknown'})`);
    if (!policy.channels?.[alert.channel]) failures.push(`${policyPath}: alert_channel_not_defined(${alert.id || 'unknown'})`);
  }

  const enabledChannels = Object.entries(policy.channels || {}).filter(([, cfg]) => Boolean(cfg.enabled));
  if (enabledChannels.length === 0) failures.push(`${policyPath}: no_enabled_channels`);

  if (failures.length > 0) {
    console.error('Telemetry alert contract validation failed:');
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }

  console.log('Telemetry alert contract validation passed.');
};

void run();

