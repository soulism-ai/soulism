export interface QuickstartConfig {
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

const defaultQuickstartConfig: QuickstartConfig = {
  apiGatewayUrl: process.env.COGNITIVE_API_GATEWAY_URL ?? 'http://localhost:8080',
  personaRegistryUrl: process.env.COGNITIVE_PERSONA_REGISTRY_URL ?? 'http://localhost:3001',
  policyServiceUrl: process.env.COGNITIVE_POLICY_SERVICE_URL ?? 'http://localhost:4001',
  webfetchServiceUrl: process.env.COGNITIVE_WEBFETCH_SERVICE_URL ?? 'http://localhost:3004',
  memoryServiceUrl: process.env.COGNITIVE_MEMORY_SERVICE_URL ?? 'http://localhost:3002',
  filesServiceUrl: process.env.COGNITIVE_FILES_SERVICE_URL ?? 'http://localhost:3003',
  timeoutMs: Number(process.env.COGNITIVE_QUICKSTART_TIMEOUT_MS ?? '10000')
};

export const resolveQuickstartConfig = (overrides: ResolveConfigInput = {}): QuickstartConfig => {
  const timeout = Number(overrides.timeoutMs ?? defaultQuickstartConfig.timeoutMs);
  return {
    apiGatewayUrl: overrides.apiGatewayUrl ?? defaultQuickstartConfig.apiGatewayUrl,
    personaRegistryUrl: overrides.personaRegistryUrl ?? defaultQuickstartConfig.personaRegistryUrl,
    policyServiceUrl: overrides.policyServiceUrl ?? defaultQuickstartConfig.policyServiceUrl,
    webfetchServiceUrl: overrides.webfetchServiceUrl ?? defaultQuickstartConfig.webfetchServiceUrl,
    memoryServiceUrl: overrides.memoryServiceUrl ?? defaultQuickstartConfig.memoryServiceUrl,
    filesServiceUrl: overrides.filesServiceUrl ?? defaultQuickstartConfig.filesServiceUrl,
    timeoutMs: Number.isFinite(timeout) ? timeout : defaultQuickstartConfig.timeoutMs
  };
};
