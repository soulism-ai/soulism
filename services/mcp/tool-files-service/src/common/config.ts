import { env, envBool } from '@soulism/shared/env.js';

export const readConfig = () => ({
  port: Number(env('PORT', '3003')),
  rootDir: env('TOOL_FILES_ROOT', './files'),
  allowlistedExtensions: env('TOOL_FILES_EXTENSIONS', '.txt,.md,.json,.js,.ts').split(',').map((x) => x.trim()),
  overwriteAllowed: envBool('TOOL_FILES_OVERWRITE', true),
  policyService: env('POLICY_SERVICE_URL', 'http://localhost:4001'),
  auditService: env('AUDIT_SERVICE_URL', env('COGNITIVE_AUDIT_LEDGER_URL', ''))
});
