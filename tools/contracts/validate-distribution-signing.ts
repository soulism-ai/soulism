import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { verifyPayload } from '../../packages/shared/src/crypto.js';
import {
  ValidationIssue,
  collectReport,
  ensureObject,
  ensureString,
  ensureStringArray,
  ensureUniqueValues,
  failOnIssues,
  isSemVer,
  readJsonFile,
  writeEvidence
} from './lib/contract-validation';

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
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

type MetaChannelEntry = {
  channel?: unknown;
  keyId?: unknown;
  descriptor?: unknown;
  digest?: unknown;
  createdAt?: unknown;
  source?: unknown;
};

type DistributionSigningMetadata = {
  schemaVersion?: unknown;
  createdAt?: unknown;
  publisher?: unknown;
  provider?: unknown;
  signingMode?: unknown;
  keyId?: unknown;
  minCliVersion?: unknown;
  keySource?: unknown;
  channels?: unknown;
  channelsConfig?: unknown;
  releaseId?: unknown;
  [key: string]: unknown;
};

type TargetChannel = {
  channel: 'openai' | 'claude' | 'copilot-studio' | 'hf-space';
  signaturePath: string;
  descriptorPath: string;
};

const root = process.cwd();

const expectedChannels: Array<TargetChannel> = [
  { channel: 'openai', signaturePath: 'marketplace/openai/signature.json', descriptorPath: 'marketplace/openai/app.json' },
  { channel: 'claude', signaturePath: 'marketplace/claude/signature.json', descriptorPath: 'marketplace/claude/marketplace.json' },
  {
    channel: 'copilot-studio',
    signaturePath: 'marketplace/copilot-studio/signature.json',
    descriptorPath: 'marketplace/copilot-studio/manifest.yaml'
  },
  {
    channel: 'hf-space',
    signaturePath: 'marketplace/hf/signature.json',
    descriptorPath: 'marketplace/hf/manifest.json'
  }
];

const baselinePath = join(root, 'ci/baselines/distribution-signing-meta.json');
const evidencePath = join(root, 'ci', 'baselines', 'contracts', 'distribution-signing.validation.json');

const isString = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const isFutureDate = (value: string): boolean => Date.parse(value) > Date.now() + 24 * 60 * 60 * 1000;
const hasPlaceholder = (value: unknown): boolean => {
  if (!isString(value)) return false;
  return /placeholder|todo|fill_me|replace_me/i.test(value);
};

const sha256 = (text: string): string => `sha256:${createHash('sha256').update(text).digest('hex')}`;

const normalizeMetaChannels = (value: unknown): MetaChannelEntry[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (typeof entry === 'string') return { channel: entry } as MetaChannelEntry;
      if (entry && typeof entry === 'object') return entry as MetaChannelEntry;
      return null;
    })
    .filter((entry): entry is MetaChannelEntry => entry !== null);
};

const parseDescriptorDigest = async (descriptorPath: string): Promise<string> => {
  const descriptorRaw = await readFile(join(root, descriptorPath), 'utf8');
  return sha256(descriptorRaw);
};

