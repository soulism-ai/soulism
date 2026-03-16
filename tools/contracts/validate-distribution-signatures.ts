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
  readJsonFile,
  validateDocument,
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
  };
  [key: string]: unknown;
};

type SignatureEnvelope = {
  channel: string;
  descriptorDigest: string;
  signatureDigest: string;
  signatureValid: boolean;
  digestMatchesDescriptor: boolean;
  createdAt: string;
  compatMinCli: string;
  runtimeCount: number;
};

type TargetChannel = {
  channel: 'openai' | 'claude' | 'copilot-studio' | 'hf-space';
  descriptor: string;
  signaturePath: string;
  expectedRuntimes: string[];
};

const root = process.cwd();
const expectedChannels: readonly TargetChannel[] = [
  {
    channel: 'openai',
    descriptor: 'marketplace/openai/app.json',
    signaturePath: 'marketplace/openai/signature.json',
    expectedRuntimes: ['chatgpt-apps', 'openai-app-runtime-http']
  },
  {
    channel: 'claude',
    descriptor: 'marketplace/claude/marketplace.json',
    signaturePath: 'marketplace/claude/signature.json',
    expectedRuntimes: ['claude-desktop-mcp', 'claude-marketplace-http']
  },
  {
    channel: 'copilot-studio',
    descriptor: 'marketplace/copilot-studio/manifest.yaml',
    signaturePath: 'marketplace/copilot-studio/signature.json',
    expectedRuntimes: ['copilot-studio-http', 'copilot-m365-plugin']
  },
  {
    channel: 'hf-space',
    descriptor: 'marketplace/hf/manifest.json',
    signaturePath: 'marketplace/hf/signature.json',
    expectedRuntimes: ['hf-space-http']
  }
];

const schemaPath = join(root, 'packages/contracts/schemas/marketplace.signature.schema.json');
const evidencePath = join(root, 'ci', 'baselines', 'contracts', 'distribution-signatures.validation.json');

const sha256 = (value: string): string => `sha256:${createHash('sha256').update(value).digest('hex')}`;

const isString = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const isIsoDate = (value: unknown): value is string => isString(value) && !Number.isNaN(Date.parse(value));
const hasPlaceholder = (value: unknown): boolean =>
  typeof value === 'string' && /placeholder|todo|fill_me|replace_me/i.test(value);

const addPlaceholderWarning = (
  issues: ValidationIssue[],
  file: string,
  value: unknown,
  path: string,
  code: string
): void => {
  if (hasPlaceholder(value)) {
    issues.push({
      file,
      severity: 'warning',
      code,
      path,
      message: 'placeholder-like content detected'
    });
  }
};

