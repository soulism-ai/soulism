import { createStateStore, type StatefulStore } from '@soulism/shared/state-backend.js';

export interface MemoryRecord {
  id: string;
  userId: string;
  tenantId: string;
  scope: string;
  value: unknown;
  createdAt: string;
  expiresAt?: string;
}

interface StoredMemoryRecord {
  key: string;
  record: MemoryRecord;
}

interface MemoryState {
  schemaVersion: string;
  records: StoredMemoryRecord[];
}

const expiryGraceMs = 10;

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const parseState = (value: unknown): MemoryState => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { schemaVersion: '1.0.0', records: [] };
  }

  const candidate = value as Partial<MemoryState>;
  const records = Array.isArray(candidate.records)
    ? candidate.records.filter(
        (entry): entry is StoredMemoryRecord =>
          !!entry &&
          typeof entry === 'object' &&
          typeof (entry as StoredMemoryRecord).key === 'string' &&
          !!(entry as StoredMemoryRecord).record &&
          typeof (entry as StoredMemoryRecord).record.id === 'string'
      )
    : [];

  return {
    schemaVersion: typeof candidate.schemaVersion === 'string' ? candidate.schemaVersion : '1.0.0',
    records: records.map((entry) => clone(entry))
  };
};

const isExpired = (record: MemoryRecord, now = Date.now()): boolean => {
  if (!record.expiresAt) return false;
  const expiresAt = Date.parse(record.expiresAt);
  return Number.isNaN(expiresAt) ? false : expiresAt <= now - expiryGraceMs;
};

const purgeExpired = (state: MemoryState, now = Date.now()): void => {
  state.records = state.records.filter((entry) => !isExpired(entry.record, now));
};

export class MemoryRepository {
  readonly storePath: string;
  private readonly state: StatefulStore<MemoryState>;

  constructor(
    storePath: string,
    options: {
      stateBackend?: 'file' | 'redis';
      stateRedisUrl?: string;
      stateStoreKey?: string;
    } = {}
  ) {
    this.storePath = storePath;
    this.state = createStateStore<MemoryState>({
      backend: options.stateBackend ?? 'file',
      initialState: {
        schemaVersion: '1.0.0',
        records: []
      },
      filePath: storePath,
      stateKey: options.stateStoreKey ?? 'soulism:memory:state',
      parse: parseState,
      redisUrl: options.stateRedisUrl
    });
  }

  async ready(): Promise<void> {
    await this.state.ready();
  }

  async write(key: string, record: MemoryRecord): Promise<MemoryRecord> {
    return this.state.update((state) => {
      const now = Date.now();
      purgeExpired(state, now);
      state.records.push({
        key,
        record: clone(record)
      });
      return clone(record);
    });
  }

  async list(userId: string, tenantId: string, scope: string): Promise<MemoryRecord[]> {
    return this.state.update((state) => {
      purgeExpired(state);
      return state.records
        .filter((entry) => {
          const record = entry.record;
          return record.userId === userId && record.tenantId === tenantId && record.scope === scope;
        })
        .map((entry) => clone(entry.record));
    });
  }

  async read(key: string): Promise<MemoryRecord | null> {
    return this.state.update((state) => {
      purgeExpired(state);
      const entry = state.records.find((item) => item.key === key);
      return entry ? clone(entry.record) : null;
    });
  }

  async deleteScope(prefix: string): Promise<number> {
    return this.state.update((state) => {
      purgeExpired(state);
      const before = state.records.length;
      state.records = state.records.filter((entry) => !entry.key.startsWith(prefix));
      return before - state.records.length;
    });
  }

  async deleteById(userId: string, tenantId: string, id: string): Promise<boolean> {
    return this.state.update((state) => {
      purgeExpired(state);
      const before = state.records.length;
      state.records = state.records.filter((entry) => {
        const [recordTenant, recordUser, , recordId] = entry.key.split(':');
        if (recordTenant !== tenantId || recordUser !== userId || recordId !== id) {
          return true;
        }
        return false;
      });
      return state.records.length !== before;
    });
  }
}
