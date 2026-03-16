import { createHash, createPublicKey } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { stableStringify } from '../../packages/shared/src/json.js';
import { verifyPayload } from '../../packages/shared/src/crypto.js';
import {
  ValidationIssue,
  collectReport,
  ensureObject,
  ensureString,
  failOnIssues,
  isSemVer,
  readDocument,
  readJsonFile,
  validateDocument,
  writeEvidence
} from './lib/contract-validation';

type RecordLike = Record<string, unknown>;
type PackDirectory = {
  name: string;
  dir: string;
  manifestPath: string;
  personasDir: string;
  signaturesDir: string;
};

type PackManifest = {
  id?: unknown;
  version?: unknown;
  schemaVersion?: unknown;
  publisher?: unknown;
  personas?: unknown;
  compatibility?: unknown;
  provenance?: unknown;
};

type PackSignature = {
  packId?: unknown;
  algorithm?: unknown;
  digest?: unknown;
  signature?: unknown;
  publisher?: unknown;
  createdAt?: unknown;
  compatibility?: unknown;
};

type PackPersona = {
  id?: unknown;
  name?: unknown;
  description?: unknown;
  role?: unknown;
  risk_class?: unknown;
  riskClass?: unknown;
  allowed_tools?: unknown;
  extends?: unknown;
  style?: unknown;
  constraints?: unknown;
};

const root = process.cwd();
const placeholderPattern = /\b(placeholder|todo|fill_me|replace_me)\b/i;
const riskClasses = new Set(['low', 'medium', 'high', 'critical']);
const base64Pattern = /^[A-Za-z0-9+/=]{16,}$/;

const manifestSchemaPath = join(root, 'packages/contracts/schemas/pack.manifest.schema.json');
const personaSchemaPath = join(root, 'packages/contracts/schemas/pack.persona.schema.json');
const signatureSchemaPath = join(root, 'packages/contracts/schemas/pack.signature.schema.json');
const evidencePath = join(root, 'ci/baselines/contracts/pack-artifacts.validation.json');

const isRecord = (value: unknown): value is RecordLike =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isString = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const isStringList = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => isString(item));
const hasPlaceholder = (value: unknown): boolean => isString(value) && placeholderPattern.test(value);

const sortUnique = (values: string[]): string[] => [...new Set(values)].sort();

const sha256 = (value: string): string => `sha256:${createHash('sha256').update(value).digest('hex')}`;

const splitExtends = (value: unknown): string[] => {
  if (isString(value)) {
    return value.trim().length > 0 ? [value.trim()] : [];
  }
  if (isStringList(value)) {
    return value.map((item) => item.trim()).filter(Boolean);
  }
  return [];
};

const isLooksLikeBase64 = (value: string): boolean => base64Pattern.test(value) && value.length % 4 === 0;

const addIssue = (
  issues: ValidationIssue[],
  file: string,
  severity: ValidationIssue['severity'],
  code: string,
  path: string,
  message: string,
  expectedType?: string,
  actualType?: string
): void => {
  issues.push({
    file,
    severity,
    code,
    path,
    message,
    expectedType,
    actualType
  });
};

const readText = async (path: string): Promise<string> => {
  const content = await readFile(path, 'utf8');
  return content;
};

const discoverPackDirectories = async (): Promise<PackDirectory[]> => {
  const packsRoot = join(root, 'packs');
  const entries = await readdir(packsRoot, { withFileTypes: true });
  const packs: PackDirectory[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) {
      continue;
    }
    if (entry.name === 'node_modules' || entry.name === '.git') {
      continue;
    }

    const dir = join(packsRoot, entry.name);
    const manifestPath = join(dir, 'manifest.json');
    const personasDir = join(dir, 'personas');
    const signaturesDir = join(dir, 'signatures');
    packs.push({
      name: entry.name,
      dir,
      manifestPath,
      personasDir,
      signaturesDir
    });
  }
  return packs;
};

