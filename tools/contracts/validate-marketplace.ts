import { createHash, createPublicKey } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  ValidationIssue,
  collectReport,
  ensureObject,
  ensureString,
  ensureStringArray,
  ensureUniqueValues,
  ensureIsoDate,
  failOnIssues,
  isSemVer,
  readDocument,
  readJsonFile,
  validateDocument,
  writeEvidence
} from './lib/contract-validation';
import { verifyPayload } from '../../packages/shared/src/crypto.js';

type MarketplaceChannel = 'openai' | 'claude' | 'copilot-studio' | 'hf-space';

type MarketplaceDescriptor = {
  name?: unknown;
  description?: unknown;
  publisher?: unknown;
  version?: unknown;
  endpoints?: Record<string, unknown>;
  api?: Record<string, unknown>;
  capabilities?: unknown;
  compatibility?: {
    runtime?: unknown;
    schemaVersion?: unknown;
  };
  assets?: {
    icon?: unknown;
    banner?: unknown;
    screenshots?: unknown;
  };
  provenance?: {
    publisher?: unknown;
    digest?: unknown;
    signature?: unknown;
    createdAt?: unknown;
  };
  channels?: unknown;
  security?: unknown;
  [key: string]: unknown;
};

type SignatureMetadata = {
  channel?: unknown;
  descriptor?: unknown;
  signingMode?: unknown;
  keyId?: unknown;
  publisher?: unknown;
  digest?: unknown;
  signature?: unknown;
  publicKey?: unknown;
  createdAt?: unknown;
  compatibility?: {
    minCliVersion?: unknown;
    runtimes?: unknown;
  };
  [key: string]: unknown;
};

type ChannelConfig = {
  channel: MarketplaceChannel;
  descriptorPath: string;
  schemaPath: string;
  assetsRoot: string;
  signaturePath: string;
  requirements: {
    iconRequired: boolean;
    bannerRequired: boolean;
    minScreenshots: number;
    runtimes: readonly string[];
  };
};

type DescriptorState = {
  keyId: string;
  signatureMode: string;
  minCliVersion: string;
  descriptorDigest: string;
};

type ChannelFileResult = {
  file: string;
  issues: ValidationIssue[];
};

const root = process.cwd();
const pngMagic = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const placeholderPattern = /\b(placeholder|todo|fill_me|replace_me)\b/i;

const channels: ChannelConfig[] = [
  {
    channel: 'openai',
    descriptorPath: 'marketplace/openai/app.json',
    schemaPath: 'packages/contracts/schemas/marketplace.openai.schema.json',
    assetsRoot: 'marketplace/openai',
    signaturePath: 'marketplace/openai/signature.json',
    requirements: {
      iconRequired: true,
      bannerRequired: true,
      minScreenshots: 2,
      runtimes: ['chatgpt-apps', 'openai-app-runtime-http']
    }
  },
  {
    channel: 'claude',
    descriptorPath: 'marketplace/claude/marketplace.json',
    schemaPath: 'packages/contracts/schemas/marketplace.claude.schema.json',
    assetsRoot: 'marketplace/claude',
    signaturePath: 'marketplace/claude/signature.json',
    requirements: {
      iconRequired: true,
      bannerRequired: false,
      minScreenshots: 1,
      runtimes: ['claude-desktop-mcp', 'claude-marketplace-http']
    }
  },
  {
    channel: 'hf-space',
    descriptorPath: 'marketplace/hf/manifest.json',
    schemaPath: 'packages/contracts/schemas/marketplace.hf.schema.json',
    assetsRoot: 'marketplace/hf',
    signaturePath: 'marketplace/hf/signature.json',
    requirements: {
      iconRequired: true,
      bannerRequired: true,
      minScreenshots: 2,
      runtimes: ['hf-space-http']
    }
  },
  {
    channel: 'copilot-studio',
    descriptorPath: 'marketplace/copilot-studio/manifest.yaml',
    schemaPath: 'packages/contracts/schemas/marketplace.copilot.schema.json',
    assetsRoot: 'marketplace/copilot-studio',
    signaturePath: 'marketplace/copilot-studio/signature.json',
    requirements: {
      iconRequired: true,
      bannerRequired: true,
      minScreenshots: 1,
      runtimes: ['copilot-studio-http', 'copilot-m365-plugin']
    }
  }
];

