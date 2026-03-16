import { PolicyCheckOptions, PolicyCheckExitCode, parsePolicyCheckOptions, runPolicy } from './policy.js';

export const runPolicyCheck = async (
  policyEndpoint: string,
  requestBody?: string,
  rawArgs: string[] = []
): Promise<PolicyCheckExitCode> => {
  const options: PolicyCheckOptions = parsePolicyCheckOptions(rawArgs);
  return runPolicy(policyEndpoint, requestBody, options);
};
