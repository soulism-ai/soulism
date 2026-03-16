import { existsSync, readFileSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { readEvidenceEnvelope, writeEvidenceEnvelope } from '@soulism/shared/evidence.js';

type EvidenceExportOptions = {
  endpoint?: string;
  out?: string;
  sourceFile?: string;
  previousPath?: string;
  previousDigestOverride?: string;
  principal?: string;
  service?: string;
  action?: string;
  traceId?: string;
  resource?: string;
  schemaVersion?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
  requireChainOk?: boolean;
  strict?: boolean;
  includeChainEvidence?: boolean;
  pretty?: boolean;
  timeoutMs?: number;
};

type UnknownRecord = Record<string, unknown>;
type EvidenceChainSummary = { ok: boolean; checked: number; error?: string; [key: string]: unknown };

const DEFAULT_TIMEOUT_MS = 5000;

const parseBool = (raw: string | undefined, fallback: boolean): boolean => {
  if (!raw) return fallback;
  const normalized = raw.toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on') return true;
  if (normalized === 'false' || normalized === '0' || normalized === 'no' || normalized === 'off') return false;
  return fallback;
};

const parseFlag = (value: unknown, fallback: boolean): boolean => {
  if (typeof value !== 'string') return fallback;
  return parseBool(value, fallback);
};

const normalizeEvent = (value: unknown, strict: boolean): Array<UnknownRecord> => {
  if (!Array.isArray(value)) {
    if (strict) {
      throw new Error('events must be an array');
    }
    return [];
  }

  const events: Array<UnknownRecord> = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      if (!strict) {
        continue;
      }
      throw new Error('event must be object');
    }
    events.push(entry as UnknownRecord);
  }
  return events;
};

const parseArgs = (args: string[]): EvidenceExportOptions => {
  const options: EvidenceExportOptions = {
    endpoint: process.env.AUDIT_LEDGER_URL || 'http://localhost:4003',
    out: join(process.cwd(), 'ci', 'baselines', 'audit-export.json'),
    previousPath: join(process.cwd(), 'ci', 'baselines', 'audit-evidence.json'),
    requireChainOk: true,
    strict: true,
    includeChainEvidence: true,
    pretty: true,
    timeoutMs: DEFAULT_TIMEOUT_MS
  };

  for (const arg of args) {
    if (!arg.startsWith('--')) continue;
    const eq = arg.indexOf('=');
    const key = (eq === -1 ? arg.slice(2) : arg.slice(2, eq)).toLowerCase();
    const value = eq === -1 ? undefined : arg.slice(eq + 1);

    switch (key) {
      case 'endpoint':
      case 'url':
        if (value) options.endpoint = value.replace(/\/$/, '');
        break;
      case 'out':
      case 'output':
      case 'file':
        if (value) options.out = value;
        break;
      case 'source-file':
      case 'sourcefile':
      case 'events-file':
        options.sourceFile = value;
        break;
      case 'previous-path':
      case 'previous':
        options.previousPath = value || options.previousPath;
        break;
      case 'previous-digest':
        options.previousDigestOverride = value;
        break;
      case 'principal':
        options.principal = value;
        break;
      case 'service':
        options.service = value;
        break;
      case 'action':
        options.action = value;
        break;
      case 'trace-id':
      case 'traceid':
        options.traceId = value;
        break;
      case 'resource':
        options.resource = value;
        break;
      case 'schema-version':
      case 'schemaversion':
        options.schemaVersion = value;
        break;
      case 'from':
        options.from = value;
        break;
      case 'to':
        options.to = value;
        break;
      case 'limit': {
        const parsed = Number.parseInt(value || '', 10);
        if (!Number.isNaN(parsed)) options.limit = parsed;
        break;
      }
      case 'offset': {
        const parsed = Number.parseInt(value || '', 10);
        if (!Number.isNaN(parsed)) options.offset = parsed;
        break;
      }
      case 'require-chain-ok':
      case 'requirechainok':
        options.requireChainOk = parseBool(value, true);
        break;
      case 'strict':
        options.strict = parseBool(value, true);
        break;
      case 'include-chain-evidence':
        options.includeChainEvidence = parseBool(value, true);
        break;
      case 'pretty':
        options.pretty = parseBool(value, true);
        break;
      case 'timeout-ms':
      case 'timeout': {
        const parsed = Number.parseInt(value || '', 10);
        if (Number.isFinite(parsed) && parsed > 0) options.timeoutMs = parsed;
        break;
      }
      default:
        break;
    }
  }

  return options;
};

