import { envInt, envBool, env } from '@soulism/shared/env.js';

export const config = {
  port: envInt('PORT', 4001),
  allowTestMode: envBool('ALLOW_TEST_CONFIRM', false),
  riskBudgetService: env('RISK_BUDGET_SERVICE_URL', 'http://localhost:4002')
};
