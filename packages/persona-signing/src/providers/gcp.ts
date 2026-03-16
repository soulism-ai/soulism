import { signPayload } from '@soulism/shared/crypto.js';
import { resolveMockKmsKey } from '../kms.js';
import type { KmsProviderAdapterOptions } from './factory.js';
import type { KmsProviderAdapter, KmsSignRequest, KmsSignResult } from './types.js';

export const createGcpKmsAdapter = (options: KmsProviderAdapterOptions = {}): KmsProviderAdapter => ({
  provider: 'gcp',
  async sign(request: KmsSignRequest): Promise<KmsSignResult> {
    const resolved = resolveMockKmsKey(request.keyId, {
      keyMapJson: options.keyMapJson || process.env.COGNITIVE_AI_KMS_GCP_KEYS_JSON,
      keyMapPath: options.keyMapPath || process.env.COGNITIVE_AI_KMS_GCP_KEYS_PATH
    });
    return {
      provider: 'gcp',
      keyId: request.keyId,
      signature: signPayload(request.digest, resolved.privateKey),
      publicKey: resolved.publicKey,
      source: `gcp:${resolved.source}`
    };
  }
});
