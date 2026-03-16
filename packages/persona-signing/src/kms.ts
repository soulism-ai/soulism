import { readFileSync } from 'node:fs';
import { createSigningKeyPair } from '@soulism/shared/crypto.js';
import { createPublicKey } from 'node:crypto';

export interface KmsResolvedKey {
  keyId: string;
  privateKey: string;
  publicKey: string;
  source: 'env_json' | 'file_json' | 'generated_mock';
}

export interface KmsKeyMapEntry {
  privateKey: string;
  publicKey?: string;
}

export type KmsKeyMap = Record<string, KmsKeyMapEntry>;

const readKeyMapJson = (keyMapJson?: string, keyMapPath?: string): string | undefined => {
  if (keyMapJson && keyMapJson.trim().length > 0) return keyMapJson;
  if (!keyMapPath) return undefined;
  try {
    return readFileSync(keyMapPath, 'utf8');
  } catch {
    return undefined;
  }
};

export const resolveMockKmsKey = (
  keyId: string,
  options: {
    keyMapJson?: string;
    keyMapPath?: string;
  } = {}
): KmsResolvedKey => {
  const sourceJson = readKeyMapJson(options.keyMapJson, options.keyMapPath);
  if (sourceJson) {
    try {
      const parsed = JSON.parse(sourceJson) as KmsKeyMap;
      const entry = parsed[keyId];
      if (entry?.privateKey) {
        const normalized = entry.privateKey.includes('\\n') ? entry.privateKey.replace(/\\n/g, '\n') : entry.privateKey;
        const publicKey =
          entry.publicKey ||
          createPublicKey(normalized)
            .export({
              type: 'spki',
              format: 'pem'
            })
            .toString();
        return {
          keyId,
          privateKey: normalized,
          publicKey,
          source: options.keyMapPath ? 'file_json' : 'env_json'
        };
      }
    } catch {
      // fall through to generated mock key material
    }
  }

  const generated = createSigningKeyPair();
  return {
    keyId,
    privateKey: generated.privateKey,
    publicKey: generated.publicKey,
    source: 'generated_mock'
  };
};
