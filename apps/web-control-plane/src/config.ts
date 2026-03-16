type RuntimeConfig = {
  gatewayServiceUrl?: string;
};

declare global {
  interface Window {
    __COGNITIVE_AI_RUNTIME_CONFIG__?: RuntimeConfig;
  }
}

const fromWindowRuntimeConfig = (): string | undefined => {
  if (typeof window === 'undefined') return undefined;
  const configured = window.__COGNITIVE_AI_RUNTIME_CONFIG__?.gatewayServiceUrl;
  if (typeof configured !== 'string') return undefined;
  const normalized = configured.trim();
  return normalized.length > 0 ? normalized : undefined;
};

const fromProcessEnv = (): string | undefined => {
  if (typeof process === 'undefined') return undefined;
  const configured = process.env?.NEXT_PUBLIC_CONTROL_PLANE_API_BASE_URL;
  if (typeof configured !== 'string') return undefined;
  const normalized = configured.trim();
  return normalized.length > 0 ? normalized : undefined;
};

export const defaultGatewayServiceUrl = (): string => {
  const runtimeConfigured = fromWindowRuntimeConfig();
  if (runtimeConfigured !== undefined) return runtimeConfigured;

  const envConfigured = fromProcessEnv();
  if (envConfigured && envConfigured.length > 0) return envConfigured;

  return '/api';
};
