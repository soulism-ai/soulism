import { createHash } from 'node:crypto';

export type EvidenceRecordType = 'audit-evidence' | 'audit-export' | 'evidence-bundle' | string;

export interface EvidenceSource {
  service: string;
  mode: string;
  releaseId: string;
  commit?: string;
  ref?: string;
  runId?: string;
}

export interface EvidenceEnvelope<TPayload extends Record<string, unknown>> {
  schemaVersion: string;
  generatedAt: string;
  recordType: EvidenceRecordType;
  source: EvidenceSource;
  payload: TPayload;
  payloadDigest: string;
  previousDigest?: string;
  digest: string;
}

type StableValue = string | number | boolean | null | StableValue[] | { [key: string]: StableValue };

const isArray = Array.isArray;
const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !isArray(value);

const normalize = (value: unknown): StableValue => {
  if (isArray(value)) {
    return value.map((entry) => normalize(entry));
  }
  if (isPlainObject(value)) {
    const entries = Object.entries(value)
      .filter(([, value]) => value !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, rawValue]) => [key, normalize(rawValue)] as const);

    const normalized: Record<string, StableValue> = {};
    for (const [key, normalizedValue] of entries) {
      normalized[key] = normalizedValue;
    }
    return normalized;
  }
  return value as StableValue;
};

const stableJson = (value: unknown): string => JSON.stringify(normalize(value));

const sha256Digest = (payload: unknown): string => `sha256:${createHash('sha256').update(stableJson(payload)).digest('hex')}`;

export const buildEvidenceEnvelope = <TPayload extends Record<string, unknown>>(
  recordType: EvidenceRecordType,
  payload: TPayload,
  source: EvidenceSource
): EvidenceEnvelope<TPayload> => {
  const schemaVersion = '1.0.0';
  const generatedAt = new Date().toISOString();
  const payloadDigest = sha256Digest(payload);
  const base = {
    schemaVersion,
    generatedAt,
    recordType,
    source,
    payload,
    payloadDigest
  } as Omit<EvidenceEnvelope<TPayload>, 'digest'>;

  const digest = sha256Digest(base);
  return { ...base, digest };
};

export const addEvidenceChain = <TPayload extends Record<string, unknown>>(
  record: EvidenceEnvelope<TPayload>,
  previousDigest: string | undefined
): EvidenceEnvelope<TPayload> => {
  if (!previousDigest) return record;
  const linked = {
    ...record,
    previousDigest
  } as EvidenceEnvelope<TPayload>;
  return {
    ...linked,
    digest: sha256Digest({
      ...linked
    })
  };
};

const buildSource = (): EvidenceSource => ({
  service: 'soulism-platform',
  mode: process.env.EVIDENCE_MODE || process.env.NODE_ENV || 'runtime',
  releaseId: process.env.RELEASE_ID || process.env.GITHUB_RUN_ID || 'local',
  commit: process.env.GITHUB_SHA || 'local',
  ref: process.env.GITHUB_REF_NAME || process.env.GITHUB_REF || 'local',
  runId: process.env.GITHUB_RUN_ID || 'local'
});

export const writeEvidenceEnvelope = <TPayload extends Record<string, unknown>>(
  payload: TPayload,
  recordType: EvidenceRecordType,
  previousDigest?: string
): EvidenceEnvelope<TPayload> => {
  const source = buildSource();
  const baseRecord = buildEvidenceEnvelope(recordType, payload, source);
  return addEvidenceChain(baseRecord, previousDigest);
};

const normalizeSource = (value: unknown): EvidenceSource => {
  if (!isPlainObject(value)) {
    return {
      service: 'soulism-platform',
      mode: 'runtime',
      releaseId: process.env.RELEASE_ID || process.env.GITHUB_RUN_ID || 'local'
    };
  }

  const fallbackRelease = process.env.RELEASE_ID || process.env.GITHUB_RUN_ID || 'local';
  return {
    service:
      typeof value.service === 'string' && value.service.length > 0 ? value.service : 'soulism-platform',
    mode: typeof value.mode === 'string' && value.mode.length > 0 ? value.mode : 'runtime',
    releaseId: typeof value.releaseId === 'string' && value.releaseId.length > 0 ? value.releaseId : fallbackRelease,
    commit: typeof value.commit === 'string' && value.commit.length > 0 ? value.commit : undefined,
    ref: typeof value.ref === 'string' && value.ref.length > 0 ? value.ref : undefined,
    runId: typeof value.runId === 'string' && value.runId.length > 0 ? value.runId : undefined
  };
};

export const readEvidenceEnvelope = (value: unknown): EvidenceEnvelope<Record<string, unknown>> => {
  if (!isPlainObject(value)) {
    return {
      schemaVersion: '1.0.0',
      generatedAt: new Date().toISOString(),
      recordType: 'audit-evidence',
      source: {
        service: 'soulism-platform',
        mode: 'runtime',
        releaseId: process.env.RELEASE_ID || process.env.GITHUB_RUN_ID || 'local'
      },
      payload: {},
      payloadDigest: 'sha256:0',
      digest: 'sha256:0'
    };
  }

  return {
    schemaVersion: typeof value.schemaVersion === 'string' ? value.schemaVersion : '1.0.0',
    generatedAt: typeof value.generatedAt === 'string' ? value.generatedAt : new Date().toISOString(),
    recordType: typeof value.recordType === 'string' ? value.recordType : 'audit-evidence',
    source: normalizeSource(value.source),
    payload: isPlainObject(value.payload) ? (value.payload as Record<string, unknown>) : {},
    payloadDigest: typeof value.payloadDigest === 'string' ? value.payloadDigest : 'sha256:0',
    previousDigest: typeof value.previousDigest === 'string' ? value.previousDigest : undefined,
    digest: typeof value.digest === 'string' ? value.digest : 'sha256:0'
  };
};

export interface EvidenceChainCheckResult {
  ok: boolean;
  checked: number;
  failureIndex?: number;
  failureReason?: string;
}

export const verifyEvidenceChain = (entries: EvidenceEnvelope<Record<string, unknown>>[]): EvidenceChainCheckResult => {
  if (entries.length === 0) return { ok: true, checked: 0 };
  if (entries[0]!.previousDigest) {
    return {
      ok: false,
      checked: 1,
      failureIndex: 0,
      failureReason: 'first_entry_has_previous_digest'
    };
  }

  let prev = entries[0]!.digest;
  for (let index = 1; index < entries.length; index += 1) {
    const entry = entries[index]!;
    if (entry.previousDigest !== prev) {
      return {
        ok: false,
        checked: entries.length,
        failureIndex: index,
        failureReason: `broken_chain:${index}`
      };
    }
    const recalculated = sha256Digest({
      ...entry,
      digest: undefined
    });
    if (recalculated !== entry.digest) {
      return {
        ok: false,
        checked: entries.length,
        failureIndex: index,
        failureReason: `digest_mismatch:${entry.digest}`
      };
    }
    prev = entry.digest;
  }
  return { ok: true, checked: entries.length };
};
