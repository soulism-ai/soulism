import { readFileSync, writeFileSync } from 'node:fs';
import { validatePersonaPack } from '@soulism/persona-schema/validate.js';
import { signPersonaPack, signPersonaPackWithKms } from '@soulism/persona-signing/sign.js';
import type { KmsProviderName } from '@soulism/persona-signing/providers/types.js';

const resolvePublicKey = (publicKey: string | undefined): string => {
  if (publicKey) return publicKey;
  return process.env.SIGNING_PUBLIC_KEY || process.env.SIGNER_PUBLIC_KEY || '';
};

type SignCommandOptions = {
  kmsProvider?: string;
  keyId?: string;
  keyMapPath?: string;
};

export const runSign = async (
  packPath: string | undefined,
  privateKey: string,
  publicKey?: string,
  options: SignCommandOptions = {}
): Promise<void> => {
  if (!packPath) {
    throw new Error('Usage: sign <pack.json> <privateKey> [publicKey] [--kms-provider=<aws|gcp|azure> --key-id=<id>]');
  }

  const pack = validatePersonaPack(JSON.parse(readFileSync(packPath, 'utf8')));

  const kmsProvider = options.kmsProvider?.trim() as KmsProviderName | undefined;
  const useKms = kmsProvider === 'aws' || kmsProvider === 'gcp' || kmsProvider === 'azure';
  if (!useKms && !privateKey) {
    throw new Error('signing_private_key_required: provide <privateKey> or use --kms-provider with --key-id');
  }

  const signed = useKms
    ? (() => {
        if (!options.keyId) {
          throw new Error('kms_key_id_required: provide --key-id when using --kms-provider');
        }
        return signPersonaPackWithKms(pack, kmsProvider, options.keyId, {
          keyMapPath: options.keyMapPath
        });
      })()
    : (() => {
        const resolvedPublicKey = resolvePublicKey(publicKey);
        if (!resolvedPublicKey) {
          throw new Error('signing_public_key_required: provide <publicKey> or set SIGNING_PUBLIC_KEY');
        }
        return signPersonaPack(pack, privateKey, resolvedPublicKey);
      })();

  const resolvedSigned = await signed;
  const out = { ...resolvedSigned, pack: pack };
  writeFileSync('signed-pack.json', JSON.stringify(out, null, 2));
  console.log(
    JSON.stringify(
      {
        status: 'signed',
        packId: pack.id,
        mode: pack.signature?.mode ?? 'dev',
        signaturePresent: Boolean(resolvedSigned.signature),
        publicKeyPresent: Boolean(resolvedSigned.publicKey),
        ...(resolvedSigned.provider ? { provider: resolvedSigned.provider } : {}),
        ...(resolvedSigned.keyId ? { keyId: resolvedSigned.keyId } : {}),
        ...(resolvedSigned.source ? { source: resolvedSigned.source } : {})
      },
      null,
      2
    )
  );
};
