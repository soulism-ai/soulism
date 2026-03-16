import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { readDocument } from '../contracts/lib/contract-validation.js';
import { validatePersonaManifest, validatePersonaPack } from '../../packages/persona-schema/src/validate.js';
import type { PersonaManifest, PersonaPack } from '../../packages/persona-schema/src/types.js';
import { signPersonaPackWithKms } from '../../packages/persona-signing/src/sign.js';
import type { KmsProviderName } from '../../packages/persona-signing/src/providers/types.js';

type JsonRecord = Record<string, unknown>;
type SourceManifest = {
  id: string;
  version?: string;
  provenance?: {
    createdAt?: string;
  };
};

const root = process.cwd();

const getArg = (name: string): string | undefined => {
  const match = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  return match ? match.slice(name.length + 3) : undefined;
};

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asString = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : fallback;

const asStringList = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : [];

const normalizePersona = (value: unknown): PersonaManifest => {
  if (!isRecord(value)) {
    throw new Error('persona_source_not_object');
  }

  const style = isRecord(value.style) ? value.style : {};

  return validatePersonaManifest({
    id: asString(value.id),
    name: asString(value.name),
    displayName: asString(value.display_name ?? value.displayName) || undefined,
    description: asString(value.description),
    version: asString(value.version, '1.0.0'),
    extends: asStringList(value.extends),
    systemPrompt: asString(value.system_prompt ?? value.systemPrompt),
    userPromptTemplate: asString(value.user_prompt_template ?? value.userPromptTemplate),
    traits: asStringList(value.traits),
    allowedTools: asStringList(value.allowed_tools ?? value.allowedTools),
    deniedTools: asStringList(value.denied_tools ?? value.deniedTools),
    style: {
      tone: asString(style.tone) || undefined,
      constraints: asStringList(style.constraints),
      examples: asStringList(style.examples)
    },
    riskClass: asString(value.risk_class ?? value.riskClass, 'low'),
    metadata: isRecord(value.metadata) ? value.metadata : {}
  });
};

const loadSourceManifest = async (dir: string): Promise<SourceManifest> => {
  const manifestPath = join(dir, 'manifest.json');
  const parsed = JSON.parse(await readFile(manifestPath, 'utf8')) as unknown;
  if (!isRecord(parsed) || typeof parsed.id !== 'string') {
    throw new Error(`invalid_pack_manifest:${manifestPath}`);
  }
  return {
    id: parsed.id,
    version: typeof parsed.version === 'string' ? parsed.version : '1.0.0',
    provenance: isRecord(parsed.provenance) ? { createdAt: asString(parsed.provenance.createdAt) || undefined } : undefined
  };
};

const toCreatedAt = (value?: string): number => {
  if (!value) return Date.now();
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Date.now();
};

const run = async () => {
  const outDir = resolve(root, getArg('out') || process.env.BOOTSTRAP_PERSONA_OUT_DIR || 'build/bootstrap-packs');
  const provider = (getArg('provider') || process.env.BOOTSTRAP_PERSONA_KMS_PROVIDER || 'aws') as KmsProviderName;
  const keyId = getArg('key-id') || process.env.BOOTSTRAP_PERSONA_KMS_KEY_ID || process.env.SIGNING_KMS_ALIAS || 'marketplace-key-1';
  const packsRoot = resolve(root, getArg('packs-root') || process.env.BOOTSTRAP_PERSONA_SOURCE_DIR || 'packs');

  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  const packDirs = (await readdir(packsRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(packsRoot, entry.name))
    .sort();

  let written = 0;
  for (const packDir of packDirs) {
    const sourceManifest = await loadSourceManifest(packDir);
    const personasDir = join(packDir, 'personas');
    const personaFiles = (await readdir(personasDir, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && (entry.name.endsWith('.yml') || entry.name.endsWith('.yaml')))
      .map((entry) => join(personasDir, entry.name))
      .sort();

    for (const personaFile of personaFiles) {
      const { data } = await readDocument(personaFile);
      const persona = normalizePersona(data);
      const signatureEnvelope = {
        algorithm: 'kms',
        mode: 'enforced' as const,
        signer: `${provider}:${keyId}`,
        createdAt: Date.now()
      };
      const unsignedPack = validatePersonaPack({
        id: persona.id,
        version: sourceManifest.version || '1.0.0',
        schemaVersion: '1.0.0',
        persona,
        signature: signatureEnvelope,
        parentPack: sourceManifest.id,
        provenance: {
          source: `bootstrap:${sourceManifest.id}`,
          createdAt: toCreatedAt(sourceManifest.provenance?.createdAt)
        }
      });

      const signed = await signPersonaPackWithKms(unsignedPack, provider, keyId);
      const finalPack = validatePersonaPack({
        ...signed.pack,
        signature: {
          ...signatureEnvelope,
          value: signed.signature,
          publicKey: signed.publicKey
        }
      });

      await writeFile(join(outDir, `${persona.id}.json`), `${JSON.stringify(finalPack, null, 2)}\n`, 'utf8');
      written += 1;
    }
  }

  console.log(`generated ${written} signed bootstrap persona packs in ${outDir}`);
};

run().catch((error) => {
  console.error(String(error));
  process.exit(1);
});