const signatureSchema = 'packages/contracts/schemas/marketplace.signature.schema.json';

const urlRegex = /^https?:\/\/[A-Za-z0-9.-]+/;

const toAbsolute = (path: string): string => join(root, path);

const digestOfText = (content: string): string => `sha256:${createHash('sha256').update(content).digest('hex')}`;

const hasPlaceholder = (value: unknown): boolean => typeof value === 'string' && placeholderPattern.test(value);
const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const isPng = (content: Buffer): boolean => content.length >= 8 && content.subarray(0, 8).equals(pngMagic);
const isSha256 = (value: string): boolean => /^sha256:[A-Fa-f0-9]{64}$/u.test(value);
const isKnownPublicKey = (value: string): boolean =>
  value.includes('BEGIN PUBLIC KEY') || value.includes('BEGIN PRIVATE KEY') || value.includes('ssh-ed25519');

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

const validatePlaceholderInString = (value: string, file: string, path: string, code: string, issues: ValidationIssue[]): void => {
  if (hasPlaceholder(value)) {
    addIssue(issues, file, 'warning', code, path, 'placeholder-like text detected');
  }
};

const isFutureDated = (value: string): boolean => {
  const millis = Date.parse(value);
  if (Number.isNaN(millis)) return false;
  return millis > Date.now() + 24 * 60 * 60 * 1000;
};

const isValidAssetPath = async (pathValue: unknown, assetsRoot: string, field: string, file: string): Promise<ValidationIssue[]> => {
  const issues: ValidationIssue[] = [];

  if (!isNonEmptyString(pathValue)) {
    issues.push({
      file,
      severity: 'error',
      code: 'asset_path_missing',
      path: field,
      message: 'asset path required'
    });
    return issues;
  }

  if (pathValue.startsWith('/')) {
    issues.push({
      file,
      severity: 'warning',
      code: 'asset_path_absolute',
      path: field,
      message: 'absolute paths can break package consumers'
    });
  }

  const absolutePath = toAbsolute(join(assetsRoot, pathValue));
  let bytes: Buffer;
  try {
    bytes = await readFile(absolutePath);
  } catch {
    issues.push({
      file,
      severity: 'error',
      code: 'asset_missing',
      path: field,
      message: `asset not found: ${pathValue}`
    });
    return issues;
  }

  if (bytes.length === 0) {
    issues.push({
      file,
      severity: 'error',
      code: 'asset_empty',
      path: field,
      message: `asset is empty: ${pathValue}`
    });
    return issues;
  }

  if (!pathValue.toLowerCase().endsWith('.png')) {
    issues.push({
      file,
      severity: 'warning',
      code: 'asset_not_png_name',
      path: field,
      message: 'asset name should use .png for marketplace consistency'
    });
  } else if (!isPng(bytes)) {
    issues.push({
      file,
      severity: 'warning',
      code: 'asset_not_png',
      path: field,
      message: `asset does not contain a valid PNG signature: ${pathValue}`
    });
  }

  return issues;
};

const validateAssets = async (
  descriptor: MarketplaceDescriptor,
  config: ChannelConfig,
  file: string,
  issues: ValidationIssue[]
): Promise<void> => {
  const assets = descriptor.assets;
  if (!isNonEmptyObject(assets)) {
    addIssue(issues, file, 'warning', 'assets_missing', '$.assets', 'assets block recommended for distribution stores');
    return;
  }

  if (config.requirements.iconRequired) {
    issues.push(...(await isValidAssetPath(assets.icon, config.assetsRoot, '$.assets.icon', file)));
  }
  if (config.requirements.bannerRequired) {
    issues.push(...(await isValidAssetPath(assets.banner, config.assetsRoot, '$.assets.banner', file)));
  }

  const screenshots = assets.screenshots;
  if (!Array.isArray(screenshots)) {
    if (config.requirements.minScreenshots > 0) {
      issues.push({
        file,
        severity: 'error',
        code: 'assets_screenshots_not_array',
        path: '$.assets.screenshots',
        message: `expected array with at least ${config.requirements.minScreenshots} item(s)`
      });
    }
    return;
  }

  const screenshotValues = screenshots.filter(isNonEmptyString);
  if (screenshotValues.length < config.requirements.minScreenshots) {
    issues.push({
      file,
      severity: 'error',
      code: 'assets_screenshots_too_few',
      path: '$.assets.screenshots',
      message: `minimum ${config.requirements.minScreenshots} screenshot(s) required`
    });
  }

  for (let index = 0; index < screenshots.length; index += 1) {
    const screenshot = screenshots[index];
    issues.push(...(await isValidAssetPath(screenshot, config.assetsRoot, `$.assets.screenshots[${index}]`, file)));
    if (hasPlaceholder(screenshot)) {
      addIssue(issues, file, 'warning', 'asset_placeholder', `$.assets.screenshots[${index}]`, 'placeholder-like screenshot value');
    }
  }
};

const isNonEmptyObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);

const validateProvenance = (descriptor: MarketplaceDescriptor, file: string, issues: ValidationIssue[]): void => {
  if (!isNonEmptyObject(descriptor.provenance)) {
    addIssue(issues, file, 'error', 'provenance_missing', '$.provenance', 'provenance block is required');
    return;
  }

  const provenance = descriptor.provenance;
  for (const issue of ensureString(provenance.publisher, file, '$.provenance.publisher', 'provenance_publisher_missing')) issues.push(issue);
  for (const issue of ensureString(provenance.digest, file, '$.provenance.digest', 'provenance_digest_missing')) issues.push(issue);
  for (const issue of ensureString(provenance.signature, file, '$.provenance.signature', 'provenance_signature_missing')) issues.push(issue);
  for (const issue of ensureIsoDate(isNonEmptyString(provenance.createdAt) ? provenance.createdAt : '', file, '$.provenance.createdAt')) {
    issues.push(issue);
  }

  validatePlaceholderInString(String(provenance.publisher), file, '$.provenance.publisher', 'provenance_placeholder', issues);
  validatePlaceholderInString(String(provenance.signature), file, '$.provenance.signature', 'provenance_placeholder', issues);

  if (isNonEmptyString(provenance.digest) && !isSha256(provenance.digest)) {
    issues.push({
      file,
      severity: 'error',
      code: 'provenance_digest_invalid',
      path: '$.provenance.digest',
      message: 'provenance digest should be sha256:<hex>'
    });
  }
  if (isFutureDated(String(provenance.createdAt))) {
    addIssue(
      issues,
      file,
      'warning',
      'provenance_future_date',
      '$.provenance.createdAt',
      'provenance.createdAt appears in the future'
    );
  }
};

