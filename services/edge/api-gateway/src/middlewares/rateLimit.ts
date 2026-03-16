import { createStateStore, type StatefulStore } from '@soulism/shared/state-backend.js';

interface TokenBucket {
  key: string;
  remaining: number;
  windowStart: number;
}

interface RateLimitState {
  schemaVersion: string;
  buckets: TokenBucket[];
}

const parseState = (value: unknown): RateLimitState => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {
      schemaVersion: '1.0.0',
      buckets: []
    };
  }

  const candidate = value as Partial<RateLimitState>;
  return {
    schemaVersion: typeof candidate.schemaVersion === 'string' ? candidate.schemaVersion : '1.0.0',
    buckets: Array.isArray(candidate.buckets)
      ? candidate.buckets.filter(
          (entry): entry is TokenBucket =>
            !!entry &&
            typeof entry === 'object' &&
            typeof (entry as TokenBucket).key === 'string' &&
            typeof (entry as TokenBucket).remaining === 'number' &&
            typeof (entry as TokenBucket).windowStart === 'number'
        )
      : []
  };
};

const pruneExpiredBuckets = (state: RateLimitState, windowMs: number, now: number): void => {
  state.buckets = state.buckets.filter((bucket) => now - bucket.windowStart <= windowMs);
};

export class RateLimiter {
  readonly storePath: string;
  private readonly state: StatefulStore<RateLimitState>;

  constructor(
    storePath: string,
    options: {
      stateBackend?: 'file' | 'redis';
      stateRedisUrl?: string;
      stateStoreKey?: string;
    } = {}
  ) {
    this.storePath = storePath;
    this.state = createStateStore<RateLimitState>({
      backend: options.stateBackend ?? 'file',
      initialState: {
        schemaVersion: '1.0.0',
        buckets: []
      },
      filePath: storePath,
      parse: parseState,
      redisUrl: options.stateRedisUrl,
      stateKey: options.stateStoreKey ?? 'soulism:api-gateway:rate-limit'
    });
  }

  async ready(): Promise<void> {
    await this.state.ready();
  }

  async checkRateLimit(key: string, max: number, windowMs: number): Promise<boolean> {
    return this.state.update((state) => {
      const now = Date.now();
      pruneExpiredBuckets(state, windowMs, now);

      const existing = state.buckets.find((bucket) => bucket.key === key);
      if (!existing || now - existing.windowStart > windowMs) {
        if (existing) {
          existing.remaining = Math.max(0, max - 1);
          existing.windowStart = now;
        } else {
          state.buckets.push({
            key,
            remaining: Math.max(0, max - 1),
            windowStart: now
          });
        }
        return true;
      }

      if (existing.remaining <= 0) {
        return false;
      }

      existing.remaining -= 1;
      return true;
    });
  }
}