const validateSignatureFile = async (target: TargetChannel, schema: Record<string, unknown>): Promise<ValidationIssue[]> => {
  const issues: ValidationIssue[] = [];
  const filePath = target.signaturePath;

  const signature = (await readJsonFile<SignatureMetadata>(join(root, filePath))) as SignatureMetadata;
  issues.push(...validateDocument(filePath, signature, schema, 250));
  issues.push(...ensureObject(signature, filePath, '$', 'distribution_signature_not_object'));

  if (!signature || typeof signature !== 'object') {
    return issues;
  }

  for (const issue of ensureString(signature.channel, filePath, '$.channel', 'distribution_signature_channel_missing')) {
    issues.push(issue);
  }
  for (const issue of ensureString(signature.descriptor, filePath, '$.descriptor', 'distribution_signature_descriptor_missing')) {
    issues.push(issue);
  }
  for (const issue of ensureString(signature.keyId, filePath, '$.keyId', 'distribution_signature_key_id_missing')) {
    issues.push(issue);
  }
  for (const issue of ensureString(signature.publisher, filePath, '$.publisher', 'distribution_signature_publisher_missing')) {
    issues.push(issue);
  }
  for (const issue of ensureString(signature.digest, filePath, '$.digest', 'distribution_signature_digest_missing')) {
    issues.push(issue);
  }
  for (const issue of ensureString(signature.signature, filePath, '$.signature', 'distribution_signature_value_missing')) {
    issues.push(issue);
  }
  for (const issue of ensureString(signature.publicKey, filePath, '$.publicKey', 'distribution_signature_public_key_missing')) {
    issues.push(issue);
  }
  if (isString(signature.signingMode) && !['local', 'kms'].includes(signature.signingMode)) {
    issues.push({
      file: filePath,
      severity: 'error',
      code: 'distribution_signature_signing_mode_invalid',
      path: '$.signingMode',
      message: `unexpected signing mode '${signature.signingMode}'`
    });
  } else if (!isString(signature.signingMode)) {
    issues.push({
      file: filePath,
      severity: 'error',
      code: 'distribution_signature_signing_mode_missing',
      path: '$.signingMode',
      message: 'signingMode is required'
    });
  }

  if (!isString(signature.compatibility?.minCliVersion)) {
    issues.push({
      file: filePath,
      severity: 'error',
      code: 'distribution_signature_min_cli_version_missing',
      path: '$.compatibility.minCliVersion',
      message: 'compatibility.minCliVersion is required'
    });
  } else if (!/\d+\.\d+\.\d+/.test(signature.compatibility.minCliVersion)) {
    issues.push({
      file: filePath,
      severity: 'warning',
      code: 'distribution_signature_min_cli_version_nonstandard',
      path: '$.compatibility.minCliVersion',
      message: `non-standard semver value '${signature.compatibility.minCliVersion}'`
    });
  }
  if (!Array.isArray(signature.compatibility?.runtimes)) {
    issues.push({
      file: filePath,
      severity: 'error',
      code: 'distribution_signature_runtimes_not_array',
      path: '$.compatibility.runtimes',
      message: 'compatibility.runtimes must be an array'
    });
  } else {
    for (const issue of ensureStringArray(signature.compatibility?.runtimes, filePath, '$.compatibility.runtimes', {
      minLength: 1
    })) {
      issues.push(issue);
    }
    if (Array.isArray(signature.compatibility?.runtimes)) {
      for (const item of signature.compatibility.runtimes) {
        addPlaceholderWarning(issues, filePath, item, '$.compatibility.runtimes', 'distribution_signature_placeholder');
      }
    }
  }

  if (isString(signature.createdAt) && Number.isNaN(Date.parse(signature.createdAt))) {
    issues.push({
      file: filePath,
      severity: 'error',
      code: 'distribution_signature_created_at_invalid',
      path: '$.createdAt',
      message: 'createdAt must be ISO timestamp'
    });
  }

  if (signature.channel !== target.channel) {
    issues.push({
      file: filePath,
      severity: 'error',
      code: 'distribution_signature_channel_mismatch',
      path: '$.channel',
      message: `channel should be ${target.channel}`
    });
  }
  if (signature.descriptor !== target.descriptor) {
    issues.push({
      file: filePath,
      severity: 'warning',
      code: 'distribution_signature_descriptor_path_mismatch',
      path: '$.descriptor',
      message: `descriptor should be ${target.descriptor}`
    });
  }

  addPlaceholderWarning(issues, filePath, signature.keyId, '$.keyId', 'distribution_signature_placeholder');
  addPlaceholderWarning(issues, filePath, signature.signature, '$.signature', 'distribution_signature_placeholder');
  addPlaceholderWarning(issues, filePath, signature.publicKey, '$.publicKey', 'distribution_signature_placeholder');

  if (!isString(signature.digest)) return issues;
  if (!signature.digest.startsWith('sha256:')) {
    issues.push({
      file: filePath,
      severity: 'error',
      code: 'distribution_signature_digest_format',
      path: '$.digest',
      message: 'digest must be sha256:<hex>'
    });
    return issues;
  }
  const descriptorRaw = await readFile(join(root, target.descriptor), 'utf8');
  const descriptorDigest = sha256(descriptorRaw);
  if (descriptorDigest !== signature.digest) {
    issues.push({
      file: filePath,
      severity: 'error',
      code: 'distribution_signature_digest_mismatch',
      path: '$.digest',
      message: `digest mismatch with descriptor. expected ${descriptorDigest}`
    });
  }

  if (!isString(signature.publicKey) || !isString(signature.signature)) {
    issues.push({
      file: filePath,
      severity: 'error',
      code: 'distribution_signature_material_missing',
      path: '$',
      message: 'publicKey and signature must be present'
    });
    return issues;
  }

  try {
    const keyText = signature.publicKey.replace(/\\n/g, '\n');
    if (!verifyPayload(descriptorDigest, signature.signature, keyText)) {
      issues.push({
        file: filePath,
        severity: 'error',
        code: 'distribution_signature_verification_failed',
        path: '$.signature',
        message: 'signature verification failed'
      });
    }
  } catch {
    issues.push({
      file: filePath,
      severity: 'error',
      code: 'distribution_signature_verification_error',
      path: '$.signature',
      message: 'could not verify signature'
    });
  }

  return issues;
};

const isRuntimeMismatch = (observed: unknown, expected: readonly string[]): boolean => {
  if (!Array.isArray(observed)) return true;
  if (observed.length !== expected.length) return true;
  const normalizedObserved = [...observed].sort();
  const normalizedExpected = [...expected].sort();
  return normalizedObserved.some((runtime, index) => runtime !== normalizedExpected[index]);
};