const validateMetaField = (metadata: DistributionSigningMetadata): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];

  if (metadata.schemaVersion !== undefined && !isSemVer(String(metadata.schemaVersion))) {
    issues.push({
      file: 'ci/baselines/distribution-signing-meta.json',
      severity: 'error',
      code: 'distribution_signing_schema_version_invalid',
      path: '$.schemaVersion',
      message: 'schemaVersion should be semver'
    });
  }

  if (!isString(metadata.signingMode) || !['local', 'kms'].includes(metadata.signingMode)) {
    issues.push({
      file: 'ci/baselines/distribution-signing-meta.json',
      severity: 'error',
      code: 'distribution_signing_mode_invalid',
      path: '$.signingMode',
      message: 'signingMode must be local or kms'
    });
  }
  if (isString(metadata.provider) && !['aws', 'gcp', 'azure', 'local'].includes(metadata.provider.toLowerCase())) {
    issues.push({
      file: 'ci/baselines/distribution-signing-meta.json',
      severity: 'warning',
      code: 'distribution_signing_provider_unexpected',
      path: '$.provider',
      message: `provider should be one of aws/gcp/azure/local (${String(metadata.provider)})`
    });
  }

  for (const issue of ensureString(metadata.publisher, 'ci/baselines/distribution-signing-meta.json', '$.publisher', 'distribution_signing_publisher_missing')) {
    issues.push(issue);
  }
  for (const issue of ensureString(metadata.keyId, 'ci/baselines/distribution-signing-meta.json', '$.keyId', 'distribution_signing_key_id_missing')) {
    issues.push(issue);
  }
  for (const issue of ensureString(metadata.minCliVersion, 'ci/baselines/distribution-signing-meta.json', '$.minCliVersion', 'distribution_signing_min_cli_version_missing')) {
    issues.push(issue);
  }
  if (!isString(metadata.minCliVersion) || !isSemVer(metadata.minCliVersion)) {
    issues.push({
      file: 'ci/baselines/distribution-signing-meta.json',
      severity: 'error',
      code: 'distribution_signing_min_cli_version_invalid',
      path: '$.minCliVersion',
      message: 'minCliVersion must be semantic version'
    });
  }

  if (!isString(metadata.createdAt)) {
    issues.push({
      file: 'ci/baselines/distribution-signing-meta.json',
      severity: 'error',
      code: 'distribution_signing_created_at_missing',
      path: '$.createdAt',
      message: 'createdAt is required'
    });
  } else {
    const timestamp = Date.parse(metadata.createdAt);
    if (Number.isNaN(timestamp)) {
      issues.push({
        file: 'ci/baselines/distribution-signing-meta.json',
        severity: 'error',
        code: 'distribution_signing_created_at_invalid',
        path: '$.createdAt',
        message: 'createdAt must be valid ISO timestamp'
      });
    } else if (isFutureDate(metadata.createdAt)) {
      issues.push({
        file: 'ci/baselines/distribution-signing-meta.json',
        severity: 'warning',
        code: 'distribution_signing_created_at_future',
        path: '$.createdAt',
        message: 'createdAt is in the future'
      });
    }
  }

  const allChannels = [...normalizeMetaChannels(metadata.channels), ...normalizeMetaChannels(metadata.channelsConfig)];
  if (allChannels.length === 0) {
    issues.push({
      file: 'ci/baselines/distribution-signing-meta.json',
      severity: 'error',
      code: 'distribution_signing_channels_missing',
      path: '$.channels',
      message: 'at least one signing channel must be provided'
    });
  } else {
    const channelsOnly = allChannels
      .map((item) => (typeof item.channel === 'string' ? item.channel.trim() : ''))
      .filter(Boolean);
    if (new Set(channelsOnly).size !== channelsOnly.length) {
      issues.push({
        file: 'ci/baselines/distribution-signing-meta.json',
        severity: 'error',
        code: 'distribution_signing_channels_duplicate',
        path: '$.channels',
        message: 'distribution-signing-meta channels list contains duplicates'
      });
    }
    for (const issue of ensureStringArray(channelsOnly, 'ci/baselines/distribution-signing-meta.json', '$.channels', { minLength: expectedChannels.length })) {
      issues.push(issue);
    }
    issues.push(
      ...ensureUniqueValues(channelsOnly, 'ci/baselines/distribution-signing-meta.json', '$.channels', 'distribution_signing_channels_duplicate')
    );
    const targetSet = new Set(expectedChannels.map((entry) => entry.channel));
    for (const channel of channelsOnly) {
      if (!targetSet.has(channel)) {
        issues.push({
          file: 'ci/baselines/distribution-signing-meta.json',
          severity: 'error',
          code: 'distribution_signing_channel_unknown',
          path: '$.channels',
          message: `unexpected channel in signing meta: ${channel}`
        });
      }
    }
  }

  for (const channel of expectedChannels) {
    const entries = allChannels.filter((entry) => String(entry.channel || '') === channel.channel);
    if (entries.length === 0) {
      issues.push({
        file: 'ci/baselines/distribution-signing-meta.json',
        severity: 'error',
        code: 'distribution_signing_channel_missing',
        path: '$.channels',
        message: `missing meta entry for channel ${channel.channel}`
      });
      continue;
    }
    const channelMeta = entries[0];
    if (isString(channelMeta.keyId) && String(channelMeta.keyId) !== String(metadata.keyId || '')) {
      issues.push({
        file: 'ci/baselines/distribution-signing-meta.json',
        severity: 'warning',
        code: 'distribution_signing_channel_key_mismatch',
        path: '$.keyId',
        message: `channel keyId ${channel.channel} differs from global meta keyId`
      });
    }
    if (isString(channelMeta.descriptor) && channelMeta.descriptor !== channel.descriptorPath) {
      issues.push({
        file: 'ci/baselines/distribution-signing-meta.json',
        severity: 'warning',
        code: 'distribution_signing_channel_descriptor_mismatch',
        path: `$.channels[?(@.channel=="${channel.channel}")].descriptor`,
        message: `meta descriptor for ${channel.channel} should point to ${channel.descriptorPath}`
      });
    }
  }

  return issues;
};

const addPlaceholderIssue = (file: string, value: unknown, path: string, issueCode: string, issues: ValidationIssue[]) => {
  if (hasPlaceholder(value)) {
    issues.push({
      file,
      severity: 'warning',
      code: issueCode,
      path,
      message: 'placeholder-like value detected'
    });
  }
};

