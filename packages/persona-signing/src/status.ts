import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createKmsProviderAdapter } from './providers/factory.js';
import type { KmsProviderName } from './providers/types.js';
import { readPublicKeyIfExists, resolveSignaturePolicyMode, type SignaturePolicyMode } from './policy.js';

type ProviderPolicyEntry = {
  enabled?: boolean;
  keyId?: string;
  allowMockInCi?: boolean;
  [key: string]: unknown;
};

type ProviderPolicyFile = {
  providers?: Partial<Record<KmsProviderName, ProviderPolicyEntry>>;
};

type RotationChannelEntry = {
  currentKeyId?: string;
  previousKeyId?: string;
  rotatedAt?: string;
};

type RotationPolicyFile = {
  rotationIntervalDays?: number;
  channels?: Record<string, RotationChannelEntry>;
};

export interface KmsProviderSigningStatus {
  provider: KmsProviderName;
  enabled: boolean;
  keyId?: string;
  ready: boolean;
  mock: boolean;
  source: string;
  allowMockInCi: boolean;
  publicKeyPresent: boolean;
  error?: string;
}

export interface SigningRotationChannelStatus {
  channel: string;
  currentKeyId: string;
  previousKeyId?: string;
  rotatedAt: string;
  ageDays: number;
  rotationIntervalDays: number;
  overdue: boolean;
  providerCoverage: KmsProviderName[];
}

export interface SigningPostureStatus {
  mode: SignaturePolicyMode;
  productionMode: boolean;
  strictSigning: boolean;
  publicKeyConfigured: boolean;
  publicKeySource: 'path' | 'env' | 'none';
  publicKeyPath?: string;
  providers: KmsProviderSigningStatus[];
  channels: SigningRotationChannelStatus[];
  issues: string[];
  ready: boolean;
  generatedAt: string;
  policyPaths: {
    kmsProviders: string;
    rotation: string;
  };
}

export interface SigningPostureOptions {
  productionMode?: boolean;
  strictSigning?: boolean;
  signaturePolicyMode?: string;
  signingPublicKey?: string;
  signingPublicKeyPath?: string;
  kmsProvidersPolicyPath?: string;
  signingRotationPolicyPath?: string;
  providerKeyMaps?: Partial<
    Record<
      KmsProviderName,
      {
        keyMapJson?: string;
        keyMapPath?: string;
      }
    >
  >;
  cwd?: string;
  now?: Date;
}

const defaultKmsProvidersPolicyPath = './ci/policies/kms.providers.json';
const defaultSigningRotationPolicyPath = './ci/policies/signing-rotation.policy.json';
const supportedProviders: KmsProviderName[] = ['aws', 'gcp', 'azure'];

const readJsonFile = <T>(path: string, fallback: T): T => {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch {
    return fallback;
  }
};

const round = (value: number): number => Math.round(value * 100) / 100;

const envValue = (name: string): string => process.env[name] ?? '';

const providerKeyMapPath = (provider: KmsProviderName, options: SigningPostureOptions): string =>
  options.providerKeyMaps?.[provider]?.keyMapPath || envValue(`COGNITIVE_AI_KMS_${provider.toUpperCase()}_KEYS_PATH`);
const providerKeyMapJson = (provider: KmsProviderName, options: SigningPostureOptions): string =>
  options.providerKeyMaps?.[provider]?.keyMapJson || envValue(`COGNITIVE_AI_KMS_${provider.toUpperCase()}_KEYS_JSON`);

const resolvePolicyPath = (cwd: string, path: string | undefined, fallback: string): string =>
  resolve(cwd, path && path.trim().length > 0 ? path : fallback);

const rotationAgeDays = (rotatedAt: string, now: Date): number => {
  const timestamp = Date.parse(rotatedAt);
  if (Number.isNaN(timestamp)) return Number.POSITIVE_INFINITY;
  return round((now.getTime() - timestamp) / 86_400_000);
};

