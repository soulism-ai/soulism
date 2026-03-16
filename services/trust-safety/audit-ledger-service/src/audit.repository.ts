import { createHash } from 'node:crypto';
import { appendFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createStateStore, type StatefulStore } from '@soulism/shared/state-backend.js';

export interface AuditRecord {
  schemaVersion: string;
  id: string;
  service: string;
  action: string;
  principal: string;
  traceId?: string;
  resource?: string;
  metadata?: Record<string, unknown>;
  tags?: string[];
  timestamp: string;
  prevHash: string;
  hash: string;
  createdAtEpochMs: number;
}

export interface AuditQuery {
  principal?: string;
  service?: string;
  action?: string;
  traceId?: string;
  resource?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
  schemaVersion?: string;
}

export interface AuditSnapshot {
  generatedAt: string;
  schemaVersion: string;
  count: number;
  query?: AuditQuery;
  fields: string[];
  items: AuditRecord[] | string;
}

export interface VerificationResult {
  ok: boolean;
  error?: string;
  checked: number;
  failingIndex?: number;
}

interface AuditState {
  schemaVersion: string;
  records: AuditRecord[];
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const normalizeSchemaVersion = (value: unknown): string => {
  if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  return '1.0.0';
};

const clampPage = (value: unknown, fallback: number): number => {
  const candidate = Number(value);
  if (!Number.isFinite(candidate)) return fallback;
  if (candidate <= 0) return 0;
  return Math.floor(candidate);
};

const parseIso = (value: string | undefined): number | undefined => {
  if (!value) return undefined;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return undefined;
  return parsed;
};

type AuditAppendEntry = Omit<AuditRecord, 'timestamp' | 'prevHash' | 'hash' | 'createdAtEpochMs'>;
type AuditHashPayload = Omit<AuditRecord, 'hash'>;

const buildBaseRecord = (entry: AuditAppendEntry): AuditRecord => {
  const schemaVersion = normalizeSchemaVersion(entry.schemaVersion);
  const timestamp = new Date().toISOString();
  return {
    schemaVersion,
    id: entry.id || `audit-${Date.now().toString(36)}-${Math.floor(Math.random() * 9e6).toString(16)}`,
    service: String(entry.service || 'unknown'),
    action: String(entry.action || 'unknown'),
    principal: String(entry.principal || 'unknown'),
    traceId: entry.traceId,
    resource: entry.resource,
    metadata: entry.metadata,
    tags: Array.isArray(entry.tags) ? entry.tags : undefined,
    timestamp,
    prevHash: '',
    hash: '',
    createdAtEpochMs: Date.parse(timestamp)
  };
};

const stableRecordHashPayload = (record: AuditHashPayload): string => {
  const normalized = clone({
    schemaVersion: record.schemaVersion,
    id: record.id,
    service: record.service,
    action: record.action,
    principal: record.principal,
    traceId: record.traceId,
    resource: record.resource,
    metadata: record.metadata || null,
    tags: record.tags || [],
    timestamp: record.timestamp,
    prevHash: record.prevHash
  });
  return JSON.stringify(normalized);
};

const hashRecord = (payload: AuditHashPayload): string =>
  createHash('sha256').update(stableRecordHashPayload(payload)).digest('hex');

const isInWindow = (record: AuditRecord, from: number | undefined, to: number | undefined): boolean => {
  if (from !== undefined && record.createdAtEpochMs < from) return false;
  if (to !== undefined && record.createdAtEpochMs > to) return false;
  return true;
};

const compareDateRange = (record: AuditRecord, from: string | undefined, to: string | undefined): boolean => {
  const fromEpoch = parseIso(from);
  const toEpoch = parseIso(to);
  return isInWindow(record, fromEpoch, toEpoch);
};

const applyTextFilter = (record: AuditRecord, field: keyof AuditRecord, expected: string | undefined): boolean => {
  if (expected === undefined) return true;
  const value = record[field];
  if (value === undefined) return false;
  return String(value) === expected;
};

const isInvalidRecord = (record: AuditRecord): string[] => {
  const failures: string[] = [];
  if (!record.id) failures.push('missing_id');
  if (!record.service) failures.push('missing_service');
  if (!record.action) failures.push('missing_action');
  if (!record.principal) failures.push('missing_principal');
  if (!record.timestamp) failures.push('missing_timestamp');
  if (record.createdAtEpochMs <= 0) failures.push('invalid_createdAtEpochMs');
  return failures;
};

const parseAuditState = (value: unknown): AuditState => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {
      schemaVersion: '1.0.0',
      records: []
    };
  }

  const candidate = value as Partial<AuditState>;
  const records = Array.isArray(candidate.records)
    ? candidate.records.filter(
        (entry): entry is AuditRecord =>
          !!entry &&
          typeof entry === 'object' &&
          typeof (entry as AuditRecord).id === 'string' &&
          typeof (entry as AuditRecord).service === 'string' &&
          typeof (entry as AuditRecord).action === 'string' &&
          typeof (entry as AuditRecord).principal === 'string' &&
          typeof (entry as AuditRecord).timestamp === 'string' &&
          typeof (entry as AuditRecord).prevHash === 'string' &&
          typeof (entry as AuditRecord).hash === 'string' &&
          typeof (entry as AuditRecord).createdAtEpochMs === 'number'
      )
    : [];

  return {
    schemaVersion: normalizeSchemaVersion(candidate.schemaVersion),
    records: records.map((entry) => clone(entry))
  };
};

