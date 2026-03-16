export interface SoulismConfig {
  apiGatewayUrl: string;
  personaRegistryUrl: string;
  policyServiceUrl: string;
  webfetchServiceUrl: string;
  memoryServiceUrl: string;
  filesServiceUrl: string;
  timeoutMs: number;
}

export interface ResolveConfigInput {
  apiGatewayUrl?: string;
  personaRegistryUrl?: string;
  policyServiceUrl?: string;
  webfetchServiceUrl?: string;
  memoryServiceUrl?: string;
  filesServiceUrl?: string;
  timeoutMs?: number;
}

const defaultSoulismConfig: SoulismConfig = {
  apiGatewayUrl: process.env.SOULISM_API_GATEWAY_URL ?? 'http://localhost:8080',
  personaRegistryUrl: process.env.SOULISM_PERSONA_REGISTRY_URL ?? 'http://localhost:3001',
  policyServiceUrl: process.env.SOULISM_POLICY_SERVICE_URL ?? 'http://localhost:4001',
  webfetchServiceUrl: process.env.SOULISM_WEBFETCH_SERVICE_URL ?? 'http://localhost:3004',
  memoryServiceUrl: process.env.SOULISM_MEMORY_SERVICE_URL ?? 'http://localhost:3002',
  filesServiceUrl: process.env.SOULISM_FILES_SERVICE_URL ?? 'http://localhost:3003',
  timeoutMs: Number(process.env.SOULISM_APP_TIMEOUT_MS ?? '10000')
};

export const resolveSoulismConfig = (overrides: ResolveConfigInput = {}): SoulismConfig => {
  const timeout = Number(overrides.timeoutMs ?? defaultSoulismConfig.timeoutMs);
  return {
    apiGatewayUrl: overrides.apiGatewayUrl ?? defaultSoulismConfig.apiGatewayUrl,
    personaRegistryUrl: overrides.personaRegistryUrl ?? defaultSoulismConfig.personaRegistryUrl,
    policyServiceUrl: overrides.policyServiceUrl ?? defaultSoulismConfig.policyServiceUrl,
    webfetchServiceUrl: overrides.webfetchServiceUrl ?? defaultSoulismConfig.webfetchServiceUrl,
    memoryServiceUrl: overrides.memoryServiceUrl ?? defaultSoulismConfig.memoryServiceUrl,
    filesServiceUrl: overrides.filesServiceUrl ?? defaultSoulismConfig.filesServiceUrl,
    timeoutMs: Number.isFinite(timeout) ? timeout : defaultSoulismConfig.timeoutMs
  };
};