const validateSignatureAgainstMetadata = async (target: TargetChannel): Promise<{ file: string; issues: ValidationIssue[]; keyId: string }> => {
  const issues: ValidationIssue[] = [];
  const signaturePath = join(root, target.signaturePath);
  let signature: SignatureMetadata | null = null;

  try {
    signature = (await readJsonFile<SignatureMetadata>(signaturePath)) as SignatureMetadata;
  } catch {
    issues.push({
      file: target.signaturePath,
      severity: 'error',
      code: 'distribution_signature_missing_or_invalid',
      path: '$',
      message: 'signature metadata is missing or not valid JSON'
    });
    return { file: target.signaturePath, issues, keyId: '' };
  }

  if (!signature || (signature !== null && typeof signature !== 'object')) {
    issues.push({
      file: target.signaturePath,
      severity: 'error',
      code: 'distribution_signature_not_object',
      path: '$',
      message: 'signature metadata must be an object'
    });
    return { file: target.signaturePath, issues, keyId: '' };
  }

  issues.push(...ensureObject(signature, target.signaturePath, '$', 'distribution_signature_not_object'));

  for (const issue of ensureString(signature.channel, target.signaturePath, '$.channel', 'distribution_signature_channel_missing')) {
    issues.push(issue);
  }
  for (const issue of ensureString(signature.descriptor, target.signaturePath, '$.descriptor', 'distribution_signature_descriptor_missing')) {
    issues.push(issue);
  }
  for (const issue of ensureString(signature.keyId, target.signaturePath, '$.keyId', 'distribution_signature_key_id_missing')) {
    issues.push(issue);
  }
  for (const issue of ensureString(signature.publisher, target.signaturePath, '$.publisher', 'distribution_signature_publisher_missing')) {
    issues.push(issue);
  }
  for (const issue of ensureString(signature.signature, target.signaturePath, '$.signature', 'distribution_signature_value_missing')) {
    issues.push(issue);
  }
  for (const issue of ensureString(signature.publicKey, target.signaturePath, '$.publicKey', 'distribution_signature_public_key_missing')) {
    issues.push(issue);
  }
  for (const issue of ensureString(signature.digest, target.signaturePath, '$.digest', 'distribution_signature_digest_missing')) {
    issues.push(issue);
  }

  if (isString(signature.channel) && signature.channel !== target.channel) {
    issues.push({
      file: target.signaturePath,
      severity: 'error',
      code: 'distribution_signature_channel_mismatch',
      path: '$.channel',
      message: `expected ${target.channel}`
    });
  }
  if (isString(signature.descriptor) && signature.descriptor !== target.descriptorPath) {
    issues.push({
      file: target.signaturePath,
      severity: 'warning',
      code: 'distribution_signature_descriptor_mismatch',
      path: '$.descriptor',
      message: `signature descriptor should reference ${target.descriptorPath}`
    });
  }

  addPlaceholderIssue(target.signaturePath, signature.signingMode, '$.signingMode', 'distribution_signature_placeholder', issues);
  addPlaceholderIssue(target.signaturePath, signature.keyId, '$.keyId', 'distribution_signature_placeholder', issues);

  if (isString(signature.createdAt) && isFutureDate(signature.createdAt)) {
    issues.push({
      file: target.signaturePath,
      severity: 'warning',
      code: 'distribution_signature_created_future',
      path: '$.createdAt',
      message: 'signature createdAt is in the future'
    });
  }

  const signingMode = typeof signature.signingMode === 'string' ? signature.signingMode.toLowerCase() : '';
  if (!['local', 'kms'].includes(signingMode)) {
    issues.push({
      file: target.signaturePath,
      severity: 'error',
      code: 'distribution_signature_mode_invalid',
      path: '$.signingMode',
      message: 'signingMode must be local or kms'
    });
  }

  if (isString(signature.compatibility?.minCliVersion) && !isSemVer(signature.compatibility.minCliVersion)) {
    issues.push({
      file: target.signaturePath,
      severity: 'warning',
      code: 'distribution_signature_min_cli_version_non_standard',
      path: '$.compatibility.minCliVersion',
      message: 'compatibility.minCliVersion should follow semver'
    });
  }
  if (!isString(signature.compatibility?.minCliVersion)) {
    issues.push({
      file: target.signaturePath,
      severity: 'warning',
      code: 'distribution_signature_min_cli_version_missing',
      path: '$.compatibility.minCliVersion',
      message: 'compatibility.minCliVersion should be present'
    });
  }

  if (!Array.isArray(signature.compatibility?.runtimes) || signature.compatibility.runtimes.length === 0) {
    issues.push({
      file: target.signaturePath,
      severity: 'error',
      code: 'distribution_signature_runtimes_missing',
      path: '$.compatibility.runtimes',
      message: 'compatibility.runtimes must be a non-empty array'
    });
  } else {
    for (const runtimeIssue of ensureStringArray(signature.compatibility.runtimes, target.signaturePath, '$.compatibility.runtimes', {
      minLength: 1
    })) {
      issues.push(runtimeIssue);
    }
  }

  if (isString(signature.digest) && isString(signature.publicKey) && isString(signature.signature)) {
    let descriptorDigest = '';
    try {
      descriptorDigest = await parseDescriptorDigest(target.descriptorPath);
    } catch {
      issues.push({
        file: target.signaturePath,
        severity: 'error',
        code: 'distribution_signature_descriptor_missing',
        path: '$.descriptor',
        message: `descriptor file cannot be read: ${target.descriptorPath}`
      });
    }

    if (descriptorDigest && descriptorDigest !== signature.digest) {
      issues.push({
        file: target.signaturePath,
        severity: 'error',
        code: 'distribution_signature_digest_mismatch',
        path: '$.digest',
        message: `descriptor digest mismatch, expected ${descriptorDigest}`
      });
    }

    try {
      const keyText = isString(signature.publicKey) ? signature.publicKey.replace(/\\n/g, '\n') : '';
      if (keyText && !verifyPayload(descriptorDigest || signature.digest, signature.signature, keyText)) {
        issues.push({
          file: target.signaturePath,
          severity: 'error',
          code: 'distribution_signature_verification_failed',
          path: '$.signature',
          message: 'signature does not verify against descriptor digest'
        });
      }
    } catch {
      issues.push({
        file: target.signaturePath,
        severity: 'error',
        code: 'distribution_signature_verification_error',
        path: '$.signature',
        message: 'could not verify signature with provided public key'
      });
    }
  }

  return {
    file: target.signaturePath,
    issues,
    keyId: isString(signature.keyId) ? signature.keyId : ''
  };
};

