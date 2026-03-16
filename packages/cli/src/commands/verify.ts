import { readFileSync } from 'node:fs';
import { validatePersonaPack } from '@soulism/persona-schema/validate.js';
import { PersonaPack } from '@soulism/persona-schema/types.js';
import { enforcePersonaPackSignature, readPublicKeyIfExists, resolveSignaturePolicyMode } from '@soulism/persona-signing/policy.js';

type Envelope = {
  pack?: unknown;
  signature?: string;
  publicKey?: string;
};

type SignatureMode = 'dev' | 'strict' | 'enforced';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isEnvelope = (value: unknown): value is Envelope =>
  isRecord(value) && (Object.prototype.hasOwnProperty.call(value, 'pack') || Object.prototype.hasOwnProperty.call(value, 'signature') || Object.prototype.hasOwnProperty.call(value, 'publicKey'));

const resolveMode = (requestedMode?: string): SignatureMode =>
  resolveSignaturePolicyMode(
    requestedMode || process.env.SIGNATURE_POLICY_MODE,
    process.env.PRODUCTION_MODE === 'true',
    process.env.STRICT_SIGNING === 'true'
  );

const parseInput = (packPath: string | undefined): Envelope => {
  if (!packPath) {
    throw new Error('Usage: verify <pack.json|signed-pack.json> [signature] [publicKey]');
  }

  const raw = readFileSync(packPath, 'utf8');
  const payload = JSON.parse(raw) as unknown;
  if (!isRecord(payload)) {
    return { pack: payload };
  }

  if ('pack' in payload || 'signature' in payload || 'publicKey' in payload) {
    const envelope = payload as Record<string, unknown>;
    return {
      pack: envelope.pack,
      signature: typeof envelope.signature === 'string' ? envelope.signature : undefined,
      publicKey: typeof envelope.publicKey === 'string' ? envelope.publicKey : undefined
    };
  }

  return { pack: payload };
};

export const runVerify = async (
  packPath: string | undefined,
  signature: string,
  publicKey: string,
  signatureMode?: string
): Promise<void> => {
  const envelope = parseInput(packPath);
  if (envelope.pack === undefined) {
    throw new Error('Invalid verify input: missing pack payload and no embedded envelope pack field');
  }
  const pack = validatePersonaPack(envelope.pack as PersonaPack);
  const requestedSignature = signature || envelope.signature || '';
  const requestedPublicKey = publicKey || envelope.publicKey || readPublicKeyIfExists(process.env.SIGNING_PUBLIC_KEY_PATH);
  const mode = resolveMode(signatureMode);
  const decision = enforcePersonaPackSignature(
    pack,
    {
      signatureMode: mode,
      signature: requestedSignature,
      publicKey: requestedPublicKey
    },
    {
      productionMode: process.env.PRODUCTION_MODE === 'true',
      strictSigning: process.env.STRICT_SIGNING === 'true'
    }
  );

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
        status: 'signature_valid',
        mode: decision.mode,
        reasonCode: decision.reasonCode,
        reason: decision.reason || 'ok',
        packId: pack.id,
        verified: decision.signatureVerified,
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