const readPackManifest = async (pack: PackDirectory, schema: RecordLike): Promise<{ manifest: PackManifest | null; issues: ValidationIssue[] }> => {
  const issues: ValidationIssue[] = [];

  let raw: string;
  try {
    raw = await readText(pack.manifestPath);
  } catch (error) {
    addIssue(
      issues,
      pack.manifestPath,
      'error',
      'pack_manifest_missing',
      '$',
      `failed to read manifest.json: ${String(error)}`
    );
    return { manifest: null, issues };
  }

  if (raw.trim().length === 0) {
    addIssue(issues, pack.manifestPath, 'error', 'pack_manifest_empty', '$', 'manifest.json is empty');
    return { manifest: null, issues };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch (error) {
    addIssue(
      issues,
      pack.manifestPath,
      'error',
      'pack_manifest_invalid_json',
      '$',
      `manifest.json contains invalid JSON: ${String(error)}`
    );
    return { manifest: null, issues };
  }
  issues.push(...validateDocument(pack.manifestPath, parsed, schema, 220));

  if (!isRecord(parsed)) {
    addIssue(issues, pack.manifestPath, 'error', 'pack_manifest_not_object', '$', 'manifest.json is not a JSON object');
    return { manifest: null, issues };
  }

  const manifest = parsed as PackManifest;
  issues.push(...ensureObject(manifest, pack.manifestPath, '$', 'pack_manifest_not_object'));

  if (!isString(manifest.id)) {
    addIssue(issues, pack.manifestPath, 'error', 'pack_manifest_id_missing', '$.id', 'manifest.id is required');
  } else if (hasPlaceholder(manifest.id)) {
    addIssue(issues, pack.manifestPath, 'warning', 'pack_manifest_id_placeholder', '$.id', `placeholder detected in pack id '${manifest.id}'`);
  }

  if (!isString(manifest.version)) {
    addIssue(issues, pack.manifestPath, 'error', 'pack_manifest_version_missing', '$.version', 'manifest.version is required');
  } else if (!isSemVer(manifest.version)) {
    addIssue(
      issues,
      pack.manifestPath,
      'warning',
      'pack_manifest_version_nonstandard',
      '$.version',
      `manifest.version should be semver (${manifest.version})`
    );
  }

  if (!isString(manifest.schemaVersion)) {
    addIssue(
      issues,
      pack.manifestPath,
      'error',
      'pack_manifest_schema_version_missing',
      '$.schemaVersion',
      'manifest.schemaVersion is required'
    );
  } else if (manifest.schemaVersion !== '1.0.0' && !isSemVer(manifest.schemaVersion)) {
    addIssue(
      issues,
      pack.manifestPath,
      'warning',
      'pack_manifest_schema_version_nonstandard',
      '$.schemaVersion',
      `unexpected manifest.schemaVersion (${manifest.schemaVersion})`
    );
  }

  if (!isString(manifest.publisher)) {
    addIssue(issues, pack.manifestPath, 'error', 'pack_manifest_publisher_missing', '$.publisher', 'manifest.publisher is required');
  } else if (hasPlaceholder(manifest.publisher)) {
    addIssue(
      issues,
      pack.manifestPath,
      'warning',
      'pack_manifest_publisher_placeholder',
      '$.publisher',
      `placeholder detected in publisher '${manifest.publisher}'`
    );
  }

  if (!isStringList(manifest.personas)) {
    addIssue(
      issues,
      pack.manifestPath,
      'error',
      'pack_manifest_personas_invalid',
      '$.personas',
      'manifest.personas must be a non-empty array of ids'
    );
  } else if (manifest.personas.length === 0) {
    addIssue(issues, pack.manifestPath, 'error', 'pack_manifest_personas_empty', '$.personas', 'manifest.personas must include at least one persona');
  } else if (new Set(manifest.personas).size !== manifest.personas.length) {
    addIssue(
      issues,
      pack.manifestPath,
      'error',
      'pack_manifest_personas_duplicate',
      '$.personas',
      'manifest.personas contains duplicates'
    );
  }

  if (!isRecord(manifest.compatibility)) {
    addIssue(
      issues,
      pack.manifestPath,
      'error',
      'pack_manifest_compatibility_missing',
      '$.compatibility',
      'manifest.compatibility.runtime and manifest.compatibility.personaSchema are required'
    );
  } else {
    if (!isString((manifest.compatibility as RecordLike).runtime)) {
      addIssue(
        issues,
        pack.manifestPath,
        'error',
        'pack_manifest_runtime_missing',
        '$.compatibility.runtime',
        'manifest.compatibility.runtime is required'
      );
    }
    if (!isString((manifest.compatibility as RecordLike).personaSchema)) {
      addIssue(
        issues,
        pack.manifestPath,
        'error',
        'pack_manifest_persona_schema_missing',
        '$.compatibility.personaSchema',
        'manifest.compatibility.personaSchema is required'
      );
    } else if (!isSemVer((manifest.compatibility as RecordLike).personaSchema as string)) {
      addIssue(
        issues,
        pack.manifestPath,
        'warning',
        'pack_manifest_persona_schema_nonstandard',
        '$.compatibility.personaSchema',
        `non-semver personaSchema ${(manifest.compatibility as RecordLike).personaSchema}`
      );
    }
  }

  if (!isRecord(manifest.provenance)) {
    addIssue(
      issues,
      pack.manifestPath,
      'error',
      'pack_manifest_provenance_missing',
      '$.provenance',
      'manifest.provenance block is required'
    );
  } else {
    const provenance = manifest.provenance as RecordLike;
    for (const issue of ensureString(provenance.publisher, pack.manifestPath, '$.provenance.publisher', 'pack_manifest_provenance_publisher_missing')) {
      issues.push(issue);
    }
    for (const issue of ensureString(provenance.digest, pack.manifestPath, '$.provenance.digest', 'pack_manifest_provenance_digest_missing')) {
      issues.push(issue);
    }
    for (const issue of ensureString(provenance.signature, pack.manifestPath, '$.provenance.signature', 'pack_manifest_provenance_signature_missing')) {
      issues.push(issue);
    }
    for (const issue of ensureString(provenance.createdAt, pack.manifestPath, '$.provenance.createdAt', 'pack_manifest_provenance_created_at_missing')) {
      issues.push(issue);
    }

    if (hasPlaceholder(provenance.publisher)) {
      addIssue(issues, pack.manifestPath, 'warning', 'pack_manifest_provenance_placeholder', '$.provenance.publisher', 'placeholder detected in provenance.publisher');
    }
    if (hasPlaceholder(provenance.signature)) {
      addIssue(
        issues,
        pack.manifestPath,
        'warning',
        'pack_manifest_provenance_signature_placeholder',
        '$.provenance.signature',
        'placeholder detected in provenance.signature'
      );
    }
    if (isString(provenance.createdAt) && isNaN(Date.parse(provenance.createdAt))) {
      addIssue(
        issues,
        pack.manifestPath,
        'error',
        'pack_manifest_provenance_created_at_invalid',
        '$.provenance.createdAt',
        'provenance.createdAt must be valid ISO timestamp'
      );
    } else if (isString(provenance.createdAt) && Date.parse(provenance.createdAt) > Date.now() + 24 * 60 * 60 * 1000) {
      addIssue(
        issues,
        pack.manifestPath,
        'warning',
        'pack_manifest_provenance_created_at_future',
        '$.provenance.createdAt',
        'provenance.createdAt is in the future'
      );
    }
    if (isString(provenance.digest) && !/^sha256:[a-fA-F0-9]{64}$/.test(provenance.digest)) {
      addIssue(
        issues,
        pack.manifestPath,
        'error',
        'pack_manifest_provenance_digest_invalid',
        '$.provenance.digest',
        'provenance.digest must use sha256:<hex>'
      );
    }
  }

  return { manifest, issues };
};

const detectPersonaInheritanceCycles = (
  packName: string,
  extendsMap: Map<string, string[]>,
  file: string,
  issues: ValidationIssue[]
): void => {
  const state = new Map<string, 'unvisited' | 'visiting' | 'done'>();
  const stack: string[] = [];

  const visit = (current: string): boolean => {
    const marker = state.get(current) || 'unvisited';
    if (marker === 'done') {
      return false;
    }
    if (marker === 'visiting') {
      const cycleStart = stack.indexOf(current);
      const cycle = cycleStart === -1 ? [current] : stack.slice(cycleStart).concat(current);
      addIssue(
        issues,
        file,
        'error',
        'pack_persona_inheritance_cycle',
        '$.personas',
        `cycle detected in ${packName} pack persona inheritance: ${cycle.join(' -> ')}`
      );
      return true;
    }

    state.set(current, 'visiting');
    stack.push(current);

    const parents = extendsMap.get(current) || [];
    for (const parent of parents) {
      if (!extendsMap.has(parent)) {
        continue;
      }
      if (visit(parent)) {
        return true;
      }
    }

    stack.pop();
    state.set(current, 'done');
    return false;
  };

  for (const personaId of extendsMap.keys()) {
    if ((state.get(personaId) || 'unvisited') === 'unvisited') {
      visit(personaId);
    }
  }
};

const readPersonasDirectory = async (
  pack: PackDirectory
): Promise<{ personas: Map<string, string>; issues: ValidationIssue[] }> => {
  const issues: ValidationIssue[] = [];
  const persons = new Map<string, string>();
  try {
    const entries = await readdir(pack.personasDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) {
        continue;
      }
      const extension = entry.name.toLowerCase().slice(entry.name.lastIndexOf('.'));
      if (extension !== '.yml' && extension !== '.yaml') {
        continue;
      }

      const personaId = entry.name.replace(/\.ya?ml$/i, '');
      const personPath = join(pack.personasDir, entry.name);
      if (persons.has(personaId)) {
        addIssue(
          issues,
          personPath,
          'warning',
          'pack_persona_duplicate_file',
          '$',
          `multiple persona files resolve to same id ${personaId}`
        );
      } else {
        persons.set(personaId, personPath);
      }
    }
  } catch {
    // handled at caller with explicit issue to avoid extra pass
  }
  return { personas: persons, issues };
};

