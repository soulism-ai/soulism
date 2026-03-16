import { createAwsKmsAdapter } from './aws.js';
import { createAzureKmsAdapter } from './azure.js';
import { createGcpKmsAdapter } from './gcp.js';
import type { KmsProviderAdapter, KmsProviderName } from './types.js';

export interface KmsProviderAdapterOptions {
  keyMapJson?: string;
  keyMapPath?: string;
}

export const createKmsProviderAdapter = (provider: KmsProviderName, options: KmsProviderAdapterOptions = {}): KmsProviderAdapter => {
  if (provider === 'aws') return createAwsKmsAdapter(options);
  if (provider === 'gcp') return createGcpKmsAdapter(options);
  if (provider === 'azure') return createAzureKmsAdapter(options);
  throw new Error(`unsupported_kms_provider:${provider}`);
};
