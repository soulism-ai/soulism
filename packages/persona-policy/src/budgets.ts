import { RiskClass } from './scopes.js';

const DEFAULT_WINDOW_MS = 60_000;

export interface BudgetWindow {
  remaining: number;
  max: number;
  riskClass: RiskClass;
  lastChargeAt: number;
  windowMs: number;
  windowStartedAt: number;
}

export interface BudgetSnapshot {
  key: string;
  remaining: number;
  max: number;
  windowMs: number;
  windowStartedAt: number;
  windowEndsAt: number;
}

const clamp = (value: number): number => (Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0);

const normalizeWindowMs = (value: number): number => {
  const normalized = clamp(value);
  if (normalized <= 0) return DEFAULT_WINDOW_MS;
  return normalized;
};

const sanitizeBudgetEntry = (entry: BudgetEntry): BudgetEntry => ({
  ...entry,
  key: String(entry.key ?? ''),
  remaining: Math.max(0, clamp(entry.remaining)),
  max: Math.max(1, clamp(entry.max)),
  lastChargeAt: Math.max(0, clamp(entry.lastChargeAt)),
  windowMs: normalizeWindowMs(entry.windowMs),
  windowStartedAt: Math.max(0, clamp(entry.windowStartedAt))
});

const toWindow = (entry: BudgetEntry, now: number): BudgetEntry => {
  const expired = now - entry.windowStartedAt > entry.windowMs;
  if (!expired) return entry;
  return {
    ...entry,
    remaining: entry.max,
    lastChargeAt: 0,
    windowStartedAt: now
  };
};

export interface BudgetEntry {
  key: string;
  remaining: number;
  max: number;
  riskClass: RiskClass;
  lastChargeAt: number;
  windowMs: number;
  windowStartedAt: number;
}

export const makeBudget = (max: number, riskClass: RiskClass, windowMs = DEFAULT_WINDOW_MS): BudgetEntry => {
  const safeMax = Math.max(1, clamp(max));
  return {
    key: '',
    remaining: safeMax,
    max: safeMax,
    riskClass,
    lastChargeAt: 0,
    windowMs: normalizeWindowMs(windowMs),
    windowStartedAt: Date.now()
  };
};

export const ensureWindow = (entry: BudgetEntry, max: number, riskClass: RiskClass, windowMs = DEFAULT_WINDOW_MS): BudgetEntry => {
  const active = toWindow({
    ...sanitizeBudgetEntry(entry),
    max: Math.max(1, clamp(max)),
    riskClass,
    windowMs: normalizeWindowMs(windowMs)
  }, Date.now());
  active.remaining = Math.min(active.max, active.remaining);
  if (active.remaining < 0) {
    active.remaining = 0;
  }

  return active;
};

export const normalizeBudgetKey = (personaId: string, userId: string, tenantId: string, tool: string): string => {
  return `${tenantId}:${userId}:${personaId}:${tool}`;
};

export const isBudgetExhausted = (entry: BudgetWindow, amount: number): boolean => {
  return entry.remaining < clamp(amount);
};

export const snapshotBudget = (entry: BudgetEntry): BudgetWindow => ({
  remaining: entry.remaining,
  max: entry.max,
  riskClass: entry.riskClass,
  lastChargeAt: entry.lastChargeAt,
  windowMs: entry.windowMs,
  windowStartedAt: entry.windowStartedAt
});

export const toSnapshot = (entry: BudgetEntry): BudgetSnapshot => ({
  key: entry.key,
  remaining: entry.remaining,
  max: entry.max,
  windowMs: entry.windowMs,
  windowStartedAt: entry.windowStartedAt,
  windowEndsAt: entry.windowStartedAt + entry.windowMs
});

export const canSpendBudget = (entry: BudgetEntry, amount: number, now = Date.now()): { ok: boolean; snapshot: BudgetWindow } => {
  const normalizedAmount = clamp(amount);
  const active = toWindow(sanitizeBudgetEntry(entry), now);
  if (active.windowMs <= 0) {
    active.windowMs = DEFAULT_WINDOW_MS;
  }

  if (normalizedAmount <= 0) {
    return { ok: true, snapshot: snapshotBudget(active) };
  }

  if (isBudgetExhausted(active, normalizedAmount)) {
    return { ok: false, snapshot: snapshotBudget(active) };
  }

  return {
    ok: true,
    snapshot: {
      ...snapshotBudget(active),
      remaining: active.remaining - normalizedAmount,
      lastChargeAt: now
    }
  };
};

export const chargeBudget = (entry: BudgetEntry, amount: number, now = Date.now()): BudgetEntry => {
  const budgetCheck = canSpendBudget(entry, amount, now);
  if (!budgetCheck.ok) {
    return {
      ...entry,
      windowStartedAt: budgetCheck.snapshot.windowStartedAt,
      windowMs: budgetCheck.snapshot.windowMs,
      max: budgetCheck.snapshot.max,
      remaining: budgetCheck.snapshot.remaining,
      lastChargeAt: entry.lastChargeAt
    };
  }

  return {
    ...entry,
    remaining: budgetCheck.snapshot.remaining,
    lastChargeAt: budgetCheck.snapshot.lastChargeAt,
    windowStartedAt: budgetCheck.snapshot.windowStartedAt,
    windowMs: budgetCheck.snapshot.windowMs,
    riskClass: budgetCheck.snapshot.riskClass
  };
};

export const reserveBudget = (entry: BudgetEntry, amount: number): BudgetEntry => {
  const now = Date.now();
  const allowed = canSpendBudget(entry, amount, now);
  if (!allowed.ok) {
    throw new Error(`budget_exhausted: remaining=${allowed.snapshot.remaining}, amount=${amount}`);
  }
  return {
    ...entry,
    remaining: allowed.snapshot.remaining,
    lastChargeAt: allowed.snapshot.lastChargeAt,
    windowStartedAt: allowed.snapshot.windowStartedAt,
    windowMs: allowed.snapshot.windowMs,
    max: allowed.snapshot.max,
    riskClass: allowed.snapshot.riskClass
  };
};

export const toRateWindow = (entry: BudgetEntry): {
  remaining: number;
  max: number;
  windowMs: number;
  windowStartedAt: number;
} => ({
  remaining: entry.remaining,
  max: entry.max,
  windowMs: entry.windowMs,
  windowStartedAt: entry.windowStartedAt
});