const validatePackPersonas = async (pack: PackDirectory, manifest: PackManifest, schema: RecordLike): Promise<{ issues: ValidationIssue[]; personaIds: string[] }> => {
  const issues: ValidationIssue[] = [];

  const manifestPersonaIds: string[] = isStringList(manifest.personas) ? manifest.personas : [];
  const manifestPersonaSet = new Set(manifestPersonaIds);

  let personaFiles = new Map<string, string>();
  const directoryIssues: ValidationIssue[] = [];
  try {
    const discovered = await readPersonasDirectory(pack);
    personaFiles = discovered.personas;
    directoryIssues.push(...discovered.issues);
  } catch {
    addIssue(issues, pack.personasDir, 'error', 'pack_personas_dir_missing', '$', `missing personas directory: ${pack.personasDir}`);
  }

  if (personaFiles.size === 0 && manifestPersonaIds.length > 0) {
    addIssue(issues, pack.personasDir, 'error', 'pack_personas_no_files', '$', `no persona files found in ${pack.personasDir}`);
  }

  const inheritance = new Map<string, string[]>();
  const loadedPersonas = new Set<string>();

  for (const personaId of manifestPersonaIds) {
    const exactYaml = join(pack.personasDir, `${personaId}.yml`);
    const exactYamlAlt = join(pack.personasDir, `${personaId}.yaml`);
    let filePath: string | null = null;

    if (personaFiles.has(personaId)) {
      filePath = personaFiles.get(personaId)!;
    } else {
      try {
        const entry = await readFile(exactYaml, 'utf8');
        if (entry.trim().length > 0) {
          filePath = exactYaml;
        }
      } catch {
        try {
          const entry = await readFile(exactYamlAlt, 'utf8');
          if (entry.trim().length > 0) {
            filePath = exactYamlAlt;
          }
        } catch {
          addIssue(issues, pack.manifestPath, 'error', 'pack_manifest_persona_missing_file', '$.personas', `missing persona artifact for ${personaId}`);
        }
      }
    }

    if (!filePath) {
      continue;
    }
    if (filePath.endsWith('.yml') && !personaFiles.has(personaId)) {
      personaFiles.set(personaId, filePath);
    }

    let raw: string;
    try {
      raw = await readText(filePath);
    } catch (error) {
      addIssue(issues, filePath, 'error', 'pack_persona_read_failed', '$', `failed to read persona file: ${String(error)}`);
      continue;
    }

    if (raw.trim().length === 0) {
      addIssue(issues, filePath, 'error', 'pack_persona_empty', '$', `persona file is empty (${personaId})`);
      continue;
    }

    let parsed: unknown;
    try {
      const document = await readDocument(filePath);
      parsed = document.data;
    } catch (error) {
      addIssue(issues, filePath, 'error', 'pack_persona_parse_failed', '$', `failed to parse persona YAML: ${String(error)}`);
      continue;
    }

    issues.push(...validateDocument(filePath, parsed, schema, 220));

    if (!isRecord(parsed)) {
      addIssue(issues, filePath, 'error', 'pack_persona_not_object', '$', 'persona file must parse as object');
      continue;
    }

    const persona = parsed as PackPersona;
    issues.push(...ensureObject(persona, filePath, '$', 'pack_persona_not_object'));

    if (!isString(persona.id)) {
      addIssue(issues, filePath, 'error', 'pack_persona_id_missing', '$.id', 'persona.id is required');
    } else {
      loadedPersonas.add(persona.id);
      if (persona.id !== personaId) {
        addIssue(
          issues,
          filePath,
          'error',
          'pack_persona_id_mismatch',
          '$.id',
          `persona filename suggests id '${personaId}' but persona.id is '${persona.id}'`
        );
      }
    }

    if (!isString(persona.name)) {
      addIssue(issues, filePath, 'error', 'pack_persona_name_missing', '$.name', 'persona.name is required');
    } else if (hasPlaceholder(persona.name)) {
      addIssue(issues, filePath, 'warning', 'pack_persona_name_placeholder', '$.name', `placeholder detected in persona name '${persona.name}'`);
    }

    if (isString(persona.description) && hasPlaceholder(persona.description)) {
      addIssue(
        issues,
        filePath,
        'warning',
        'pack_persona_description_placeholder',
        '$.description',
        `placeholder detected in persona description`
      );
    }
    if (!isString(persona.role)) {
      addIssue(issues, filePath, 'warning', 'pack_persona_role_missing', '$.role', `persona role is recommended but missing on ${personaId}`);
    }

    const riskClass = isString(persona.risk_class) ? persona.risk_class : isString(persona.riskClass) ? persona.riskClass : '';
    if (!riskClass) {
      addIssue(issues, filePath, 'error', 'pack_persona_risk_class_missing', '$.risk_class', 'risk class is required (risk_class)');
    } else if (!riskClasses.has(riskClass)) {
      addIssue(issues, filePath, 'error', 'pack_persona_risk_class_invalid', '$.risk_class', `invalid risk class ${riskClass}`);
    } else if (!isString(persona.risk_class) && isString(persona.riskClass)) {
      addIssue(
        issues,
        filePath,
        'warning',
        'pack_persona_risk_class_alias',
        '$.riskClass',
        `riskClass alias used; prefer risk_class for consistency`
      );
    }

    const allowedTools = splitExtends(persona.allowed_tools as unknown);
    if (!isStringList(persona.allowed_tools)) {
      addIssue(
        issues,
        filePath,
        'error',
        'pack_persona_allowed_tools_invalid',
        '$.allowed_tools',
        'allowed_tools must be an array of tool identifiers'
      );
    } else if (allowedTools.length === 0) {
      addIssue(issues, filePath, 'warning', 'pack_persona_allowed_tools_empty', '$.allowed_tools', 'allowed_tools is empty');
    }

    const extendsList = splitExtends((persona as RecordLike).extends);
    if ((persona as RecordLike).extends !== undefined) {
      if (isString((persona as RecordLike).extends) || isStringList((persona as RecordLike).extends)) {
        if (extendsList.length === 0) {
          addIssue(
            issues,
            filePath,
            'error',
            'pack_persona_extends_invalid',
            '$.extends',
            'extends must reference at least one parent'
          );
        }
      } else {
        addIssue(issues, filePath, 'error', 'pack_persona_extends_type', '$.extends', 'extends must be string or array of strings');
      }
    }

    for (const parentId of extendsList) {
      if (!manifestPersonaSet.has(parentId)) {
        addIssue(
          issues,
          filePath,
          'error',
          'pack_persona_extends_unknown_parent',
          '$.extends',
          `${parentId} is not listed in manifest.personas`
        );
      }
    }

    inheritance.set(personaId, sortUnique(extendsList));
    const canonical = sha256(stableStringify(parsed));
    addIssue(
      issues,
      filePath,
      'warning',
      'pack_persona_hash_recorded',
      '$.personaHash',
      `deterministic persona hash: ${canonical}`
    );
  }

  if (manifestPersonaIds.length > 0) {
    for (const [pathPersonaId] of personaFiles.entries()) {
      if (!manifestPersonaSet.has(pathPersonaId)) {
        addIssue(
          issues,
          pack.personasDir,
          'warning',
          'pack_persona_not_in_manifest',
          '$.personas',
          `persona file '${pathPersonaId}' exists in pack but is not listed in manifest.personas`
        );
      }
    }
  }

  if (manifestPersonaIds.length > loadedPersonas.size) {
    for (const id of manifestPersonaIds) {
      if (!loadedPersonas.has(id)) {
        addIssue(
          issues,
          pack.manifestPath,
          'error',
          'pack_persona_missing_or_invalid',
          '$.personas',
          `cannot validate manifest persona '${id}'`
        );
      }
    }
  }

  detectPersonaInheritanceCycles(pack.name, inheritance, pack.manifestPath, issues);
  issues.push(...directoryIssues);
  return { issues, personaIds: manifestPersonaIds };
};

