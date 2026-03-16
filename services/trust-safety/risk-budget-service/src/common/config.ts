import { env, envEnum, envInt, envRedisUrl } from '@soulism/shared/env.js';

const resolveStateBackend = (): 'file' | 'redis' =>
  envEnum('RISK_BUDGET_STATE_BACKEND', ['file', 'redis'], envEnum('STATE_BACKEND', ['file', 'redis'], 'file'));

const resolveRedisUrl = (): string =>
  envRedisUrl({
    urlNames: ['RISK_BUDGET_REDIS_URL', 'STATE_REDIS_URL'],
    hostNames: ['RISK_BUDGET_REDIS_HOST', 'STATE_REDIS_HOST'],
    portNames: ['RISK_BUDGET_REDIS_PORT', 'STATE_REDIS_PORT'],
    passwordNames: ['RISK_BUDGET_REDIS_PASSWORD', 'STATE_REDIS_PASSWORD']
  });

const resolveRedisPrefix = (): string =>
  env('RISK_BUDGET_REDIS_KEY_PREFIX', env('STATE_REDIS_KEY_PREFIX', 'soulism'));

export const config = {
  port: envInt('PORT', 4002),
  max: envInt('RISK_BUDGET_MAX', 100),
  windowMs: envInt('RISK_BUDGET_WINDOW_MS', 60_000),
  auditService: env('AUDIT_SERVICE_URL', env('COGNITIVE_AUDIT_LEDGER_URL', '')),
  storePath: env('RISK_BUDGET_STORE_PATH', './var/risk-budget-store.json'),
  stateBackend: resolveStateBackend(),
  stateRedisUrl: resolveRedisUrl(),
  stateRedisKeyPrefix: resolveRedisPrefix(),
  stateStoreKey: `${resolveRedisPrefix()}:risk-budget-service:budgets`,
  stateReadyTarget:
    resolveStateBackend() === 'redis'
      ? `${resolveRedisUrl()}#${resolveRedisPrefix()}:risk-budget-service:budgets`
      : env('RISK_BUDGET_STORE_PATH', './var/risk-budget-store.json')
};
