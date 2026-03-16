import { constants as fsConstants, promises as fsp } from 'node:fs';

export interface ReadinessCheck {
  name: string;
  ok: boolean;
  required: boolean;
  target?: string;
  status?: number;
  latencyMs?: number;
  error?: string;
  skipped?: boolean;
}

export interface ReadinessReport {
  ok: boolean;
  ready: boolean;
  service: string;
  checks: ReadinessCheck[];
  errors?: string[];
  latencyMs?: number;
}

export interface HttpDependencyOptions {
  path?: string;
  required?: boolean;
  timeoutMs?: number;
}

export interface TaskDependencyOptions {
  required?: boolean;
  target?: string;
}

export interface DirectoryDependencyOptions extends TaskDependencyOptions {
  writable?: boolean;
}

const DEFAULT_TIMEOUT_MS = 1_500;

const toErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  return String(error);
};

const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, '');

const normalizeBaseUrl = (value: string | undefined): string => {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) return '';
  return trimTrailingSlash(trimmed);
};

const normalizePayload = (raw: string): Record<string, unknown> | undefined => {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
};

const normalizeErrors = (payload: Record<string, unknown> | undefined, fallback: string): string => {
  if (!payload) return fallback;

  const candidates: string[] = [];
  if (Array.isArray(payload.errors)) {
    for (const entry of payload.errors) {
      if (typeof entry === 'string' && entry.trim().length > 0) {
        candidates.push(entry.trim());
      }
    }
  }
  if (typeof payload.reason === 'string' && payload.reason.trim().length > 0) {
    candidates.push(payload.reason.trim());
  }
  if (typeof payload.error === 'string' && payload.error.trim().length > 0) {
    candidates.push(payload.error.trim());
  }
  if (typeof payload.message === 'string' && payload.message.trim().length > 0) {
    candidates.push(payload.message.trim());
  }

  const unique = [...new Set(candidates)];
  return unique.length > 0 ? unique.join('; ') : fallback;
};

export const probeTaskDependency = async (
  name: string,
  task: () => Promise<void> | void,
  options: TaskDependencyOptions = {}
): Promise<ReadinessCheck> => {
  const startedAt = Date.now();
  const required = options.required ?? true;

  try {
    await task();
    return {
      name,
      ok: true,
      required,
      target: options.target,
      latencyMs: Date.now() - startedAt
    };
  } catch (error) {
    return {
      name,
      ok: false,
      required,
      target: options.target,
      latencyMs: Date.now() - startedAt,
      error: toErrorMessage(error)
    };
  }
};

export const probeDirectoryDependency = async (
  name: string,
  directory: string,
  options: DirectoryDependencyOptions = {}
): Promise<ReadinessCheck> => {
  const writable = options.writable ?? false;
  const accessMode = writable ? fsConstants.R_OK | fsConstants.W_OK : fsConstants.R_OK;

  return probeTaskDependency(
    name,
    async () => {
      await fsp.mkdir(directory, { recursive: true });
      await fsp.access(directory, accessMode);
    },
    {
      required: options.required,
      target: directory
    }
  );
};

export const probeHttpDependency = async (
  name: string,
  baseUrl: string | undefined,
  options: HttpDependencyOptions = {}
): Promise<ReadinessCheck> => {
  const required = options.required ?? true;
  const normalizedBase = normalizeBaseUrl(baseUrl);
  const path = options.path?.startsWith('/') ? options.path : `/${options.path ?? 'ready'}`;

  if (!normalizedBase) {
    return {
      name,
      ok: !required,
      required,
      target: undefined,
      skipped: !required,
      error: required ? 'dependency_url_missing' : undefined
    };
  }

  const target = `${normalizedBase}${path}`;
  const controller = new AbortController();
  const timeoutMs = Math.max(100, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();

  try {
    const response = await fetch(target, {
      method: 'GET',
      headers: {
        accept: 'application/json'
      },
      signal: controller.signal
    });
    const raw = await response.text().catch(() => '');
    const payload = normalizePayload(raw);
    const ready = response.ok && payload?.ok !== false && payload?.ready !== false;

    return {
      name,
      ok: ready,
      required,
      target,
      status: response.status,
      latencyMs: Date.now() - startedAt,
      error: ready
        ? undefined
        : normalizeErrors(
            payload,
            response.ok ? 'dependency_reported_not_ready' : `http_${response.status}`
          )
    };
  } catch (error) {
    return {
      name,
      ok: false,
      required,
      target,
      latencyMs: Date.now() - startedAt,
      error: toErrorMessage(error)
    };
  } finally {
    clearTimeout(timeout);
  }
};

export const createReadinessReport = (
  service: string,
  checks: ReadinessCheck[],
  startedAt = Date.now()
): ReadinessReport => {
  const failed = checks.filter((check) => check.required && !check.ok);
  return {
    ok: failed.length === 0,
    ready: failed.length === 0,
    service,
    checks,
    errors: failed.length > 0 ? failed.map((check) => `${check.name}: ${check.error || 'unavailable'}`) : undefined,
    latencyMs: Date.now() - startedAt
  };
};
