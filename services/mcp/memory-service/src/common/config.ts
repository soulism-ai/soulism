import { env, envEnum, envInt, envRedisUrl } from '@soulism/shared/env.js';

const resolveStateBackend = (): 'file' | 'redis' =>
  envEnum('MEMORY_STATE_BACKEND', ['file', 'redis'], envEnum('STATE_BACKEND', ['file', 'redis'], 'file'));

const resolveRedisUrl = (): string =>
  envRedisUrl({
    urlNames: ['MEMORY_REDIS_URL', 'STATE_REDIS_URL'],
    hostNames: ['MEMORY_REDIS_HOST', 'STATE_REDIS_HOST'],
    portNames: ['MEMORY_REDIS_PORT', 'STATE_REDIS_PORT'],
    passwordNames: ['MEMORY_REDIS_PASSWORD', 'STATE_REDIS_PASSWORD']
  });

const resolveRedisPrefix = (): string =>
  env('MEMORY_REDIS_KEY_PREFIX', env('STATE_REDIS_KEY_PREFIX', 'soulism'));

export const config = {
  port: envInt('PORT', 3002),
  policyService: env('POLICY_SERVICE_URL', 'http://localhost:4001'),
  defaultTtlMs: envInt('MEMORY_DEFAULT_TTL_MS', 86_400_000),
  auditService: env('AUDIT_SERVICE_URL', env('COGNITIVE_AUDIT_LEDGER_URL', '')),
  storePath: env('MEMORY_STORE_PATH', './var/memory-store.json'),
  stateBackend: resolveStateBackend(),
  stateRedisUrl: resolveRedisUrl(),
  stateRedisKeyPrefix: resolveRedisPrefix(),
  stateStoreKey: `${resolveRedisPrefix()}:memory-service:memory`,
  stateReadyTarget:
    resolveStateBackend() === 'redis'
      ? `${resolveRedisUrl()}#${resolveRedisPrefix()}:memory-service:memory`
      : env('MEMORY_STORE_PATH', './var/memory-store.json')
};