const validatePackSignature = async (
  pack: PackDirectory,
  manifest: PackManifest,
  personaIds: string[],
  signatureSchema: RecordLike
): Promise<ValidationIssue[]> => {
  const issues: ValidationIssue[] = [];
  const signaturePath = join(pack.signaturesDir, 'pack.sig.json');
  const publicKeyPath = join(pack.signaturesDir, 'public_key.pem');
  let rawSignature: string;

  try {
    rawSignature = await readText(signaturePath);
  } catch (error) {
    addIssue(issues, signaturePath, 'error', 'pack_signature_file_missing', '$', `failed to read signatures/pack.sig.json: ${String(error)}`);
    return issues;
  }

  if (rawSignature.trim().length === 0) {
    addIssue(issues, signaturePath, 'error', 'pack_signature_file_empty', '$', 'signatures/pack.sig.json is empty');
    return issues;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawSignature) as unknown;
  } catch (error) {
    addIssue(
      issues,
      signaturePath,
      'error',
      'pack_signature_invalid_json',
      '$',
      `signature JSON is invalid: ${String(error)}`
    );
    return issues;
  }
  issues.push(...validateDocument(signaturePath, parsed, signatureSchema, 220));
  if (!isRecord(parsed)) {
    addIssue(issues, signaturePath, 'error', 'pack_signature_not_object', '$', 'signatures/pack.sig.json must be object');
    return issues;
  }

  const signature = parsed as PackSignature;
  issues.push(...ensureObject(signature, signaturePath, '$', 'pack_signature_not_object'));
  if ((signature as RecordLike).compatibility !== undefined && !isRecord((signature as RecordLike).compatibility)) {
    addIssue(
      issues,
      signaturePath,
      'warning',
      'pack_signature_compatibility_invalid',
      '$.compatibility',
      'compatibility should be an object'
    );
  }

  if (!isString(signature.packId)) {
    addIssue(issues, signaturePath, 'error', 'pack_signature_pack_id_missing', '$.packId', 'packId is required in signature metadata');
  } else if (manifest.id && signature.packId !== manifest.id) {
    addIssue(issues, signaturePath, 'error', 'pack_signature_pack_id_mismatch', '$.packId', `packId must match manifest id '${manifest.id}'`);
  }

  if (!isString(signature.algorithm)) {
    addIssue(issues, signaturePath, 'error', 'pack_signature_algorithm_missing', '$.algorithm', 'algorithm is required');
  } else if (signature.algorithm !== 'ed25519') {
    addIssue(issues, signaturePath, 'warning', 'pack_signature_algorithm_unusual', '$.algorithm', `unusual algorithm '${signature.algorithm}'`);
  }

  if (!isString(signature.publisher)) {
    addIssue(issues, signaturePath, 'error', 'pack_signature_publisher_missing', '$.publisher', 'publisher is required');
  }
  if (!isString(signature.digest) || !/^sha256:[A-Fa-f0-9]{64}$/.test(signature.digest)) {
    addIssue(issues, signaturePath, 'error', 'pack_signature_digest_invalid', '$.digest', 'digest should match sha256:<hex>');
  }
  if (!isString(signature.signature) || signature.signature.length < 8) {
    addIssue(issues, signaturePath, 'error', 'pack_signature_value_invalid', '$.signature', 'signature value is invalid or empty');
  }
  if (!isString(signature.createdAt) || Number.isNaN(Date.parse(signature.createdAt))) {
    addIssue(issues, signaturePath, 'error', 'pack_signature_created_at_invalid', '$.createdAt', 'createdAt is required and must be valid ISO timestamp');
  }

  if (isString(signature.digest) && isString(manifest.provenance?.digest as unknown) && signature.digest !== (manifest.provenance as RecordLike).digest) {
    addIssue(
      issues,
      signaturePath,
      'error',
      'pack_signature_digest_mismatch_manifest',
      '$.digest',
      'signature.digest does not match manifest.provenance.digest'
    );
  }

  if (isString(signature.signature) && isString((manifest.provenance as RecordLike).signature) && signature.signature !== (manifest.provenance as RecordLike).signature) {
    addIssue(
      issues,
      signaturePath,
      'error',
      'pack_signature_payload_mismatch_manifest',
      '$.signature',
      'signature value does not match manifest.provenance.signature'
    );
  }

  if (isString(signature.publisher) && isString(manifest.provenance?.publisher as unknown) && signature.publisher !== (manifest.provenance as RecordLike).publisher) {
    addIssue(
      issues,
      signaturePath,
      'warning',
      'pack_signature_publisher_mismatch',
      '$.publisher',
      'signature.publisher does not match manifest.provenance.publisher'
    );
  }
  if (isString(signature.createdAt) && isString((manifest.provenance as RecordLike).createdAt) && signature.createdAt !== (manifest.provenance as RecordLike).createdAt) {
    addIssue(
      issues,
      signaturePath,
      'warning',
      'pack_signature_created_at_mismatch',
      '$.createdAt',
      'signature.createdAt does not match manifest.provenance.createdAt'
    );
  }

  if (signature.compatibility !== undefined && !isRecord(signature.compatibility)) {
    addIssue(issues, signaturePath, 'warning', 'pack_signature_compatibility_invalid', '$.compatibility', 'compatibility should be an object');
  } else if (isRecord(signature.compatibility)) {
    const compatibility = signature.compatibility as RecordLike;
    const schemaVersion = compatibility.minPersonaSchemaVersion;
    if (isString(schemaVersion) && manifest.compatibility && isString((manifest.compatibility as RecordLike).personaSchema) && schemaVersion !== (manifest.compatibility as RecordLike).personaSchema) {
      addIssue(
        issues,
        signaturePath,
        'warning',
        'pack_signature_compatibility_schema_mismatch',
        '$.compatibility.minPersonaSchemaVersion',
        `minPersonaSchemaVersion ${schemaVersion} differs from manifest compatibility ${String((manifest.compatibility as RecordLike).personaSchema)}`
      );
    }
    if (compatibility.minCliVersion && !isString(compatibility.minCliVersion)) {
      addIssue(
        issues,
        signaturePath,
        'error',
        'pack_signature_min_cli_version_invalid',
        '$.compatibility.minCliVersion',
        'minCliVersion must be string'
      );
    } else if (isString(compatibility.minCliVersion) && !isSemVer(compatibility.minCliVersion)) {
      addIssue(
        issues,
        signaturePath,
        'warning',
        'pack_signature_min_cli_version_non_standard',
        '$.compatibility.minCliVersion',
        `non-semver minCliVersion: ${compatibility.minCliVersion}`
      );
    }
    if (compatibility.runtimes !== undefined && !isStringList(compatibility.runtimes)) {
      addIssue(
        issues,
        signaturePath,
        'warning',
        'pack_signature_compatibility_runtimes_invalid',
        '$.compatibility.runtimes',
        'compatibility.runtimes should be string array when provided'
      );
    }
  }

  const publicKeyRaw = await readText(publicKeyPath).catch(() => '');
  if (!publicKeyRaw) {
    addIssue(issues, publicKeyPath, 'error', 'pack_signature_public_key_missing', '$', 'signatures/public_key.pem is required');
  } else {
    if (publicKeyRaw.trim().length === 0) {
      addIssue(issues, publicKeyPath, 'error', 'pack_signature_public_key_empty', '$', 'public_key.pem is empty');
    }
    if (hasPlaceholder(publicKeyRaw)) {
      addIssue(
        issues,
        publicKeyPath,
        'warning',
        'pack_signature_public_key_placeholder',
        '$',
        'public key contains placeholder-like content'
      );
    }
    try {
      createPublicKey(publicKeyRaw);
    } catch {
      addIssue(
        issues,
        publicKeyPath,
        'error',
        'pack_signature_public_key_invalid',
        '$',
        'public_key.pem could not be parsed as PEM public key'
      );
    }
  }

  if (isString(signature.signature) && isLooksLikeBase64(signature.signature) && publicKeyRaw && isString(signature.digest)) {
    try {
      const verified = verifyPayload(signature.digest, signature.signature, publicKeyRaw);
      if (!verified) {
        addIssue(
          issues,
          signaturePath,
          'warning',
          'pack_signature_verification_failed',
          '$.signature',
          `signature payload verification failed against manifest digest ${signature.digest}`
        );
      }
    } catch (error) {
      addIssue(
        issues,
        signaturePath,
        'warning',
        'pack_signature_verification_error',
        '$.signature',
        `signature verification attempt failed: ${String(error)}`
      );
    }
  } else {
    addIssue(
      issues,
      signaturePath,
      'warning',
      'pack_signature_verification_skipped',
      '$.signature',
      'signature appears non-base64 or key missing; verification was skipped'
    );
  }

  if (isString(manifest.compatibility?.personaSchema as unknown) && manifest.personas && personaIds.length > 0) {
    // Keep a lightweight schema-version compatibility signal for downstream tooling.
    const canonical = sha256(stableStringify(manifest.personas));
    addIssue(issues, pack.manifestPath, 'warning', 'pack_manifest_persona_inventory_hash', '$.personas', `canonical inventory hash: ${canonical}`);
  }

  return issues;
};