const validateChannelEnvelope = (descriptor: MarketplaceDescriptor, config: ChannelConfig, file: string, issues: ValidationIssue[]): void => {
  if (!isNonEmptyObject(descriptor.compatibility)) {
    addIssue(issues, file, 'error', 'compatibility_missing', '$.compatibility', 'compatibility block required');
    return;
  }

  for (const issue of ensureString(descriptor.compatibility.runtime, file, '$.compatibility.runtime', 'compatibility_runtime_missing')) {
    issues.push(issue);
  }
  for (const issue of ensureString(
    descriptor.compatibility.schemaVersion,
    file,
    '$.compatibility.schemaVersion',
    'compatibility_schema_version_missing'
  )) {
    issues.push(issue);
  }
  if (!isSemVer(String(descriptor.compatibility.schemaVersion || ''))) {
    addIssue(
      issues,
      file,
      'warning',
      'compatibility_schema_version_nonstandard',
      '$.compatibility.schemaVersion',
      `non-semver schemaVersion: ${String(descriptor.compatibility.schemaVersion)}`
    );
  }

  if (descriptor.capabilities !== undefined) {
    const capabilityIssues = ensureStringArray(descriptor.capabilities, file, '$.capabilities', { minLength: 1 });
    if (capabilityIssues.length > 0) {
      issues.push(...capabilityIssues);
    } else {
      const capabilities = descriptor.capabilities as string[];
      issues.push(...ensureUniqueValues(capabilities, file, '$.capabilities', 'capabilities_duplicate'));
    }
  } else {
    addIssue(
      issues,
      file,
      'warning',
      'capabilities_missing',
      '$.capabilities',
      'capabilities is recommended for store and adapter compatibility checks'
    );
  }

  if (descriptor.security && !isNonEmptyObject(descriptor.security)) {
    issues.push({
      file,
      severity: 'warning',
      code: 'security_malformed',
      path: '$.security',
      message: 'security block should be an object when present'
    });
  }

  if (config.channel === 'openai') {
    const endpoints = descriptor.endpoints;
    if (!isNonEmptyObject(endpoints)) {
      issues.push({
        file,
        severity: 'error',
        code: 'openai_endpoints_missing',
        path: '$.endpoints',
        message: 'OpenAI descriptor requires endpoints.api and endpoints.oauth'
      });
      return;
    }
    for (const issue of ensureString(endpoints.api, file, '$.endpoints.api', 'openai_endpoint_api_missing')) issues.push(issue);
    for (const issue of ensureString(endpoints.oauth, file, '$.endpoints.oauth', 'openai_endpoint_oauth_missing')) issues.push(issue);
    if (isNonEmptyString(endpoints.api) && !urlRegex.test(endpoints.api)) {
      issues.push({
        file,
        severity: 'warning',
        code: 'openai_endpoint_api_invalid',
        path: '$.endpoints.api',
        message: 'endpoint should be an absolute HTTP URL'
      });
    }
  }

  if (config.channel === 'claude') {
    const api = descriptor.api;
    if (!isNonEmptyObject(api)) {
      issues.push({
        file,
        severity: 'error',
        code: 'claude_api_missing',
        path: '$.api',
        message: 'Claude descriptor requires api.baseUrl and api.auth'
      });
      return;
    }
    for (const issue of ensureString(api.baseUrl, file, '$.api.baseUrl', 'claude_api_base_missing')) issues.push(issue);
    for (const issue of ensureString(api.auth, file, '$.api.auth', 'claude_api_auth_missing')) issues.push(issue);
    if (isNonEmptyString(api.baseUrl) && !urlRegex.test(api.baseUrl)) {
      issues.push({
        file,
        severity: 'warning',
        code: 'claude_api_base_invalid',
        path: '$.api.baseUrl',
        message: 'api.baseUrl should be an absolute HTTP URL'
      });
    }
  }

  if (config.channel === 'copilot-studio') {
    const endpoints = descriptor.endpoints;
    if (!isNonEmptyObject(endpoints)) {
      issues.push({
        file,
        severity: 'error',
        code: 'copilot_endpoints_missing',
        path: '$.endpoints',
        message: 'Copilot descriptor requires endpoints.chat and endpoints.events'
      });
      return;
    }
    for (const issue of ensureString(endpoints.chat, file, '$.endpoints.chat', 'copilot_endpoint_chat_missing')) issues.push(issue);
    for (const issue of ensureString(endpoints.events, file, '$.endpoints.events', 'copilot_endpoint_events_missing')) issues.push(issue);
    if (isNonEmptyString(endpoints.chat) && !urlRegex.test(endpoints.chat)) {
      issues.push({
        file,
        severity: 'warning',
        code: 'copilot_endpoint_chat_invalid',
        path: '$.endpoints.chat',
        message: 'chat endpoint should be an absolute HTTP URL'
      });
    }
  }
};

const validateDescriptorTopLevel = (descriptor: MarketplaceDescriptor, file: string, issues: ValidationIssue[]): void => {
  for (const issue of ensureString(descriptor.name, file, '$.name', 'descriptor_name_missing')) issues.push(issue);
  for (const issue of ensureString(descriptor.description, file, '$.description', 'descriptor_description_missing')) issues.push(issue);
  for (const issue of ensureString(descriptor.publisher, file, '$.publisher', 'descriptor_publisher_missing')) issues.push(issue);
  for (const issue of ensureString(descriptor.version, file, '$.version', 'descriptor_version_missing')) issues.push(issue);

  if (isNonEmptyString(descriptor.version) && !isSemVer(descriptor.version)) {
    addIssue(
      issues,
      file,
      'warning',
      'descriptor_version_nonstandard',
      '$.version',
      `non-semver version: ${descriptor.version}`
    );
  }

  validatePlaceholderInString(String(descriptor.name), file, '$.name', 'descriptor_name_placeholder', issues);
  validatePlaceholderInString(String(descriptor.description), file, '$.description', 'descriptor_description_placeholder', issues);
  validatePlaceholderInString(String(descriptor.publisher), file, '$.publisher', 'descriptor_publisher_placeholder', issues);
};

const readSignatureSchema = async () => readJsonFile<Record<string, unknown>>(toAbsolute(signatureSchema));

