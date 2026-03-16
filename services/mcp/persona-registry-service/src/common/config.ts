import { env } from '@soulism/shared/env.js';

export const readConfig = () => ({
  port: Number(env('PORT', '3001')),
  packsDir: env('PERSONA_PACKS_DIR', './packs'),
  productionMode: env('PRODUCTION_MODE', 'false') === 'true',
  policyService: env('POLICY_SERVICE_URL', 'http://localhost:4001'),
  strictSigning: env('STRICT_SIGNING', 'false') === 'true',
  signaturePolicyMode: env('SIGNATURE_POLICY_MODE', 'dev') as 'dev' | 'strict' | 'enforced',
  signingPublicKeyPath: env('SIGNING_PUBLIC_KEY_PATH', ''),
  auditService: env('AUDIT_SERVICE_URL', env('COGNITIVE_AUDIT_LEDGER_URL', ''))
});
