import { createSigningKeyPair } from '@soulism/shared/crypto.js';

export interface GeneratedKeys {
  publicKey: string;
  privateKey: string;
}

export const generateSigningKeys = (): GeneratedKeys => {
  const { publicKey, privateKey } = createSigningKeyPair();
  return { publicKey, privateKey };
};