const buildFilters = (options: EvidenceExportOptions): UnknownRecord => {
  const filters: UnknownRecord = {};
  if (options.principal) filters.principal = options.principal;
  if (options.service) filters.service = options.service;
  if (options.action) filters.action = options.action;
  if (options.traceId) filters.traceId = options.traceId;
  if (options.resource) filters.resource = options.resource;
  if (options.schemaVersion) filters.schemaVersion = options.schemaVersion;
  if (options.from) filters.from = options.from;
  if (options.to) filters.to = options.to;
  if (typeof options.limit === 'number' && Number.isFinite(options.limit)) filters.limit = options.limit;
  if (typeof options.offset === 'number' && Number.isFinite(options.offset)) filters.offset = options.offset;
  return filters;
};

const buildQuery = (options: EvidenceExportOptions): string => {
  const query = new URLSearchParams();
  const filters = buildFilters(options);
  for (const [key, value] of Object.entries(filters)) {
    query.set(key, String(value));
  }
  const encoded = query.toString();
  return encoded ? `?${encoded}` : '';
};

const parseChainSummary = (value: unknown): EvidenceChainSummary => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: true, checked: 0 };
  }

  const source = value as UnknownRecord;
  return {
    ok: parseFlag(source.ok, true),
    checked: typeof source.checked === 'number' && Number.isFinite(source.checked) ? source.checked : 0,
    ...source
  };
};

const parseSourcePayload = async (path: string): Promise<{ events: Array<UnknownRecord>; chainSummary: EvidenceChainSummary | null }> => {
  const raw = readFileSync(path, 'utf8');
  const parsed = JSON.parse(raw) as UnknownRecord;
  if (!parsed || typeof parsed !== 'object') {
    throw new Error(`source file invalid: ${path}`);
  }
  if (Array.isArray(parsed.events)) {
    const chainSummary = parsed.chainVerification || parsed.chain || null;
    return {
      events: normalizeEvent(parsed.events, true),
      chainSummary: chainSummary === null ? null : parseChainSummary(chainSummary)
    };
  }
  if (
    typeof parsed.recordType === 'string' &&
    typeof parsed.payload === 'object' &&
    parsed.payload !== null &&
    Array.isArray((parsed.payload as UnknownRecord).events)
  ) {
    const payload = parsed.payload as UnknownRecord;
    const chainSummary = (payload.chainVerification as UnknownRecord | undefined) ?? (payload.chain as UnknownRecord | undefined);
    return {
      events: normalizeEvent(payload.events, true),
      chainSummary: chainSummary ? parseChainSummary(chainSummary) : null
    };
  }
  throw new Error(`source file not an audit event stream: ${path}`);
};

const fetchWithTimeout = async (url: string, timeoutMs: number, init?: RequestInit): Promise<Response> => {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};

const readPreviousDigest = async (options: EvidenceExportOptions): Promise<string | undefined> => {
  if (options.previousDigestOverride) return options.previousDigestOverride;
  const previousPath = options.previousPath;
  if (!previousPath) return undefined;
  if (!existsSync(previousPath)) {
    if (options.strict !== false) {
      throw new Error(`previous_evidence_missing:${previousPath}`);
    }
    return undefined;
  }
  const raw = await readFile(previousPath, 'utf8');
  return readEvidenceEnvelope(JSON.parse(raw)).digest;
};

