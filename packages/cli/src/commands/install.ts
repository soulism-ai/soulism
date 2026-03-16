import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { PersonaPack } from '@soulism/persona-schema/types.js';
import { validatePersonaPack } from '@soulism/persona-schema/validate.js';
import { enforcePersonaPackSignature, readPublicKeyIfExists, resolveSignaturePolicyMode } from '@soulism/persona-signing/policy.js';

type SignatureMode = 'dev' | 'strict' | 'enforced';

type PackEnvelope = {
  pack?: unknown;
  signature?: string;
  publicKey?: string;
  signatureMode?: string;
};

type InstallOptions = {
  target?: string;
  registryUrl?: string;
  signature?: string;
  publicKey?: string;
  signatureMode?: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const resolveMode = (requestedMode: string | undefined, packMode?: string): SignatureMode => {
  if (!requestedMode && packMode) {
    console.error(`warning: signatureMode in pack envelope is ignored (${packMode}); use --signature-mode or SIGNATURE_POLICY_MODE`);
  }
  return resolveSignaturePolicyMode(
    requestedMode || process.env.SIGNATURE_POLICY_MODE,
    process.env.PRODUCTION_MODE === 'true',
    process.env.STRICT_SIGNING === 'true'
  );
};

const resolveModeSource = (requestedMode?: string, packMode?: string): 'cli' | 'env' | 'legacy-pack' => {
  if (requestedMode) return 'cli';
  if (packMode) return 'legacy-pack';
  return 'env';
};

const parsePackSource = (sourcePath: string): PackEnvelope => {
  const raw = readFileSync(sourcePath, 'utf8');
  const parsed = JSON.parse(raw) as unknown;
  if (!isRecord(parsed)) {
    return { pack: parsed };
  }
  if ('pack' in parsed || 'signature' in parsed || 'publicKey' in parsed) {
    const envelope = parsed as Record<string, unknown>;
    return {
      pack: envelope.pack,
      signature: typeof envelope.signature === 'string' ? envelope.signature : undefined,
      publicKey: typeof envelope.publicKey === 'string' ? envelope.publicKey : undefined,
      signatureMode: typeof envelope.signatureMode === 'string' ? envelope.signatureMode : undefined
    };
  }
  return { pack: parsed };
};

const normalizeTargetPath = (rawTarget: string): string => {
  const resolvedTarget = resolve(rawTarget);
  return resolvedTarget;
};

const normalizeRegistryUrl = (value: string): string => {
  const trimmed = value.replace(/\/+$/, '');
  return trimmed.endsWith('/personas') ? trimmed : `${trimmed}/personas`;
};

const postToRegistry = async (
  registryUrl: string,
  payload: { id: string; pack: PersonaPack; signature?: string; publicKey?: string }
): Promise<unknown> => {
  const endpoint = normalizeRegistryUrl(registryUrl);
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const bodyText = await response.text();
  let body: unknown = null;
  try {
    body = bodyText ? JSON.parse(bodyText) : null;
  } catch {
    body = bodyText;
  }

  if (!response.ok) {
    throw new Error(`registry_install_failed:${response.status}:${bodyText || response.statusText}`);
  }

  return body;
};

export const runInstall = async (source: string | undefined, options: InstallOptions = {}): Promise<void> => {
  if (!source) {
    throw new Error('Usage: install <pack.json> [--target=<path>|--registry-url=<url>] [--signature=<sig>] [--public-key=<pem>]');
  }

  const sourcePath = resolve(source);
  const parsed = parsePackSource(sourcePath);
  if (parsed.pack === undefined) {
    throw new Error('Invalid install input: missing pack payload');
  }
  const pack = validatePersonaPack(parsed.pack as PersonaPack);
  const explicitSignature = options.signature || parsed.signature || '';
  const explicitPublicKey = options.publicKey || parsed.publicKey || '';
  const mode = resolveMode(options.signatureMode, parsed.signatureMode);
  const modeSource = resolveModeSource(options.signatureMode, parsed.signatureMode);
  const requestPublicKey = explicitPublicKey || readPublicKeyIfExists(process.env.SIGNING_PUBLIC_KEY_PATH) || pack.signature?.publicKey || '';
  const requestSignature = explicitSignature || pack.signature?.value || '';
  const decision = enforcePersonaPackSignature(
    pack,
    {
      signatureMode: mode,
      signature: requestSignature,
      publicKey: requestPublicKey
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
          status: 'signature_rejected',
          mode: decision.mode,
          reasonCode: decision.reasonCode,
          reason: decision.reason,
          signaturePresent: decision.signaturePresent,
          publicKeyPresent: decision.publicKeyPresent
        },
        null,
        2
      )
    );
  }

  const resolvedSignature = requestSignature || '';
  const resolvedPublicKey = requestPublicKey || '';

  const registryUrl = options.registryUrl || process.env.COGNITIVE_PERSONA_REGISTRY_URL;
  if (registryUrl) {
    const response = await postToRegistry(registryUrl, {
      id: pack.id,
      pack,
      signature: resolvedSignature || undefined,
      publicKey: resolvedPublicKey || undefined
    });
    console.log(
	      JSON.stringify(
          {
            status: decision.ok ? 'installed' : 'signature_rejected',
            packId: pack.id,
            mode: decision.mode,
            modeSource,
            reasonCode: decision.reasonCode,
            reason: decision.reason,
            source: sourcePath,
            target: 'registry',
            registryUrl,
          verification: decision,
          response
        },
        null,
        2
      )
    );
    return;
  }

  const targetDir = normalizeTargetPath(options.target || './packs');
  if (!existsSync(targetDir)) {
    mkdirSync(targetDir, { recursive: true });
  }

  const destination = join(targetDir, `${pack.id}.json`);
  const persistedPack = {
    ...pack,
    ...(resolvedSignature || resolvedPublicKey
      ? {
          signature: {
            ...pack.signature,
            algorithm: pack.signature?.algorithm || 'ed25519',
            mode: pack.signature?.mode || decision.mode,
            value: resolvedSignature || pack.signature?.value || '',
            publicKey: resolvedPublicKey || pack.signature?.publicKey || ''
          }
        }
      : {})
  } as PersonaPack;

  writeFileSync(
    destination,
    JSON.stringify(persistedPack, null, 2),
    'utf8'
  );

  console.log(
    JSON.stringify(
        {
          status: 'installed',
          packId: pack.id,
          mode: decision.mode,
          modeSource,
          reasonCode: decision.reasonCode,
          reason: decision.reason,
          source: sourcePath,
        target: 'local',
        targetDir,
        path: destination,
        verification: {
          verified: decision.ok,
          signaturePresent: Boolean(resolvedSignature),
          publicKeyPresent: Boolean(resolvedPublicKey),
          hasEmbeddedSignature: Boolean(pack.signature?.value),
          hasEmbeddedPublicKey: Boolean(pack.signature?.publicKey)
        }
      },
      null,
      2
    )
  );
};
