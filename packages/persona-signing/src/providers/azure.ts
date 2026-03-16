import { signPayload } from '@soulism/shared/crypto.js';
import { resolveMockKmsKey } from '../kms.js';
import type { KmsProviderAdapterOptions } from './factory.js';
import type { KmsProviderAdapter, KmsSignRequest, KmsSignResult } from './types.js';

export const createAzureKmsAdapter = (options: KmsProviderAdapterOptions = {}): KmsProviderAdapter => ({
  provider: 'azure',
  async sign(request: KmsSignRequest): Promise<KmsSignResult> {
    const resolved = resolveMockKmsKey(request.keyId, {
      keyMapJson: options.keyMapJson || process.env.COGNITIVE_AI_KMS_AZURE_KEYS_JSON,
      keyMapPath: options.keyMapPath || process.env.COGNITIVE_AI_KMS_AZURE_KEYS_PATH
    });
    return {
      provider: 'azure',
      keyId: request.keyId,
      signature: signPayload(request.digest, resolved.privateKey),
      publicKey: resolved.publicKey,
      source: `azure:${resolved.source}`
    };
  }
});
