import { env } from '@soulism/shared/env.js';

export const readConfig = () => ({
  port: Number(env('PORT', '3004')),
  policyService: env('POLICY_SERVICE_URL', 'http://localhost:4001'),
  allowedDomains: env('TOOL_WEBFETCH_ALLOWLIST', 'openai.com,docs.cognitive.ai').split(',').map((x) => x.trim()),
  maxPayloadBytes: Number(env('TOOL_WEBFETCH_MAX_BYTES', '262144')),
  auditService: env('AUDIT_SERVICE_URL', env('COGNITIVE_AUDIT_LEDGER_URL', ''))
});
