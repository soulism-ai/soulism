import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

type EvalPolicy = {
  schemaVersion: string;
  maxHallucinationFailureRate: number;
  maxHallucinationIncreaseDelta: number;
  minPassRate: number;
  maxPassRateDropDelta: number;
  requireSigningEnforcementPass: boolean;
  requireAdapterE2EParityPass?: boolean;
  requireAdapterRuntimeParityPass?: boolean;
  requireAdapterFrameworkParityPass?: boolean;
  requireAdapterFrameworkBootParityPass?: boolean;
  requireAdapterFrameworkCliBootParityPass?: boolean;
};

const root = process.cwd();
const failures: string[] = [];

const run = async () => {
  const path = join(root, 'ci/policies/eval-regression.policy.json');
  const policy = JSON.parse(await readFile(path, 'utf8')) as EvalPolicy;

  if (policy.schemaVersion !== '1.0.0') failures.push(`${path}: invalid_schemaVersion`);
  if (!Number.isFinite(policy.maxHallucinationFailureRate) || policy.maxHallucinationFailureRate < 0) {
    failures.push(`${path}: invalid_maxHallucinationFailureRate`);
  }
  if (!Number.isFinite(policy.maxHallucinationIncreaseDelta) || policy.maxHallucinationIncreaseDelta < 0) {
    failures.push(`${path}: invalid_maxHallucinationIncreaseDelta`);
  }
  if (!Number.isFinite(policy.minPassRate) || policy.minPassRate < 0 || policy.minPassRate > 1) {
    failures.push(`${path}: invalid_minPassRate`);
  }
  if (!Number.isFinite(policy.maxPassRateDropDelta) || policy.maxPassRateDropDelta < 0 || policy.maxPassRateDropDelta > 1) {
    failures.push(`${path}: invalid_maxPassRateDropDelta`);
  }
  if (typeof policy.requireSigningEnforcementPass !== 'boolean') {
    failures.push(`${path}: invalid_requireSigningEnforcementPass`);
  }
  if (typeof policy.requireAdapterE2EParityPass !== 'boolean') {
    failures.push(`${path}: invalid_requireAdapterE2EParityPass`);
  }
  if (typeof policy.requireAdapterRuntimeParityPass !== 'boolean') {
    failures.push(`${path}: invalid_requireAdapterRuntimeParityPass`);
  }
  if (typeof policy.requireAdapterFrameworkParityPass !== 'boolean') {
    failures.push(`${path}: invalid_requireAdapterFrameworkParityPass`);
  }
  if (typeof policy.requireAdapterFrameworkBootParityPass !== 'boolean') {
    failures.push(`${path}: invalid_requireAdapterFrameworkBootParityPass`);
  }
  if (typeof policy.requireAdapterFrameworkCliBootParityPass !== 'boolean') {
    failures.push(`${path}: invalid_requireAdapterFrameworkCliBootParityPass`);
  }

  if (failures.length > 0) {
    console.error('Eval regression policy validation failed:');
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }

  console.log('Eval regression policy validation passed.');
};

void run();