const validateDescriptor = async (config: ChannelConfig, descriptorSchema: Record<string, unknown>): Promise<{ issues: ValidationIssue[]; digest: string }> => {
  const fullPath = toAbsolute(config.descriptorPath);
  const issues: ValidationIssue[] = [];
  let descriptorRaw = '';

  try {
    descriptorRaw = await readFile(fullPath, 'utf8');
  } catch (error) {
    addIssue(issues, config.descriptorPath, 'error', 'descriptor_read_failed', '$', `failed to read descriptor: ${String(error)}`);
    return { issues, digest: `sha256:unknown-${config.channel}` };
  }

  const descriptorDigest = digestOfText(descriptorRaw);
  let parsedDescriptor: unknown;
  try {
    const { data } = await readDocument(fullPath);
    parsedDescriptor = data;
  } catch (error) {
    issues.push({
      file: config.descriptorPath,
      severity: 'error',
      code: 'descriptor_parse_failed',
      path: '$',
      message: `descriptor parse failed: ${String(error)}`
    });
    return { issues, digest: descriptorDigest };
  }

  issues.push(...validateDocument(config.descriptorPath, parsedDescriptor, descriptorSchema, 300));

  if (!isNonEmptyObject(parsedDescriptor)) {
    issues.push({
      file: config.descriptorPath,
      severity: 'error',
      code: 'descriptor_not_object',
      path: '$',
      message: 'descriptor must be a JSON/YAML object'
    });
    return { issues, digest: descriptorDigest };
  }

  const descriptor = parsedDescriptor as MarketplaceDescriptor;
  validateDescriptorTopLevel(descriptor, config.descriptorPath, issues);
  validateProvenance(descriptor, config.descriptorPath, issues);
  validateChannelEnvelope(descriptor, config, config.descriptorPath, issues);
  await validateAssets(descriptor, config, config.descriptorPath, issues);

  issues.push({
    file: config.descriptorPath,
    severity: 'warning',
    code: 'descriptor_digest_recorded',
    path: '$.digest',
    message: `descriptor digest: ${descriptorDigest}`
  });

  return { issues, digest: descriptorDigest };
};

