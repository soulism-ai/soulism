import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { PersonaPack } from '@soulism/persona-schema/types.js';
import { verifyPersonaPackSignature } from './verify.js';
import { stableStringify } from '@soulism/shared/json.js';

export type SignaturePolicyMode = 'dev' | 'strict' | 'enforced';

export interface SignaturePolicyOptions {
  mode?: string;
  productionMode?: boolean;
  strictSigning?: boolean;
}

export interface SignatureEnvelopeInput {
  signature?: string;
  publicKey?: string;
}

export interface PersonaPackSignatureState {
  ok: boolean;
  mode: SignaturePolicyMode;
  reason?: string;
  reasonCode:
    | 'ok'
    | 'mode_skipped'
    | 'missing_signature_or_key'
    | 'signature_invalid'
    | 'signature_verification_error';
  signaturePresent: boolean;
  publicKeyPresent: boolean;
  signatureVerified: boolean;
  signatureSource: 'provided' | 'embedded' | 'none';
  publicKeySource: 'provided' | 'embedded' | 'none';
  publicDigest?: string;
}

interface SignatureModeContext {
  productionMode: boolean;
  strictSigning: boolean;
}

const allowedModes = new Set<SignaturePolicyMode>(['dev', 'strict', 'enforced']);

const normalizeMode = (value?: string): SignaturePolicyMode => {
  if (!value) return 'dev';
  const normalized = String(value).trim().toLowerCase();
  if (allowedModes.has(normalized as SignaturePolicyMode)) return normalized as SignaturePolicyMode;
  throw new Error(`invalid_signature_policy_mode:${normalized}`);
};

const sha256 = (value: string): string => `sha256:${createHash('sha256').update(value).digest('hex')}`;

const resolveMode = (mode: SignaturePolicyMode, context: SignatureModeContext): SignaturePolicyMode => {
  if (context.productionMode && mode === 'dev') return 'strict';
  if (context.strictSigning) return 'strict';
  return mode;
};

const describeModePolicy = (mode: SignaturePolicyMode): string => {
  if (mode === 'dev') return 'development';
  if (mode === 'strict') return 'strict';
  return 'enforced';
};

const getSignatureSourceLabel = (signature?: string, publicKey?: string, embeddedSignature?: string, embeddedPublicKey?: string) => {
  if (signature) return 'provided';
  if (embeddedSignature) return 'embedded';
  return 'none';
};

export const resolveSignaturePolicyMode = (
  mode?: string,
  productionMode = false,
  strictSigning = false
): SignaturePolicyMode => {
  const normalized = normalizeMode(mode);
  return resolveMode(normalized, { productionMode, strictSigning });
};

export const readPublicKeyIfExists = (path?: string): string => {
  if (!path) return '';
  try {
    return readFileSync(path, 'utf8').trim();
  } catch {
    return '';
  }
};

export const buildUnsignedPersonaPayload = (pack: PersonaPack): PersonaPack => {
  const payload = structuredClone(pack);
  if (!payload.signature) return payload;
  payload.signature = {
    ...payload.signature,
    value: undefined,
    publicKey: undefined
  };
  return payload;
};

export const buildPackDigest = (pack: PersonaPack): string => sha256(stableStringify(pack));

export const verifyPackedPersonaSignature = (
  pack: PersonaPack,
  request: SignatureEnvelopeInput,
  mode: SignaturePolicyMode
): PersonaPackSignatureState => {
  const effectiveMode = normalizeMode(mode);
  const signatureProvided = request.signature || '';
  const publicKeyProvided = request.publicKey || '';
  const embeddedSignature = pack.signature?.value || '';
  const embeddedPublicKey = pack.signature?.publicKey || '';

  const signature = signatureProvided || embeddedSignature;
  const publicKey = publicKeyProvided || embeddedPublicKey;

  const signatureSource = getSignatureSourceLabel(signatureProvided, publicKeyProvided, embeddedSignature, embeddedPublicKey);
  const publicKeySource = signatureProvided || publicKeyProvided ? signatureSource : getSignatureSourceLabel('', '', embeddedSignature, embeddedPublicKey);

  const signaturePresent = Boolean(signature);
  const publicKeyPresent = Boolean(publicKey);
  const modeAllowsNoSignature = effectiveMode === 'dev';

  if (modeAllowsNoSignature && !signaturePresent && !publicKeyPresent) {
    return {
      ok: true,
      mode: effectiveMode,
      reason: `signature policy in ${describeModePolicy(effectiveMode)} mode allows unsigned runtime behavior`,
      reasonCode: 'mode_skipped',
      signaturePresent: false,
      publicKeyPresent: false,
      signatureVerified: false,
      signatureSource: 'none',
      publicKeySource: 'none'
    };
  }

  if (!signaturePresent || !publicKeyPresent) {
    return {
      ok: false,
      mode: effectiveMode,
      reason: 'missing signature/public key',
      reasonCode: 'missing_signature_or_key',
      signaturePresent,
      publicKeyPresent,
      signatureVerified: false,
      signatureSource: signaturePresent ? 'provided' : 'embedded',
      publicKeySource: publicKeyPresent ? 'provided' : 'embedded'
    };
  }

  try {
    const direct = verifyPersonaPackSignature(pack, signature, publicKey);
    const unsigned = verifyPersonaPackSignature(buildUnsignedPersonaPayload(pack), signature, publicKey);
    if (!direct && !unsigned) {
      return {
        ok: false,
        mode: effectiveMode,
        reason: 'signature verification failed',
        reasonCode: 'signature_invalid',
        signaturePresent: true,
        publicKeyPresent: true,
        signatureVerified: false,
        signatureSource,
        publicKeySource,
        publicDigest: buildPackDigest(buildUnsignedPersonaPayload(pack))
      };
    }

    return {
      ok: true,
      mode: effectiveMode,
      reason: 'signature verified',
      reasonCode: 'ok',
      signaturePresent: true,
      publicKeyPresent: true,
      signatureVerified: true,
      signatureSource,
      publicKeySource,
      publicDigest: buildPackDigest(pack)
    };
  } catch (error) {
    return {
      ok: false,
      mode: effectiveMode,
      reason: `signature verification threw: ${String(error)}`,
      reasonCode: 'signature_verification_error',
      signaturePresent: true,
      publicKeyPresent: true,
      signatureVerified: false,
      signatureSource,
      publicKeySource,
      publicDigest: buildPackDigest(buildUnsignedPersonaPayload(pack))
    };
  }
};

export const enforcePersonaPackSignature = (
  pack: PersonaPack,
  options: {
    signatureMode: SignaturePolicyMode;
    signature?: string;
    publicKey?: string;
  },
  envContext: SignatureModeContext = { productionMode: false, strictSigning: false }
): PersonaPackSignatureState => {
  const mode = resolveMode(options.signatureMode, envContext);
  return verifyPackedPersonaSignature(pack, { signature: options.signature, publicKey: options.publicKey }, mode);
};

export type { SignaturePolicyMode as PersonaSignaturePolicyMode };
