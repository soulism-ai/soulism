import { env, envBool, envEnum, envInt, envRedisUrl } from '@soulism/shared/env.js';

const splitCsv = (value: string): string[] =>
  value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

export const readConfig = () => ({
  port: envInt('PORT', 8080),
  policyService: env('POLICY_SERVICE_URL', 'http://localhost:4001'),
  personaRegistryService: env('PERSONA_REGISTRY_URL', 'http://localhost:3001'),
  memoryService: env('MEMORY_SERVICE_URL', 'http://localhost:3002'),
  webfetchService: env('WEBFETCH_SERVICE_URL', 'http://localhost:3004'),
  filesService: env('FILES_SERVICE_URL', 'http://localhost:3003'),
  auditService: env('AUDIT_SERVICE_URL', env('COGNITIVE_AUDIT_LEDGER_URL', 'http://localhost:4003')),
  riskBudgetService: env('RISK_BUDGET_SERVICE_URL', 'http://localhost:4002'),
  productionMode: envBool('PRODUCTION_MODE', false),
  strictSigning: envBool('STRICT_SIGNING', false),
  signaturePolicyMode: env('SIGNATURE_POLICY_MODE', 'dev'),
  signingPublicKey: env('SIGNING_PUBLIC_KEY', ''),
  signingPublicKeyPath: env('SIGNING_PUBLIC_KEY_PATH', ''),
  kmsProvidersPolicyPath: env('KMS_PROVIDERS_POLICY_PATH', './ci/policies/kms.providers.json'),
  signingRotationPolicyPath: env('SIGNING_ROTATION_POLICY_PATH', './ci/policies/signing-rotation.policy.json'),
  kmsAwsKeysJson: env('COGNITIVE_AI_KMS_AWS_KEYS_JSON', ''),
  kmsAwsKeysPath: env('COGNITIVE_AI_KMS_AWS_KEYS_PATH', ''),
  kmsGcpKeysJson: env('COGNITIVE_AI_KMS_GCP_KEYS_JSON', ''),
  kmsGcpKeysPath: env('COGNITIVE_AI_KMS_GCP_KEYS_PATH', ''),
  kmsAzureKeysJson: env('COGNITIVE_AI_KMS_AZURE_KEYS_JSON', ''),
  kmsAzureKeysPath: env('COGNITIVE_AI_KMS_AZURE_KEYS_PATH', ''),
  requestIdHeader: env('REQUEST_ID_HEADER', 'x-request-id'),
  requireAuth: envBool('REQUIRE_AUTH', false),
  authMode: env('AUTH_MODE', 'api-key').toLowerCase(),
  apiKey: env('API_KEY', ''),
  apiKeyUserId: env('AUTH_API_KEY_USER_ID', 'gateway-operator'),
  apiKeyTenantId: env('AUTH_API_KEY_TENANT_ID', 'default'),
  apiKeyRoles: splitCsv(env('AUTH_API_KEY_ROLES', 'operator')),
  authJwtIssuer: env('AUTH_JWT_ISSUER', ''),
  authJwtAudience: splitCsv(env('AUTH_JWT_AUDIENCE', '')),
  authJwtSecret: env('AUTH_JWT_SECRET', ''),
  authJwtPublicKey: env('AUTH_JWT_PUBLIC_KEY', ''),
  authJwtJwksUrl: env('AUTH_JWT_JWKS_URL', ''),
  authJwtJwksCacheTtlMs: envInt('AUTH_JWT_JWKS_CACHE_TTL_MS', 300_000),
  operatorRoles: splitCsv(env('AUTH_OPERATOR_ROLES', 'operator,admin,platform')),
  rateWindowMs: envInt('RATE_WINDOW_MS', 60_000),
  rateMax: envInt('RATE_MAX', 120),
  rateLimitStorePath: env('RATE_LIMIT_STORE_PATH', './var/api-gateway-rate-limits.json'),
  rateLimitStateBackend: envEnum('RATE_LIMIT_STATE_BACKEND', ['file', 'redis'], envEnum('STATE_BACKEND', ['file', 'redis'], 'file')),
  rateLimitRedisUrl: envRedisUrl({
    urlNames: ['RATE_LIMIT_REDIS_URL', 'STATE_REDIS_URL'],
    hostNames: ['RATE_LIMIT_REDIS_HOST', 'STATE_REDIS_HOST'],
    portNames: ['RATE_LIMIT_REDIS_PORT', 'STATE_REDIS_PORT'],
    passwordNames: ['RATE_LIMIT_REDIS_PASSWORD', 'STATE_REDIS_PASSWORD']
  }),
  rateLimitRedisKeyPrefix: env('RATE_LIMIT_REDIS_KEY_PREFIX', env('STATE_REDIS_KEY_PREFIX', 'soulism')),
  rateLimitStoreKey: `${env('RATE_LIMIT_REDIS_KEY_PREFIX', env('STATE_REDIS_KEY_PREFIX', 'soulism'))}:api-gateway:rate-limit`,
  rateLimitReadyTarget:
    envEnum('RATE_LIMIT_STATE_BACKEND', ['file', 'redis'], envEnum('STATE_BACKEND', ['file', 'redis'], 'file')) === 'redis'
      ? `${env('RATE_LIMIT_REDIS_URL', env('STATE_REDIS_URL', ''))}#${env('RATE_LIMIT_REDIS_KEY_PREFIX', env('STATE_REDIS_KEY_PREFIX', 'soulism'))}:api-gateway:rate-limit`
      : env('RATE_LIMIT_STORE_PATH', './var/api-gateway-rate-limits.json')
});
