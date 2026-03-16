import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

type FrameworkCliBootPolicy = {
  schemaVersion: string;
  requiredRuntimes: string[];
  startupTimeoutMs: number;
  maxStartupLatencyDeltaMs: number;
  maxFirstResponseDeltaMs: number;
  maxP95LatencyDeltaMs: number;
  maxErrorRateDelta: number;
  maxPolicyDecisionDelta: number;
  requirePolicyMatrixStates: string[];
  requireAuditHashChainValid: boolean;
};

const root = process.cwd();
const failures: string[] = [];

const run = async () => {
  const path = join(root, 'ci/policies/adapter-framework-cli-boot.policy.json');
  const policy = JSON.parse(await readFile(path, 'utf8')) as FrameworkCliBootPolicy;

  if (policy.schemaVersion !== '1.0.0') failures.push('invalid_schema_version');
  if (!Array.isArray(policy.requiredRuntimes) || policy.requiredRuntimes.length < 2) failures.push('required_runtimes_missing');
  if (!policy.requiredRuntimes?.includes('nextjs')) failures.push('missing_nextjs_runtime');
  if (!policy.requiredRuntimes?.includes('expo')) failures.push('missing_expo_runtime');

  const numericChecks: Array<[string, number]> = [
    ['startupTimeoutMs', policy.startupTimeoutMs],
    ['maxStartupLatencyDeltaMs', policy.maxStartupLatencyDeltaMs],
    ['maxFirstResponseDeltaMs', policy.maxFirstResponseDeltaMs],
    ['maxP95LatencyDeltaMs', policy.maxP95LatencyDeltaMs],
    ['maxErrorRateDelta', policy.maxErrorRateDelta],
    ['maxPolicyDecisionDelta', policy.maxPolicyDecisionDelta]
  ];
  for (const [field, value] of numericChecks) {
    if (typeof value !== 'number' || Number.isNaN(value) || value < 0) failures.push(`invalid_${field}`);
  }

  if (
    !Array.isArray(policy.requirePolicyMatrixStates) ||
    !policy.requirePolicyMatrixStates.includes('allow') ||
    !policy.requirePolicyMatrixStates.includes('confirm') ||
    !policy.requirePolicyMatrixStates.includes('deny')
  ) {
    failures.push('invalid_policy_matrix_states');
  }

  if (typeof policy.requireAuditHashChainValid !== 'boolean') failures.push('invalid_audit_hash_chain_requirement');

  if (failures.length > 0) {
    console.error(`Adapter framework CLI boot policy validation failed: ${failures.join(',')}`);
    process.exit(1);
  }

  console.log('Adapter framework CLI boot policy validation passed.');
};

void run().catch((error) => {
  console.error(String(error));
  process.exit(1);
});
