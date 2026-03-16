import { createStateStore, type StatefulStore } from '@soulism/shared/state-backend.js';
import type { BudgetEntry } from '@soulism/persona-policy/budgets.js';

type StoredBudget = BudgetEntry & { key: string };

interface BudgetStoreState {
  schemaVersion: string;
  budgets: StoredBudget[];
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const parseState = (value: unknown): BudgetStoreState => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {
      schemaVersion: '1.0.0',
      budgets: []
    };
  }

  const candidate = value as Partial<BudgetStoreState>;
  return {
    schemaVersion: typeof candidate.schemaVersion === 'string' ? candidate.schemaVersion : '1.0.0',
    budgets: Array.isArray(candidate.budgets)
      ? candidate.budgets.filter(
          (entry): entry is StoredBudget =>
            !!entry &&
            typeof entry === 'object' &&
            typeof (entry as StoredBudget).key === 'string' &&
            typeof (entry as StoredBudget).max === 'number' &&
            typeof (entry as StoredBudget).remaining === 'number'
        )
      : []
  };
};

export class BudgetStore {
  readonly storePath: string;
  private readonly state: StatefulStore<BudgetStoreState>;

  constructor(
    storePath: string,
    options: {
      stateBackend?: 'file' | 'redis';
      stateRedisUrl?: string;
      stateStoreKey?: string;
    } = {}
  ) {
    this.storePath = storePath;
    this.state = createStateStore<BudgetStoreState>({
      backend: options.stateBackend ?? 'file',
      initialState: {
        schemaVersion: '1.0.0',
        budgets: []
      },
      filePath: storePath,
      parse: parseState,
      redisUrl: options.stateRedisUrl,
      stateKey: options.stateStoreKey ?? 'soulism:risk-budget:state'
    });
  }

  async ready(): Promise<void> {
    await this.state.ready();
  }

  async list(): Promise<StoredBudget[]> {
    const state = await this.state.read();
    return state.budgets.map((entry) => clone(entry));
  }

  async get(key: string): Promise<StoredBudget | undefined> {
    const state = await this.state.read();
    return state.budgets.find((entry) => entry.key === key);
  }

  async set(entry: StoredBudget): Promise<void> {
    await this.state.update((state) => {
      const index = state.budgets.findIndex((candidate) => candidate.key === entry.key);
      if (index >= 0) {
        state.budgets[index] = clone(entry);
      } else {
        state.budgets.push(clone(entry));
      }
    });
  }

  async delete(key: string): Promise<boolean> {
    return this.state.update((state) => {
      const before = state.budgets.length;
      state.budgets = state.budgets.filter((entry) => entry.key !== key);
      return state.budgets.length !== before;
    });
  }

  async clear(): Promise<void> {
    await this.state.replace({
      schemaVersion: '1.0.0',
      budgets: []
    });
  }

  async count(): Promise<number> {
    const state = await this.state.read();
    return state.budgets.length;
  }
}
