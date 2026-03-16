export function env(name: string, fallback?: string): string {
  return process.env[name] ?? fallback ?? '';
}

export function envRequired(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export function envInt(name: string, fallback: number): number {
  const value = process.env[name];
  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    return fallback;
  }
  return parsed;
}

export function envBool(name: string, fallback = false): boolean {
  const value = process.env[name]?.toLowerCase();
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'y'].includes(value);
}

export function envEnum<T extends string>(name: string, allowed: readonly T[], fallback: T): T {
  const value = env(name, fallback);
  return allowed.includes(value as T) ? (value as T) : fallback;
}

export function envFirst(names: readonly string[], fallback = ''): string {
  for (const name of names) {
    const value = process.env[name];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return fallback;
}

export function envRedisUrl(options: {
  urlNames: readonly string[];
  hostNames: readonly string[];
  portNames?: readonly string[];
  passwordNames?: readonly string[];
  defaultPort?: number;
}): string {
  const direct = envFirst(options.urlNames);
  if (direct.length > 0) return direct;

  const host = envFirst(options.hostNames);
  if (host.length === 0) return '';

  const password = envFirst(options.passwordNames ?? []);
  const portValue = envFirst(options.portNames ?? []);
  const parsedPort = Number(portValue);
  const port = Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : (options.defaultPort ?? 6379);
  const auth = password.length > 0 ? `:${encodeURIComponent(password)}@` : '';

  return `redis://${auth}${host}:${port}`;
}
