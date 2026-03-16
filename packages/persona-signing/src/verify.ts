import { readFileSync } from 'node:fs';
import { PersonaPack } from '@soulism/persona-schema/types.js';
import { verifyPayload } from '@soulism/shared/crypto.js';
import { stableStringify } from '@soulism/shared/json.js';
import { validatePersonaPack } from '@soulism/persona-schema/validate.js';
import { enforcePersonaPackSignature, resolveSignaturePolicyMode, readPublicKeyIfExists } from './policy.js';

export const verifyPersonaPackSignature = (pack: PersonaPack, signature: string, publicKey: string): boolean => {
  return verifyPayload(stableStringify(pack), signature, publicKey);
};

type Envelope = {
  pack?: unknown;
  signature?: string;
  publicKey?: string;
};

type SignatureMode = 'dev' | 'strict' | 'enforced';

const parsePackInput = (packPath: string | undefined): unknown => {
  if (!packPath) {
    throw new Error('Usage: verify <pack.json|signed-pack.json> [signature] [public-key]');
  }
  const content = readFileSync(packPath, 'utf8');
  return JSON.parse(content) as unknown;
};

const normalizeEnvelope = (value: unknown): Envelope => {
  if (!value || typeof value !== 'object') return {};
  const candidate = value as Record<string, unknown>;
  if ('pack' in candidate) {
    return {
      pack: candidate.pack,
      signature: typeof candidate.signature === 'string' ? candidate.signature : undefined,
      publicKey: typeof candidate.publicKey === 'string' ? candidate.publicKey : undefined
    };
  }
  return {
    pack: candidate,
    signature: typeof candidate.signature === 'string' ? candidate.signature : undefined,
    publicKey: typeof candidate.publicKey === 'string' ? candidate.publicKey : undefined
  };
};

const resolveMode = (
  requestedMode: string | undefined,
  productionMode = false,
  strictSigning = false
): SignatureMode => resolveSignaturePolicyMode(requestedMode, productionMode, strictSigning);

export const runVerify = async (
  packPath: string | undefined,
  signature = '',
  publicKey = '',
  signatureMode?: string
): Promise<void> => {
  const raw = parsePackInput(packPath);
  const envelope = normalizeEnvelope(raw);

  const pack = validatePersonaPack((envelope.pack as PersonaPack) ?? raw);
  const mode = resolveMode(
    signatureMode || process.env.SIGNATURE_POLICY_MODE,
    process.env.PRODUCTION_MODE === 'true',
    process.env.STRICT_SIGNING === 'true'
  );
  const requestedPublicKey = publicKey || envelope.publicKey || readPublicKeyIfExists(process.env.SIGNING_PUBLIC_KEY_PATH);
  const requestedSignature = signature || envelope.signature || '';

  const decision = enforcePersonaPackSignature(pack, {
    signatureMode: mode,
    signature: requestedSignature,
    publicKey: requestedPublicKey
  });

  if (!decision.ok) {
    throw new Error(
      JSON.stringify(
        {
          status: 'signature_invalid',
          mode: decision.mode,
          reasonCode: decision.reasonCode,
          reason: decision.reason,
          packId: pack.id,
          signaturePresent: decision.signaturePresent,
          publicKeyPresent: decision.publicKeyPresent
        },
        null,
        2
      )
    );
  }

  console.log(
    JSON.stringify(
      {
        status: decision.ok ? 'signature_valid' : 'signature_invalid',
        mode: decision.mode,
        reasonCode: decision.reasonCode,
        reason: decision.reason || 'ok',
        verified: decision.signatureVerified,
        packId: pack.id,
        signaturePresent: decision.signaturePresent,
        publicKeyPresent: decision.publicKeyPresent,
        signatureSource: decision.signatureSource,
        publicKeySource: decision.publicKeySource,
        publicDigest: decision.publicDigest
      },
      null,
      2
    )
  );
};