const validateSignature = async (
  config: ChannelConfig,
  signatureSchema: Record<string, unknown>,
  descriptorDigest: string
): Promise<{ issues: ValidationIssue[]; state: DescriptorState }> => {
  const fullPath = toAbsolute(config.signaturePath);
  const issues: ValidationIssue[] = [];

  let signatureRaw = '';
  let signature: SignatureMetadata | null = null;
  try {
    signatureRaw = await readFile(fullPath, 'utf8');
    signature = JSON.parse(signatureRaw) as SignatureMetadata;
  } catch (error) {
    addIssue(
      issues,
      config.signaturePath,
      'error',
      'signature_read_failed',
      '$',
      `failed to read or parse signature metadata: ${String(error)}`
    );
    return {
      issues,
      state: {
        keyId: '',
        signatureMode: 'missing',
        minCliVersion: '',
        descriptorDigest
      }
    };
  }

  issues.push(...validateDocument(config.signaturePath, signature, signatureSchema, 250));
  issues.push(...ensureObject(signature, config.signaturePath, '$', 'signature_not_object'));

  if (!isNonEmptyObject(signature)) {
    return {
      issues,
      state: {
        keyId: '',
        signatureMode: 'missing',
        minCliVersion: '',
        descriptorDigest
      }
    };
  }

  for (const issue of ensureString(signature.channel, config.signaturePath, '$.channel', 'signature_channel_missing')) issues.push(issue);
  for (const issue of ensureString(signature.descriptor, config.signaturePath, '$.descriptor', 'signature_descriptor_missing')) issues.push(issue);
  for (const issue of ensureString(signature.keyId, config.signaturePath, '$.keyId', 'signature_key_id_missing')) issues.push(issue);
  for (const issue of ensureString(signature.publisher, config.signaturePath, '$.publisher', 'signature_publisher_missing')) issues.push(issue);
  for (const issue of ensureString(signature.digest, config.signaturePath, '$.digest', 'signature_digest_missing')) issues.push(issue);
  for (const issue of ensureString(signature.signature, config.signaturePath, '$.signature', 'signature_value_missing')) issues.push(issue);
  for (const issue of ensureString(signature.publicKey, config.signaturePath, '$.publicKey', 'signature_public_key_missing')) issues.push(issue);

  if (signature.channel !== config.channel) {
    issues.push({
      file: config.signaturePath,
      severity: 'error',
      code: 'signature_channel_mismatch',
      path: '$.channel',
      message: `channel should be ${config.channel}`
    });
  }
  if (signature.descriptor !== config.descriptorPath) {
    issues.push({
      file: config.signaturePath,
      severity: 'error',
      code: 'signature_descriptor_mismatch',
      path: '$.descriptor',
      message: `descriptor should be ${config.descriptorPath}`
    });
  }

  if (hasPlaceholder(signature.channel)) validatePlaceholderInString(String(signature.channel), config.signaturePath, '$.channel', 'signature_placeholder', issues);
  if (hasPlaceholder(signature.keyId)) validatePlaceholderInString(String(signature.keyId), config.signaturePath, '$.keyId', 'signature_placeholder', issues);

  if (!isNonEmptyString(signature.signingMode) || !['local', 'kms'].includes(String(signature.signingMode))) {
    issues.push({
      file: config.signaturePath,
      severity: 'error',
      code: 'signature_signing_mode_invalid',
      path: '$.signingMode',
      message: "signingMode must be 'local' or 'kms'"
    });
  }

  const descriptorDigestExpected = descriptorDigest;
  if (isNonEmptyString(signature.digest) && !isSha256(signature.digest)) {
    issues.push({
      file: config.signaturePath,
      severity: 'error',
      code: 'signature_digest_format',
      path: '$.digest',
      message: 'digest must use sha256:<hex>'
    });
  }
  if (isNonEmptyString(signature.digest) && signature.digest !== descriptorDigestExpected) {
    issues.push({
      file: config.signaturePath,
      severity: 'error',
      code: 'signature_descriptor_digest_mismatch',
      path: '$.digest',
      message: `signature digest (${signature.digest}) does not match descriptor digest (${descriptorDigestExpected})`
    });
  }

  if (!isNonEmptyString(signature.publicKey) || !isKnownPublicKey(signature.publicKey)) {
    issues.push({
      file: config.signaturePath,
      severity: 'warning',
      code: 'signature_public_key_format',
      path: '$.publicKey',
      message: 'publicKey should be PEM or SSH public key format'
    });
  }

  if (!isNonEmptyString(signature.compatibility?.minCliVersion)) {
    issues.push({
      file: config.signaturePath,
      severity: 'error',
      code: 'signature_min_cli_version_missing',
      path: '$.compatibility.minCliVersion',
      message: 'compatibility.minCliVersion is required'
    });
  }
  if (isNonEmptyString(signature.compatibility?.minCliVersion) && !isSemVer(signature.compatibility.minCliVersion)) {
    issues.push({
      file: config.signaturePath,
      severity: 'warning',
      code: 'signature_min_cli_version_nonstandard',
      path: '$.compatibility.minCliVersion',
      message: 'minCliVersion should use semantic version format'
    });
  }

  if (!Array.isArray(signature.compatibility?.runtimes) || signature.compatibility!.runtimes.length === 0) {
    issues.push({
      file: config.signaturePath,
      severity: 'error',
      code: 'signature_runtime_empty',
      path: '$.compatibility.runtimes',
      message: 'compatibility.runtimes is required and must be non-empty'
    });
  } else {
    for (const runtimeIssue of ensureStringArray(signature.compatibility?.runtimes, config.signaturePath, '$.compatibility.runtimes', {
      minLength: config.requirements.runtimes.length
    })) {
      issues.push(runtimeIssue);
    }
    const runtimes = signature.compatibility?.runtimes as string[];
    const normalizedExpected = [...config.requirements.runtimes].sort();
    const normalizedActual = [...runtimes].sort();
    if (normalizedExpected.length !== normalizedActual.length || normalizedExpected.some((runtime, index) => normalizedActual[index] !== runtime)) {
      issues.push({
        file: config.signaturePath,
        severity: 'error',
        code: 'signature_runtime_list_mismatch',
        path: '$.compatibility.runtimes',
        message: `runtime list should be ${normalizedExpected.join(',')}`
      });
    }
  }

  for (const issue of ensureIsoDate(isNonEmptyString(signature.createdAt) ? signature.createdAt : '', config.signaturePath, '$.createdAt')) {
    issues.push(issue);
  }
  if (isNonEmptyString(signature.createdAt) && isFutureDated(signature.createdAt)) {
    issues.push({
      file: config.signaturePath,
      severity: 'warning',
      code: 'signature_created_future',
      path: '$.createdAt',
      message: 'signature createdAt appears in the future'
    });
  }

  if (isNonEmptyString(signature.signature) && isNonEmptyString(signature.publicKey)) {
    try {
      const keyText = signature.publicKey.includes('\\n') ? signature.publicKey.replace(/\\n/g, '\n') : signature.publicKey;
      createPublicKey(keyText);
    } catch {
      issues.push({
        file: config.signaturePath,
        severity: 'warning',
        code: 'signature_public_key_parse',
        path: '$.publicKey',
        message: 'publicKey is not parseable as PEM public key'
      });
    }

    if (!verifyPayload(descriptorDigestExpected, signature.signature, signature.publicKey)) {
      issues.push({
        file: config.signaturePath,
        severity: 'error',
        code: 'signature_verification_failed',
        path: '$.signature',
        message: 'descriptor digest does not validate against signature'
      });
    }
  }

  return {
    issues,
    state: {
      keyId: String(signature.keyId || ''),
      signatureMode: String(signature.signingMode || ''),
      minCliVersion: String(signature.compatibility?.minCliVersion || ''),
      descriptorDigest: descriptorDigestExpected
    }
  };
};

