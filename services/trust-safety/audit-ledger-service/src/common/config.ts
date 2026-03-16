import { env, envEnum, envInt, envRedisUrl } from '@soulism/shared/env.js';

const resolveStateBackend = (): 'file' | 'redis' =>
  envEnum('AUDIT_STATE_BACKEND', ['file', 'redis'], envEnum('STATE_BACKEND', ['file', 'redis'], 'file'));

const resolveRedisUrl = (): string =>
  envRedisUrl({
    urlNames: ['AUDIT_REDIS_URL', 'STATE_REDIS_URL'],
    hostNames: ['AUDIT_REDIS_HOST', 'STATE_REDIS_HOST'],
    portNames: ['AUDIT_REDIS_PORT', 'STATE_REDIS_PORT'],
    passwordNames: ['AUDIT_REDIS_PASSWORD', 'STATE_REDIS_PASSWORD']
  });

const resolveRedisPrefix = (): string =>
  env('AUDIT_REDIS_KEY_PREFIX', env('STATE_REDIS_KEY_PREFIX', 'soulism'));

export const config = {
  port: envInt('PORT', 4003),
  storePath: env('AUDIT_STORE_PATH', './var/audit-ledger.json'),
  stateBackend: resolveStateBackend(),
  stateRedisUrl: resolveRedisUrl(),
  stateRedisKeyPrefix: resolveRedisPrefix(),
  stateStoreKey: `${resolveRedisPrefix()}:audit-ledger-service:records`,
  stateReadyTarget:
    resolveStateBackend() === 'redis'
      ? `${resolveRedisUrl()}#${resolveRedisPrefix()}:audit-ledger-service:records`
      : env('AUDIT_STORE_PATH', './var/audit-ledger.json')
};
