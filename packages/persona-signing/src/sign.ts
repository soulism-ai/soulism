import { stableStringify } from '@soulism/shared/json.js';
import { signPayload } from '@soulism/shared/crypto.js';
import { PersonaPack } from '@soulism/persona-schema/types.js';
import { createKmsProviderAdapter } from './providers/factory.js';
import type { KmsProviderName } from './providers/types.js';

export interface SignedPersonaPack {
  pack: PersonaPack;
  signature: string;
  publicKey: string;
  keyId?: string;
  provider?: KmsProviderName;
  source?: string;
}

export const signPersonaPack = (pack: PersonaPack, privateKey: string, publicKey: string): SignedPersonaPack => {
  const payload = stableStringify(pack);
  const signature = signPayload(payload, privateKey);
  return {
    pack,
    signature,
    publicKey
  };
};

export const signPersonaPackWithKms = async (
  pack: PersonaPack,
  provider: KmsProviderName,
  keyId: string,
  options: {
    keyMapJson?: string;
    keyMapPath?: string;
  } = {}
): Promise<SignedPersonaPack> => {
  const payload = stableStringify(pack);
  const adapter = createKmsProviderAdapter(provider, options);
  const result = await adapter.sign({
    keyId,
    digest: payload
  });
  return {
    pack,
    signature: result.signature,
    publicKey: result.publicKey,
    keyId: result.keyId,
    provider: result.provider,
    source: result.source
  };
};
