import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import Redis from 'ioredis';
import { JsonFileState, type JsonFileStateOptions } from './state-file.js';

const REDIS_LOCK_KEY_TTL_MS = 10_000;
const REDIS_LOCK_WAIT_TIMEOUT_MS = 5_000;
const REDIS_LOCK_WAIT_STEP_MS = 50;

type StateBackend = 'file' | 'redis';
type Clonable<T> = T;

const clone = <T>(value: Clonable<T>): T => JSON.parse(JSON.stringify(value)) as T;

const parseBackend = (value: string): StateBackend => (value === 'redis' ? 'redis' : 'file');

const normalizeValue = (value: string | undefined, fallback: string): string =>
  value && value.trim().length > 0 ? value.trim() : fallback;

const createStateToken = (): string => `lock:${randomUUID()}`;

const defaultParse = <T>(value: unknown): T => value as T;

export interface StatefulStore<T> {
  ready(): Promise<void>;
  read(): Promise<T>;
  replace(next: T): Promise<void>;
  update<R>(mutator: (draft: T) => R | Promise<R>): Promise<R>;
}

export interface StateBackendFactoryOptions<T> {
  backend: string;
  filePath: string;
  stateKey: string;
  parse?: (value: unknown) => T;
  initialState: T;
  redisUrl?: string;
}

const serializeState = (value: unknown): string => JSON.stringify(value);

const parseState = <T>(value: unknown, parser?: (input: unknown) => T): T => {
  if (!parser) return defaultParse<T>(value);
  return parser(value);
};

class RedisStateStore<T> {
  private readonly stateKey: string;
  private readonly redis: Redis;
  private readonly parse: (input: unknown) => T;
  private readonly initialState: T;
  private initialized = false;
  private initPromise: Promise<void> | null = null;
  private writeQueue = Promise.resolve();

  constructor(options: {
    stateKey: string;
    parse?: (input: unknown) => T;
    initialState: T;
    redisUrl: string;
  }) {
    this.stateKey = options.stateKey;
    this.parse = options.parse ?? defaultParse;
    this.initialState = clone(options.initialState);
    this.redis = new Redis(options.redisUrl, {
      lazyConnect: true,
      autoResubscribe: false
    });
  }

  private async waitForLock(token: string): Promise<void> {
    const startedAt = Date.now();
    while (Date.now() - startedAt < REDIS_LOCK_WAIT_TIMEOUT_MS) {
      const acquired = await this.redis.set(`${this.stateKey}:lock`, token, 'PX', REDIS_LOCK_KEY_TTL_MS, 'NX');
      if (acquired === 'OK') return;
      await sleep(REDIS_LOCK_WAIT_STEP_MS);
    }
    throw new Error(`state_lock_timeout:${this.stateKey}`);
  }

  private async releaseLock(token: string): Promise<void> {
    const script =
      "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";
    await this.redis.eval(script, 1, `${this.stateKey}:lock`, token);
  }

  private async runSerialized<R>(operation: () => Promise<R>): Promise<R> {
    const previous = this.writeQueue;
    let release: (() => void) = () => {};
    this.writeQueue = new Promise<void>((resolve) => {
      release = resolve;
    });

    await previous;
    let token = '';
    let locked = false;

    try {
      token = createStateToken();
      await this.waitForLock(token);
      locked = true;
      return await operation();
    } finally {
      if (locked) {
        await this.releaseLock(token).catch(() => {});
      }
      release();
    }
  }

  private async initialize(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) {
      await this.initPromise;
      return;
    }

    this.initPromise = (async () => {
      await this.redis.ping();
      const raw = await this.redis.get(this.stateKey);
      if (raw === null) {
        await this.redis.set(this.stateKey, serializeState(this.initialState));
      } else {
        parseState<T>(JSON.parse(raw), this.parse);
      }
    })();

    try {
      await this.initPromise;
      this.initialized = true;
    } finally {
      this.initPromise = null;
    }
  }

  async ready(): Promise<void> {
    await this.initialize();
  }

  async read(): Promise<T> {
    await this.initialize();
    const raw = await this.redis.get(this.stateKey);
    if (raw === null) {
      return clone(this.initialState);
    }
    const parsed = parseState<T>(JSON.parse(raw), this.parse);
    return clone(parsed);
  }

  async replace(next: T): Promise<void> {
    await this.runSerialized(async () => {
      const payload = clone(next);
      await this.initialize();
      await this.redis.set(this.stateKey, serializeState(payload));
    });
  }

  async update<R>(mutator: (draft: T) => R | Promise<R>): Promise<R> {
    return this.runSerialized(async () => {
      await this.initialize();
      const current = clone(await this.read());
      const draft = clone(current);
      const result = await mutator(draft);
      await this.redis.set(this.stateKey, serializeState(draft));
      return result;
    });
  }
}

class FileBackedStateStore<T> {
  private readonly state: JsonFileState<T>;

  constructor(options: JsonFileStateOptions<T>) {
    this.state = new JsonFileState<T>(options);
  }

  ready(): Promise<void> {
    return this.state.ready();
  }

  read(): Promise<T> {
    return this.state.read();
  }

  replace(next: T): Promise<void> {
    return this.state.replace(next);
  }

  update<R>(mutator: (draft: T) => R | Promise<R>): Promise<R> {
    return this.state.update(mutator);
  }
}

const isFilePathTarget = (value: string | undefined): boolean => normalizeValue(value, '').length > 0;

export const createStateStore = <T>(options: StateBackendFactoryOptions<T>): StatefulStore<T> => {
  const backend = parseBackend(options.backend);
  if (backend === 'redis' && !isFilePathTarget(options.redisUrl)) {
    throw new Error('state_redis_url_missing');
  }

  if (backend === 'redis') {
    return new RedisStateStore<T>({
      stateKey: options.stateKey,
      parse: options.parse,
      initialState: options.initialState,
      redisUrl: options.redisUrl as string
    });
  }

  return new FileBackedStateStore<T>({
    filePath: options.filePath,
    initialState: options.initialState,
    parse: options.parse ?? defaultParse
  });
};