export const getSigningPostureStatus = async (options: SigningPostureOptions = {}): Promise<SigningPostureStatus> => {
  const cwd = options.cwd ?? process.cwd();
  const now = options.now ?? new Date();
  const providersPath = resolvePolicyPath(cwd, options.kmsProvidersPolicyPath, defaultKmsProvidersPolicyPath);
  const rotationPath = resolvePolicyPath(cwd, options.signingRotationPolicyPath, defaultSigningRotationPolicyPath);
  const providersPolicy = readJsonFile<ProviderPolicyFile>(providersPath, {});
  const rotationPolicy = readJsonFile<RotationPolicyFile>(rotationPath, {});
  const mode = resolveSignaturePolicyMode(options.signaturePolicyMode, options.productionMode, options.strictSigning);
  const inlinePublicKey = options.signingPublicKey?.trim() || '';
  const filePublicKey = readPublicKeyIfExists(options.signingPublicKeyPath);
  const publicKeyConfigured = inlinePublicKey.length > 0 || filePublicKey.length > 0;
  const publicKeySource = filePublicKey.length > 0 ? 'path' : inlinePublicKey.length > 0 ? 'env' : 'none';

  const providers = await Promise.all(supportedProviders.map(async (provider) => {
    const config = providersPolicy.providers?.[provider] ?? {};
    const enabled = config.enabled !== false;
    const keyId = typeof config.keyId === 'string' ? config.keyId : '';
    const allowMockInCi = config.allowMockInCi === true;

    if (!enabled) {
      return {
        provider,
        enabled: false,
        keyId,
        ready: false,
        mock: false,
        source: 'disabled',
        allowMockInCi,
        publicKeyPresent: false
      } satisfies KmsProviderSigningStatus;
    }

    if (!keyId) {
      return {
        provider,
        enabled: true,
        keyId,
        ready: false,
        mock: false,
        source: 'unconfigured',
        allowMockInCi,
        publicKeyPresent: false,
        error: 'missing_key_id'
      } satisfies KmsProviderSigningStatus;
    }

    try {
      const adapter = createKmsProviderAdapter(provider, {
        keyMapJson: providerKeyMapJson(provider, options),
        keyMapPath: providerKeyMapPath(provider, options)
      });
      const result = await adapter.sign({ keyId, digest: 'signing-posture-probe' });
      const mock = result.source.includes('generated_mock');
      const ready = !mock || (allowMockInCi && envValue('CI') === 'true');
      return {
        provider,
        enabled: true,
        keyId,
        ready,
        mock,
        source: result.source,
        allowMockInCi,
        publicKeyPresent: result.publicKey.trim().length > 0
      } satisfies KmsProviderSigningStatus;
    } catch (error) {
      return {
        provider,
        enabled: true,
        keyId,
        ready: false,
        mock: false,
        source: providerKeyMapPath(provider, options) ? 'path' : providerKeyMapJson(provider, options) ? 'env_json' : 'unconfigured',
        allowMockInCi,
        publicKeyPresent: false,
        error: error instanceof Error ? error.message : String(error)
      } satisfies KmsProviderSigningStatus;
    }
  }));

  const rotationIntervalDays = Number(rotationPolicy.rotationIntervalDays) > 0 ? Number(rotationPolicy.rotationIntervalDays) : 90;
  const channels = Object.entries(rotationPolicy.channels ?? {}).map(([channel, entry]) => {
    const currentKeyId = typeof entry.currentKeyId === 'string' ? entry.currentKeyId : '';
    const rotatedAt = typeof entry.rotatedAt === 'string' ? entry.rotatedAt : '';
    const providerCoverage = providers
      .filter((provider) => provider.enabled && provider.keyId === currentKeyId)
      .map((provider) => provider.provider);
    const ageDays = rotationAgeDays(rotatedAt, now);

    return {
      channel,
      currentKeyId,
      previousKeyId: typeof entry.previousKeyId === 'string' ? entry.previousKeyId : undefined,
      rotatedAt,
      ageDays,
      rotationIntervalDays,
      overdue: ageDays > rotationIntervalDays,
      providerCoverage
    } satisfies SigningRotationChannelStatus;
  });

  const issues: string[] = [];
  if (mode !== 'dev' && !publicKeyConfigured) {
    issues.push('signature verification is strict/enforced but no default public key is configured');
  }

  for (const provider of providers) {
    if (!provider.enabled) continue;
    if (!provider.ready) {
      if (provider.mock) {
        issues.push(`${provider.provider} provider is falling back to generated mock key material`);
      } else {
        issues.push(`${provider.provider} provider is not ready${provider.error ? `: ${provider.error}` : ''}`);
      }
    }
  }

  for (const channel of channels) {
    if (channel.overdue) {
      issues.push(`${channel.channel} signing key rotation is overdue (${channel.ageDays} days old)`);
    }
    if (channel.providerCoverage.length === 0) {
      issues.push(`${channel.channel} current key ${channel.currentKeyId || 'unknown'} is not covered by an enabled provider`);
    }
  }

  const productionMode = options.productionMode === true;
  const ready = issues.length === 0 || (!productionMode && mode === 'dev');

  return {
    mode,
    productionMode,
    strictSigning: options.strictSigning === true,
    publicKeyConfigured,
    publicKeySource,
    publicKeyPath: options.signingPublicKeyPath || undefined,
    providers,
    channels,
    issues,
    ready,
    generatedAt: now.toISOString(),
    policyPaths: {
      kmsProviders: providersPath,
      rotation: rotationPath
    }
  };
};