const run = async (): Promise<void> => {
  const reports: Array<{ file: string; issues: ValidationIssue[] }> = [];

  let metadata: DistributionSigningMetadata;
  try {
    metadata = (await readJsonFile<DistributionSigningMetadata>(baselinePath)) as DistributionSigningMetadata;
  } catch {
    reports.push({
      file: 'ci/baselines/distribution-signing-meta.json',
      issues: [
        {
          file: 'ci/baselines/distribution-signing-meta.json',
          severity: 'error',
          code: 'distribution_signing_meta_missing',
          path: '$',
          message: 'distribution-signing-meta.json missing or malformed'
        }
      ]
    });
    const evidence = collectReport('distribution-signing', reports);
    await writeEvidence(evidencePath, evidence);
    failOnIssues('distribution-signing', evidence);
    return;
  }

  reports.push({
    file: 'ci/baselines/distribution-signing-meta.json',
    issues: validateMetaField(metadata)
  });

  for (const target of expectedChannels) {
    const result = await validateSignatureAgainstMetadata(target);
    reports.push({
      file: result.file,
      issues: result.issues
    });
  }

  const missingKeyIdErrors = reports
    .filter((entry) => entry.file.endsWith('signature.json'))
    .flatMap((entry) => entry.issues.filter((issue) => issue.path === '$.keyId' && issue.severity === 'error'))
    .length;
  if (missingKeyIdErrors === 0) {
    const signatureKeyIds = await Promise.all(
      expectedChannels.map(async (target) => {
        const signature = (await readJsonFile<SignatureMetadata>(join(root, target.signaturePath))) as SignatureMetadata;
        return isString(signature.keyId) ? signature.keyId : '';
      })
    );
    const keyIdSet = new Set(signatureKeyIds.filter(Boolean));
    if (keyIdSet.size > 1) {
      for (const target of expectedChannels) {
        const file = target.signaturePath;
        reports.push({
          file,
          issues: [
            {
              file,
              severity: 'error',
              code: 'distribution_signature_key_inconsistent',
              path: '$.keyId',
              message: `keyId mismatch across channels (${signatureKeyIds.join(',')})`
            }
          ]
        });
      }
    }
  }

  if (isString(metadata.keyId) && isString(metadata.signingMode) && metadata.signingMode !== 'local' && metadata.signingMode !== 'kms') {
    reports[0]?.issues.push({
      file: 'ci/baselines/distribution-signing-meta.json',
      severity: 'error',
      code: 'distribution_signing_invalid_mode',
      path: '$.signingMode',
      message: `invalid signing mode ${String(metadata.signingMode)}`
    });
  }

  const evidence = collectReport('distribution-signing', reports);
  await writeEvidence(evidencePath, evidence);
  failOnIssues('distribution-signing', evidence);

  console.log(`Distribution signing validation passed (${evidence.totalFiles} files).`);
};

void run().catch((error) => {
  console.error(String(error));
  process.exit(1);
});