const runExport = async (options: EvidenceExportOptions): Promise<void> => {
  const strict = options.strict !== false;
  const endpoint = (options.endpoint || '').replace(/\/$/, '');
  const query = buildQuery(options);
  const out = options.out || join(process.cwd(), 'ci', 'baselines', 'audit-export.json');
  if (!out.endsWith('.json')) throw new Error(`output_path_invalid:${out}`);

  let events: Array<UnknownRecord> = [];
  let chainSummary: EvidenceChainSummary = { ok: true, checked: 0 };

  if (options.sourceFile) {
    const loaded = await parseSourcePayload(options.sourceFile);
    events = loaded.events;
    if (options.includeChainEvidence !== false && loaded.chainSummary) {
      chainSummary = loaded.chainSummary;
    }
  } else {
    const eventsResponse = await fetchWithTimeout(`${endpoint}/audit/events${query}`, options.timeoutMs || DEFAULT_TIMEOUT_MS);
    if (!eventsResponse.ok) {
      throw new Error(`failed_to_fetch_audit_events:${eventsResponse.status}`);
    }
    events = normalizeEvent(await eventsResponse.json(), strict);

    const chainResponse = await fetchWithTimeout(`${endpoint}/audit/hash-chain/verify`, options.timeoutMs || DEFAULT_TIMEOUT_MS);
    if (!chainResponse.ok) {
      if (options.requireChainOk) {
        throw new Error(`failed_to_verify_chain:${chainResponse.status}`);
      }
      chainSummary = { ok: false, checked: 0, error: `verify_request_failed:${chainResponse.status}` };
    } else {
      chainSummary = parseChainSummary(await chainResponse.json());
    }
  }

  if (chainSummary.ok === false && options.requireChainOk) {
    throw new Error(`audit_chain_invalid:${JSON.stringify(chainSummary)}`);
  }

  const serviceCounts = new Map<string, number>();
  const actionCounts = new Map<string, number>();
  const timestamps = events
    .map((event) => (typeof event.timestamp === 'string' ? event.timestamp : null))
    .filter((value): value is string => value !== null);
  for (const event of events) {
    const service = typeof event.service === 'string' ? event.service : 'unknown';
    const action = typeof event.action === 'string' ? event.action : 'unknown';
    serviceCounts.set(service, (serviceCounts.get(service) ?? 0) + 1);
    actionCounts.set(action, (actionCounts.get(action) ?? 0) + 1);
  }

  const payload = {
    generatedBy: 'packages/cli evidence export',
    source: { endpoint: options.sourceFile || endpoint, type: options.sourceFile ? 'file' : 'ledger' },
    generatedAt: new Date().toISOString(),
    filters: buildFilters(options),
    chainVerification: chainSummary,
    summary: {
      eventCount: events.length,
      firstTimestamp: timestamps.length > 0 ? timestamps[0] : null,
      lastTimestamp: timestamps.length > 0 ? timestamps[timestamps.length - 1] : null,
      serviceCounts: Object.fromEntries(serviceCounts),
      actionCounts: Object.fromEntries(actionCounts)
    },
    events
  };

  const previousDigest = await readPreviousDigest(options);
  const evidence = writeEvidenceEnvelope(payload, 'audit-export', previousDigest);
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, JSON.stringify(evidence, null, options.pretty === false ? 0 : 2), 'utf8');
  console.log(
    JSON.stringify(
      {
        status: 'ok',
        out,
        eventCount: events.length
      },
      null,
      options.pretty === false ? 0 : 2
    )
  );
};

const runEvidenceCommand = async (subcommand: string | undefined, args: string[]): Promise<void> => {
  if (subcommand !== 'export') {
    console.log('Usage: evidence export [--endpoint=<url>] [--out=<path>] [--source-file=<path>] [flags]');
    return;
  }

  const options = parseArgs(args);
  await runExport(options);
};

export const runEvidence = async (subcommand: string | undefined, args: string[]): Promise<void> => {
  await runEvidenceCommand(subcommand, args);
};