export class AuditLedgerRepository {
  readonly storePath: string;
  private records: AuditRecord[] = [];
  private readonly stateBackend: 'file' | 'redis';
  private readonly state: StatefulStore<AuditState> | null;
  private initialized = false;
  private initPromise: Promise<void> | null = null;
  private writeQueue = Promise.resolve();

  constructor(
    storePath: string,
    options: {
      stateBackend?: 'file' | 'redis';
      stateRedisUrl?: string;
      stateStoreKey?: string;
    } = {}
  ) {
    this.storePath = storePath;
    this.stateBackend = options.stateBackend ?? 'file';
    this.state =
      this.stateBackend === 'redis'
        ? createStateStore<AuditState>({
            backend: this.stateBackend,
            filePath: storePath,
            initialState: {
              schemaVersion: '1.0.0',
              records: []
            },
            parse: parseAuditState,
            redisUrl: options.stateRedisUrl,
            stateKey: options.stateStoreKey ?? 'soulism:audit-ledger:records'
          })
        : null;
  }

  private materializeNextHash(prevHash: string, payload: AuditRecord): string {
    const canonical = {
      schemaVersion: payload.schemaVersion,
      id: payload.id,
      service: payload.service,
      action: payload.action,
      principal: payload.principal,
      traceId: payload.traceId,
      resource: payload.resource,
      metadata: payload.metadata || null,
      tags: payload.tags || [],
      timestamp: payload.timestamp,
      prevHash,
      createdAtEpochMs: payload.createdAtEpochMs
    };
    return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
  }

  private verifyHashIntegrity(
    records: AuditRecord[],
    startIndex: number,
    expectedPrevHash: string
  ): VerificationResult {
    let prevHash = expectedPrevHash;
    for (let index = startIndex; index < records.length; index += 1) {
      const record = records[index]!;
      const expected = this.materializeNextHash(prevHash, record);
      if (record.prevHash !== prevHash) {
        return {
          ok: false,
          error: `prev_hash_mismatch:${index}:${record.id}`,
          failingIndex: index,
          checked: index + 1
        };
      }
      if (record.hash !== expected) {
        return {
          ok: false,
          error: `hash_mismatch:${index}:${record.id}`,
          failingIndex: index,
          checked: index + 1
        };
      }
      prevHash = record.hash;
    }
    return { ok: true, checked: records.length };
  }