const run = async (): Promise<void> => {
  const manifestSchema = await readJsonFile<RecordLike>(manifestSchemaPath);
  const personaSchema = await readJsonFile<RecordLike>(personaSchemaPath);
  const signatureSchema = await readJsonFile<RecordLike>(signatureSchemaPath);
  const packs = await discoverPackDirectories();

  const reports: Array<{ file: string; issues: ValidationIssue[] }> = [];
  if (packs.length === 0) {
    reports.push({ file: 'packs', issues: [{ file: 'packs', severity: 'warning', code: 'packs_directory_empty', path: '$', message: 'no pack directories found' }] });
  }

  for (const pack of packs) {
    const manifestResult = await readPackManifest(pack, manifestSchema);
    reports.push({ file: pack.manifestPath, issues: manifestResult.issues });

    if (!manifestResult.manifest) {
      continue;
    }
    const personaResult = await validatePackPersonas(pack, manifestResult.manifest, personaSchema);
    for (const issue of personaResult.issues) {
      const issueFile = issue.file || pack.personasDir;
      issue.file = issueFile;
    }
    reports.push({ file: `${pack.dir}/personas`, issues: personaResult.issues });

    const signatureIssues = await validatePackSignature(pack, manifestResult.manifest, personaResult.personaIds, signatureSchema);
    reports.push({ file: join(pack.signaturesDir, 'pack.sig.json'), issues: signatureIssues });
  }

  const evidence = collectReport('pack-artifacts', reports);
  await writeEvidence(evidencePath, evidence);
  failOnIssues('pack-artifacts', evidence);
  console.log(`Pack artifact validation passed (${evidence.totalFiles} files).`);
};

void run().catch((error) => {
  console.error(String(error));
  process.exit(1);
});
