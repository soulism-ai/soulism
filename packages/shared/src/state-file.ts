import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export interface JsonFileStateOptions<T> {
  filePath: string;
  initialState: T;
  parse?: (value: unknown) => T;
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const isNodeError = (error: unknown): error is NodeJS.ErrnoException =>
  !!error && typeof error === 'object' && 'code' in error;

export class JsonFileState<T> {
  readonly filePath: string;
  private state: T;
  private initialized = false;
  private initPromise: Promise<void> | null = null;
  private writeQueue = Promise.resolve();
  private readonly parse: (value: unknown) => T;

  constructor(options: JsonFileStateOptions<T>) {
    this.filePath = options.filePath;
    this.state = clone(options.initialState);
    this.parse = options.parse ?? ((value) => value as T);
  }

  private async persistState(state: T): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const tempPath = `${this.filePath}.${process.pid}.tmp`;
    await writeFile(tempPath, JSON.stringify(state, null, 2), 'utf8');
    await rename(tempPath, this.filePath);
  }

  async ready(): Promise<void> {
    await this.initialize();
    await stat(this.filePath);
  }

  async read(): Promise<T> {
    await this.initialize();
    return clone(this.state);
  }

  async replace(next: T): Promise<void> {
    await this.runExclusive(async () => {
      await this.initialize();
      this.state = clone(next);
      await this.persistState(this.state);
    });
  }

  async update<R>(mutator: (draft: T) => R | Promise<R>): Promise<R> {
    return this.runExclusive(async () => {
      await this.initialize();
      const draft = clone(this.state);
      const result = await mutator(draft);
      this.state = clone(draft);
      await this.persistState(this.state);
      return result;
    });
  }

  private async initialize(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) {
      await this.initPromise;
      return;
    }

    this.initPromise = (async () => {
      await mkdir(dirname(this.filePath), { recursive: true });
      try {
        const raw = await readFile(this.filePath, 'utf8');
        const payload = raw.trim().length > 0 ? JSON.parse(raw) : clone(this.state);
        this.state = clone(this.parse(payload));
      } catch (error) {
        if (!isNodeError(error) || error.code !== 'ENOENT') {
          throw error;
        }
        await this.persistState(this.state);
      }
      this.initialized = true;
    })();

    try {
      await this.initPromise;
    } finally {
      this.initPromise = null;
    }
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
}