const run = async (): Promise<void> => {
  const reports: Array<{ file: string; issues: ValidationIssue[] }> = [];
  const signatureSchema = await readJsonFile<Record<string, unknown>>(schemaPath);
  const signatures: SignatureEnvelope[] = [];

  for (const target of expectedChannels) {
    const issues = await validateSignatureFile(target, signatureSchema);
    const signature = (await readJsonFile<SignatureMetadata>(join(root, target.signaturePath))) as SignatureMetadata;

    if (signature && signature.channel === target.channel && isString(signature.descriptor) && isString(signature.digest) && isString(signature.signature)) {
      const signatureDigest = sha256(JSON.stringify(signature));
      const descriptorRaw = await readFile(join(root, signature.descriptor), 'utf8');
      signatures.push({
        channel: target.channel,
        descriptorDigest: sha256(descriptorRaw),
        signatureDigest,
        signatureValid: verifyPayload(signature.digest, signature.signature, String(signature.publicKey).replace(/\\n/g, '\n')),
        digestMatchesDescriptor: sha256(descriptorRaw) === signature.digest,
        createdAt: isString(signature.createdAt) ? signature.createdAt : '',
        compatMinCli: isString(signature.compatibility?.minCliVersion) ? signature.compatibility.minCliVersion : '0.0.0',
        runtimeCount: Array.isArray(signature.compatibility?.runtimes) ? signature.compatibility.runtimes.length : 0
      });
    }

    if (isRuntimeMismatch(signature.compatibility?.runtimes, target.expectedRuntimes)) {
      issues.push({
        file: target.signaturePath,
        severity: 'warning',
        code: 'distribution_signature_runtime_mismatch',
        path: '$.compatibility.runtimes',
        message: `runtime list should contain ${target.expectedRuntimes.join(',')}`
      });
    }

    if (issues.some((issue) => issue.code === 'distribution_signature_not_object')) {
      issues.push({
        file: target.signaturePath,
        severity: 'error',
        code: 'distribution_signature_not_object_retry',
        path: '$',
        message: 'cannot continue deep validation due invalid format'
      });
    }

    reports.push({
      file: target.signaturePath,
      issues
    });
  }

  if (signatures.length > 0) {
    const keyIds = await Promise.all(
      expectedChannels.map(async (channel) => {
        const signature = (await readJsonFile<SignatureMetadata>(join(root, channel.signaturePath))) as SignatureMetadata;
        return isString(signature.keyId) ? signature.keyId : '';
      })
    );
    const minCliVersions = await Promise.all(
      expectedChannels.map(async (channel) => {
        const signature = (await readJsonFile<SignatureMetadata>(join(root, channel.signaturePath))) as SignatureMetadata;
        return isString(signature.compatibility?.minCliVersion) ? signature.compatibility.minCliVersion : '';
      })
    );

    const keyIdSet = new Set(keyIds.filter(Boolean));
    const minCliSet = new Set(minCliVersions.filter(Boolean));
    const signingModeSet = new Set(
      (
        await Promise.all(
          expectedChannels.map(async (channel) => {
            const signature = (await readJsonFile<SignatureMetadata>(join(root, channel.signaturePath))) as SignatureMetadata;
            return isString(signature.signingMode) ? signature.signingMode : '';
          })
        )
      ).filter(Boolean)
    );

    if (keyIdSet.size > 1) {
      for (const channel of expectedChannels) {
        reports.push({
          file: channel.signaturePath,
          issues: [
            {
              file: channel.signaturePath,
              severity: 'warning',
              code: 'distribution_signature_keyid_inconsistent',
              path: '$.keyId',
              message: `keyId mismatch across channels: ${keyIds.join(',')}`
            }
          ]
        });
      }
    }
    if (minCliSet.size > 1) {
      for (const channel of expectedChannels) {
        reports.push({
          file: channel.signaturePath,
          issues: [
            {
              file: channel.signaturePath,
              severity: 'warning',
              code: 'distribution_signature_min_cli_inconsistent',
              path: '$.compatibility.minCliVersion',
              message: `compatibility.minCliVersion mismatch across channels: ${minCliVersions.join(',')}`
            }
          ]
        });
      }
    }
    if (signingModeSet.size > 1) {
      for (const channel of expectedChannels) {
        reports.push({
          file: channel.signaturePath,
          issues: [
            {
              file: channel.signaturePath,
              severity: 'error',
              code: 'distribution_signature_mode_inconsistent',
              path: '$.signingMode',
              message: `signing mode mismatch across channels: ${signingModeSet.size} values`
            }
          ]
        });
      }
    }
  }

  const duplicates = signatures.map((item) => item.channel);
  reports.push({
    file: 'marketplace/signatures.summary',
    issues: [
      ...ensureUniqueValues(duplicates, 'marketplace/signatures.summary', '$.channels', 'distribution_signature_duplicate_channel_summary')
    ]
  });

  reports.push({
    file: 'marketplace/signatures.payload',
    issues: []
  });

  const evidence = collectReport('distribution-signatures', reports);
  await writeEvidence(evidencePath, evidence);
  failOnIssues('distribution-signatures', evidence);

  console.log(
    `Distribution signature validation passed (${evidence.totalFiles} files, ${signatures.length} signatures).`
  );
};

void run().catch((error) => {
  console.error(String(error));
  process.exit(1);
});
