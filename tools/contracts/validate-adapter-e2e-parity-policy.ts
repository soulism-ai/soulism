import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

type AdapterE2EParityPolicy = {
  schemaVersion: string;
  requiredAdapters: string[];
  maxP95LatencyDeltaMs: number;
  maxErrorRateDelta: number;
  maxPolicyDecisionDelta: number;
  requirePolicyMatrixStates: string[];
  requireAuditHashChainValid: boolean;
};

const root = process.cwd();
const failures: string[] = [];
const supportedAdapters = ['nextjs-adapter', 'expo-adapter', 'hf-space', 'openai-apps', 'claude-desktop', 'copilot-studio', 'web-control-plane'];

const run = async () => {
  const path = join(root, 'ci/policies/adapter-e2e-parity.policy.json');
  const policy = JSON.parse(await readFile(path, 'utf8')) as AdapterE2EParityPolicy;

  if (policy.schemaVersion !== '1.0.0') failures.push('invalid_schema_version');
  if (!Array.isArray(policy.requiredAdapters) || policy.requiredAdapters.length < 2) {
    failures.push('required_adapters_missing');
  }
  if (!policy.requiredAdapters?.includes('nextjs-adapter')) failures.push('missing_nextjs_adapter');
  if (!policy.requiredAdapters?.includes('expo-adapter')) failures.push('missing_expo_adapter');
  for (const adapterId of policy.requiredAdapters || []) {
    if (!supportedAdapters.includes(adapterId)) failures.push(`unsupported_adapter:${adapterId}`);
  }

  const numericChecks: Array<[string, number]> = [
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
    failures.push('invalid_policy_matrix_state_requirements');
  }

  if (typeof policy.requireAuditHashChainValid !== 'boolean') failures.push('invalid_audit_hash_chain_requirement');

  if (failures.length > 0) {
    console.error(`Adapter E2E parity policy validation failed: ${failures.join(',')}`);
    process.exit(1);
  }

  console.log('Adapter E2E parity policy validation passed.');
};

void run().catch((error) => {
  console.error(String(error));
  process.exit(1);
});