  private async initialize(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) {
      await this.initPromise;
      return;
    }

    this.initPromise = (async () => {
      if (this.stateBackend === 'redis') {
        await this.state?.ready();
        const snapshot = await this.state?.read();
        this.records = snapshot?.records.map((record) => clone(record)) ?? [];
        this.initialized = true;
        return;
      }

      await mkdir(dirname(this.storePath), { recursive: true });
      try {
        const raw = await readFile(this.storePath, 'utf8');
        const lines = raw
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line.length > 0);
        this.records = lines.map((line) => JSON.parse(line) as AuditRecord);
      } catch (error) {
        if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') {
          throw error;
        }
        await writeFile(this.storePath, '', 'utf8');
        this.records = [];
      }
      this.initialized = true;
    })();

    try {
      await this.initPromise;
    } finally {
      this.initPromise = null;
    }
  }

  private async refreshRecords(): Promise<AuditRecord[]> {
    await this.initialize();
    if (this.stateBackend === 'redis') {
      const snapshot = await this.state?.read();
      this.records = snapshot?.records.map((record) => clone(record)) ?? [];
    }
    return this.records;
  }

  private async persistRecords(): Promise<void> {
    if (this.stateBackend === 'redis') {
      await this.state?.replace({
        schemaVersion: '1.0.0',
        records: this.records.map((record) => clone(record))
      });
      return;
    }

    const payload = this.records.map((record) => JSON.stringify(record)).join('\n');
    await writeFile(this.storePath, payload ? `${payload}\n` : '', 'utf8');
  }

  private async runExclusive<R>(operation: () => Promise<R>): Promise<R> {
    const previous = this.writeQueue;
    let release: (() => void) | undefined;
    this.writeQueue = new Promise<void>((resolve) => {
      release = resolve;
    });

    await previous;
    try {
      return await operation();
    } finally {
      release?.();
    }
  }

  async ready(): Promise<void> {
    await this.initialize();
    if (this.stateBackend === 'file') {
      await stat(this.storePath);
    }
    const verification = await this.verifyChain();
    if (!verification.ok) {
      throw new Error(verification.error || 'audit_hash_chain_invalid');
    }
  }

  async append(entry: AuditAppendEntry): Promise<AuditRecord> {
    return this.runExclusive(async () => {
      await this.refreshRecords();
      const seed = buildBaseRecord({
        ...entry,
        schemaVersion: normalizeSchemaVersion(entry.schemaVersion),
        service: entry.service || 'unknown',
        action: entry.action || 'unknown',
        principal: entry.principal || 'unknown'
      });
      const previous = this.records.at(-1);
      const prevHash = previous?.hash || 'genesis';
      const fullRecord: AuditRecord = {
        ...seed,
        prevHash,
        hash: this.materializeNextHash(prevHash, seed),
        createdAtEpochMs: Date.parse(seed.timestamp)
      };
      const failures = isInvalidRecord(fullRecord);
      if (failures.length > 0) {
        throw new Error(`audit_invalid_entry:${failures.join(',')}`);
      }
      if (this.stateBackend === 'file') {
        await appendFile(this.storePath, `${JSON.stringify(fullRecord)}\n`, 'utf8');
      } else {
        this.records.push(fullRecord);
        await this.persistRecords();
        return clone(fullRecord);
      }
      this.records.push(fullRecord);
      return clone(fullRecord);
    });
  }

  async all(): Promise<AuditRecord[]> {
    await this.refreshRecords();
    return this.records.map((record) => clone(record));
  }

  async count(): Promise<number> {
    await this.refreshRecords();
    return this.records.length;
  }

  async query(filter: AuditQuery = {}): Promise<AuditRecord[]> {
    await this.refreshRecords();
    const {
      principal,
      service,
      action,
      traceId,
      resource,
      from,
      to,
      schemaVersion
    } = filter;
    const offset = clampPage(filter.offset, 0);
    const limit = clampPage(filter.limit, Number.MAX_SAFE_INTEGER);

    const matched = this.records.filter((record) => {
      if (!applyTextFilter(record, 'principal', principal)) return false;
      if (!applyTextFilter(record, 'service', service)) return false;
      if (!applyTextFilter(record, 'action', action)) return false;
      if (!applyTextFilter(record, 'traceId', traceId)) return false;
      if (!applyTextFilter(record, 'resource', resource)) return false;
      if (!compareDateRange(record, from, to)) return false;
      if (schemaVersion && record.schemaVersion !== schemaVersion) return false;
      return true;
    });
    if (limit <= 0) return [];
    return matched.slice(offset, offset + limit).map((record) => clone(record));
  }

  async find(id: string): Promise<AuditRecord | undefined> {
    await this.refreshRecords();
    return this.records.find((record) => record.id === id);
  }

  async removeBefore(before: string): Promise<number> {
    const boundary = Date.parse(before);
    if (Number.isNaN(boundary)) return 0;
    return this.runExclusive(async () => {
      await this.refreshRecords();
      const removed = this.records.filter((record) => record.createdAtEpochMs < boundary).length;
      this.records = this.records.filter((record) => record.createdAtEpochMs >= boundary);
      await this.persistRecords();
      return removed;
    });
  }

  async verifyChain(): Promise<VerificationResult> {
    await this.refreshRecords();
    if (this.records.length === 0) {
      return { ok: true, checked: 0 };
    }

    const failures = this.records.filter((record) => isInvalidRecord(record).length > 0);
    if (failures.length > 0) {
      return {
        ok: false,
        checked: this.records.length,
        error: `invalid_records:${failures.length}`,
        failingIndex: this.records.findIndex((record) => isInvalidRecord(record).length > 0)
      };
    }

    const genesis = this.records[0];
    if (!genesis || genesis.prevHash !== 'genesis') {
      return {
        ok: false,
        checked: this.records.length,
        error: 'genesis_hash_missing',
        failingIndex: 0
      };
    }
    const expectedGenesisHash = this.materializeNextHash('genesis', genesis);
    if (genesis.hash !== expectedGenesisHash) {
      return {
        ok: false,
        checked: this.records.length,
        error: `hash_mismatch:0:${genesis.id}`,
        failingIndex: 0
      };
    }
    return this.verifyHashIntegrity(this.records, 1, genesis.hash);
  }

  async exportSnapshot(query: AuditQuery = {}, format: 'json' | 'csv' | 'ndjson' = 'json'): Promise<AuditSnapshot | string> {
    const records = await this.query({ ...query, limit: query.limit || Number.MAX_SAFE_INTEGER, offset: query.offset || 0 });
    const fields = ['id', 'service', 'action', 'principal', 'traceId', 'resource', 'timestamp', 'prevHash', 'hash', 'schemaVersion'];
    if (format === 'json') {
      const payload: AuditSnapshot = {
        generatedAt: new Date().toISOString(),
        schemaVersion: '1.0.0',
        count: records.length,
        query: {
          ...query,
          limit: Math.min(query.limit ?? records.length, records.length),
          offset: query.offset ?? 0
        },
        fields,
        items: records.map((entry) => clone(entry))
      };
      return payload;
    }

    if (format === 'ndjson') {
      const rows = records.map((record) => JSON.stringify(record)).join('\n');
      return rows;
    }

    const header = fields.join(',');
    const rows = records
      .map((record) =>
        fields
          .map((field) => {
            const value = (record as unknown as Record<string, unknown>)[field];
            const text = typeof value === 'string' ? value : JSON.stringify(value ?? '');
            const escaped = `"${text.replace(/"/g, '""')}"`;
            return escaped;
          })
          .join(',')
      )
      .join('\n');
    return `${header}\n${rows}`;
  }

  async snapshotChainTail(): Promise<string> {
    await this.refreshRecords();
    if (this.records.length === 0) return 'genesis';
    return this.records[this.records.length - 1]!.hash;
  }
}