const run = async (): Promise<void> => {
  const reports: ChannelFileResult[] = [];
  const descriptorSchemaCache = new Map<string, Record<string, unknown>>();
  const signatureSchemaData = await readSignatureSchema();
  const descriptorStates: DescriptorState[] = [];

  for (const config of channels) {
    let descriptorSchema = descriptorSchemaCache.get(config.schemaPath);
    if (!descriptorSchema) {
      descriptorSchema = await readJsonFile<Record<string, unknown>>(toAbsolute(config.schemaPath));
      descriptorSchemaCache.set(config.schemaPath, descriptorSchema);
    }

    const descriptorResult = await validateDescriptor(config, descriptorSchema);
    reports.push({ file: config.descriptorPath, issues: descriptorResult.issues });

    const signatureResult = await validateSignature(config, signatureSchemaData, descriptorResult.digest);
    reports.push({ file: config.signaturePath, issues: signatureResult.issues });

    descriptorStates.push(signatureResult.state);
  }

  const statesWithKey = descriptorStates.filter((state) => state.keyId);
  if (statesWithKey.length > 0) {
    const keyIds = statesWithKey.map((state) => state.keyId);
    const versions = statesWithKey.map((state) => state.minCliVersion).filter(Boolean);
    const modes = statesWithKey.map((state) => state.signatureMode).filter(Boolean);

    if (new Set(keyIds).size > 1) {
      for (const file of channels.map((channel) => channel.signaturePath)) {
        addIssue(
          reports.find((entry) => entry.file === file)?.issues ?? [],
          file,
          'error',
          'signature_key_id_inconsistent',
          '$.keyId',
          `keyId mismatch across channels: ${keyIds.join(',')}`
        );
      }
    }

    if (new Set(versions).size > 1) {
      for (const file of channels.map((channel) => channel.signaturePath)) {
        addIssue(
          reports.find((entry) => entry.file === file)?.issues ?? [],
          file,
          'warning',
          'signature_min_cli_version_inconsistent',
          '$.compatibility.minCliVersion',
          `minCliVersion mismatch across channels: ${versions.join(',')}`
        );
      }
    }

    if (new Set(modes).size > 1) {
      for (const file of channels.map((channel) => channel.signaturePath)) {
        addIssue(
          reports.find((entry) => entry.file === file)?.issues ?? [],
          file,
          'warning',
          'signature_mode_inconsistent',
          '$.signingMode',
          `signing mode mismatch across channels: ${modes.join(',')}`
        );
      }
    }
  }

  const evidence = collectReport('marketplace-descriptors', reports);
  await writeEvidence(join(root, 'ci', 'baselines', 'contracts', 'marketplace.validation.json'), evidence);
  failOnIssues('marketplace', evidence);

  console.log(`Marketplace validation passed (${evidence.totalFiles} files).`);
};

void run().catch((error) => {
  console.error(String(error));
  process.exit(1);
});
