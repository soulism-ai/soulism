import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readEvidenceEnvelope, writeEvidenceEnvelope } from './lib/evidence.js';

type EvidenceExportOptions = {
  endpoint?: string;
  out?: string;
  sourceFile?: string;
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
  previousPath?: string;
  previousDigestOverride?: string;
  includeChainEvidence?: boolean;
  pretty?: boolean;
  timeoutMs?: number;
};

type AuditEvent = Record<string, unknown> & {
  id?: string;
  schemaVersion?: string;
  service?: string;
  action?: string;
  principal?: string;
  traceId?: string;
  resource?: string;
  timestamp?: string;
};

type UnknownRecord = Record<string, unknown>;
type ParsedEnvelope = {
  events: AuditEvent[];
  chainVerification?: UnknownRecord;
  sourcePath?: string;
};

type ChainSummary = {
  ok: boolean;
  checked: number;
  [key: string]: unknown;
};

const DEFAULT_TIMEOUT_MS = 5000;

const truthyString = (value = ''): string => value.toLowerCase().trim();

const parseArgs = (): EvidenceExportOptions => {
  const options: EvidenceExportOptions = {
    requireChainOk: true,
    strict: true,
    includeChainEvidence: true,
    pretty: true,
    out: join(process.cwd(), 'ci', 'baselines', 'audit-export.json'),
    endpoint: (process.env.AUDIT_LEDGER_URL || 'http://localhost:4003').replace(/\/$/, ''),
    previousPath: join(process.cwd(), 'ci', 'baselines', 'audit-evidence.json'),
    timeoutMs: DEFAULT_TIMEOUT_MS
  };

  for (const arg of process.argv.slice(2)) {
    const eq = arg.indexOf('=');
    if (!arg.startsWith('--') || eq === -1) {
      continue;
    }
    const key = truthyString(arg.slice(2, eq));
    const value = arg.slice(eq + 1);

    switch (key) {
      case 'endpoint':
      case 'url':
        options.endpoint = value.replace(/\/$/, '');
        break;
      case 'out':
      case 'output':
        options.out = value;
        break;
      case 'source-file':
      case 'sourcefile':
      case 'events':
        options.sourceFile = value;
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
      case 'limit':
      case 'offset': {
        const parsed = Number.parseInt(value, 10);
        if (Number.isFinite(parsed)) {
          if (key === 'limit') options.limit = parsed;
          else options.offset = parsed;
        }
        break;
      }
      case 'require-chain-ok':
      case 'requirechainok':
        options.requireChainOk = truthyString(value) !== 'false';
        break;
      case 'strict':
        options.strict = truthyString(value) !== 'false';
        break;
      case 'previous-path':
      case 'previous':
        options.previousPath = value;
        break;
      case 'previous-digest':
        options.previousDigestOverride = value;
        break;
      case 'include-chain-evidence':
        options.includeChainEvidence = truthyString(value) !== 'false';
        break;
      case 'pretty':
        options.pretty = truthyString(value) !== 'false';
        break;
      case 'timeout-ms':
      case 'timeout': {
        const timeout = Number.parseInt(value, 10);
        if (Number.isFinite(timeout) && timeout > 0) {
          options.timeoutMs = timeout;
        }
        break;
      }
      default:
        break;
    }
  }

  return options;
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

const parseFlag = (candidate: unknown, fallback: boolean): boolean => {
  if (typeof candidate !== 'string') return fallback;
  const value = truthyString(candidate);
  if (value === 'true' || value === '1' || value === 'yes' || value === 'on') return true;
  if (value === 'false' || value === '0' || value === 'off' || value === 'no') return false;
  return fallback;
};

const normalizeEvents = (events: unknown, strict: boolean): AuditEvent[] => {
  if (!Array.isArray(events)) {
    if (!strict) return [];
    throw new Error('audit_events_not_array');
  }

  const result: AuditEvent[] = [];
  for (const entry of events) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      if (!strict) continue;
      throw new Error('audit_event_invalid_shape');
    }

    const record = entry as AuditEvent;
    if (
      typeof record.id !== 'string' ||
      typeof record.service !== 'string' ||
      typeof record.action !== 'string' ||
      typeof record.principal !== 'string'
    ) {
      if (!strict) continue;
      throw new Error('audit_event_required_fields_missing');
    }
    result.push(record);
  }

  return result;
};

const loadSourceEnvelope = (path: string): ParsedEnvelope => {
  const rawText = readFileSync(path, 'utf8');
  const raw = JSON.parse(rawText) as unknown;

  if (!raw || typeof raw !== 'object') {
    throw new Error(`source_file_invalid_json:${path}`);
  }

  const root = raw as UnknownRecord;
  if (Array.isArray(root.events)) {
    return {
      events: normalizeEvents(root.events, true),
      sourcePath: path
    };
  }

  if (typeof root.recordType === 'string' && typeof root.payload === 'object' && root.payload !== null) {
    const payload = root.payload as UnknownRecord;
    if (Array.isArray(payload.events)) {
      const chain = (payload.chainVerification as UnknownRecord | undefined) ?? (payload.chain as UnknownRecord | undefined);
      const chainVerification =
        typeof chain === 'object' && chain !== null && !Array.isArray(chain)
          ? {
              ...chain,
              ok: parseFlag(chain.ok, true)
            }
          : { ok: true };

      return {
        events: normalizeEvents(payload.events, true),
        chainVerification,
        sourcePath: path
      };
    }
  }

  throw new Error(`source_file_unrecognized:${path}`);
};

const queryString = (options: EvidenceExportOptions): string => {
  const query = new URLSearchParams();

  if (options.principal) query.set('principal', options.principal);
  if (options.service) query.set('service', options.service);
  if (options.action) query.set('action', options.action);
  if (options.traceId) query.set('traceId', options.traceId);
  if (options.resource) query.set('resource', options.resource);
  if (options.schemaVersion) query.set('schemaVersion', options.schemaVersion);
  if (options.from) query.set('from', options.from);
  if (options.to) query.set('to', options.to);
  if (typeof options.limit === 'number' && Number.isFinite(options.limit)) query.set('limit', `${options.limit}`);
  if (typeof options.offset === 'number' && Number.isFinite(options.offset)) query.set('offset', `${options.offset}`);

  const payload = query.toString();
  return payload.length > 0 ? `?${payload}` : '';
};

const parseChain = (body: unknown): ChainSummary => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('audit_chain_verification_invalid');
  }
  const source = body as ChainSummary;
  return {
    ok: parseFlag(source.ok, false),
    checked: typeof source.checked === 'number' ? source.checked : 0,
    ...source
  };
};

const readPreviousDigest = async (options: EvidenceExportOptions): Promise<string | undefined> => {
  if (options.previousDigestOverride) return options.previousDigestOverride;

  const previousPath = options.previousPath || '';
  if (previousPath && !existsSync(previousPath)) {
    if (options.strict) {
      throw new Error(`previous_evidence_missing:${previousPath}`);
    }
    return undefined;
  }

  const fallbackPath = previousPath || join(process.cwd(), 'ci', 'baselines', 'audit-evidence.json');
  try {
    const previousRaw = await readFile(fallbackPath, 'utf8');
    return readEvidenceEnvelope(JSON.parse(previousRaw)).digest;
  } catch (error) {
    if (options.strict) throw error instanceof Error ? error : new Error(String(error));
    return undefined;
  }
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
  if (typeof options.limit === 'number') filters.limit = options.limit;
  if (typeof options.offset === 'number') filters.offset = options.offset;
  return filters;
};

const eventSummary = (events: AuditEvent[]) => {
  const serviceCounts = new Map<string, number>();
  const actionCounts = new Map<string, number>();
  const timestamps = events.map((entry) => (typeof entry.timestamp === 'string' ? entry.timestamp : null)).filter(Boolean) as string[];

  for (const event of events) {
    const service = typeof event.service === 'string' ? event.service : 'unknown';
    const action = typeof event.action === 'string' ? event.action : 'unknown';
    serviceCounts.set(service, (serviceCounts.get(service) ?? 0) + 1);
    actionCounts.set(action, (actionCounts.get(action) ?? 0) + 1);
  }

  return {
    eventCount: events.length,
    firstTimestamp: timestamps.length > 0 ? timestamps[0] : null,
    lastTimestamp: timestamps.length > 0 ? timestamps[timestamps.length - 1] : null,
    serviceCounts: Object.fromEntries(serviceCounts),
    actionCounts: Object.fromEntries(actionCounts)
  };
};

const run = async () => {
  const options = parseArgs();
  const strict = parseFlag(options.strict, true);
  const requireChainOk = parseFlag(options.requireChainOk, true);
  const out = options.out || join(process.cwd(), 'ci', 'baselines', 'audit-export.json');
  if (!out.endsWith('.json')) throw new Error(`output_path_invalid:${out}`);

  const endpoint = (options.endpoint || 'http://localhost:4003').replace(/\/$/, '');
  const query = queryString(options);

  const sourcePayload: ParsedEnvelope = options.sourceFile
    ? loadSourceEnvelope(options.sourceFile)
    : { events: [], chainVerification: { ok: true, checked: 0 } };

  let events = sourcePayload.events;
  let chainVerification = sourcePayload.chainVerification ?? { ok: true, checked: 0 };

  if (!options.sourceFile) {
    const eventsResponse = await fetchWithTimeout(`${endpoint}/audit/events${query}`, options.timeoutMs || DEFAULT_TIMEOUT_MS);
    if (!eventsResponse.ok) {
      throw new Error(`failed_to_fetch_audit_events:${eventsResponse.status}`);
    }

    const eventsPayload = await eventsResponse.json();
    events = normalizeEvents(eventsPayload, strict);

    const verifyResponse = await fetchWithTimeout(`${endpoint}/audit/hash-chain/verify`, options.timeoutMs || DEFAULT_TIMEOUT_MS);
    if (!verifyResponse.ok) {
      throw new Error(`failed_to_verify_hash_chain:${verifyResponse.status}`);
    }
    chainVerification = parseChain(await verifyResponse.json());
  } else if (options.includeChainEvidence) {
    chainVerification = {
      ok: parseFlag((chainVerification as UnknownRecord).ok, true),
      checked: events.length,
      source: sourcePayload.sourcePath
    };
  }

  if (requireChainOk && parseFlag(chainVerification.ok, false) !== true) {
    throw new Error(`audit_chain_invalid:${JSON.stringify(chainVerification)}`);
  }

  const payload = {
    generatedBy: 'tools/scripts/export-audit-evidence.ts',
    source: {
      endpoint: options.sourceFile ? options.sourceFile : endpoint,
      type: options.sourceFile ? 'file' : 'ledger'
    },
    filters: buildFilters(options),
    chainVerification,
    summary: eventSummary(events),
    events
  };

  const previousDigest = await readPreviousDigest(options);
  const evidence = writeEvidenceEnvelope(payload, 'audit-export', previousDigest);

  await mkdir(join(process.cwd(), 'ci', 'baselines'), { recursive: true });
  await writeFile(out, JSON.stringify(evidence, null, options.pretty === false ? 0 : 2), 'utf8');
  console.log(`Audit export evidence written: ${out}`);
};

void run().catch((error) => {
  console.error(String(error));
  process.exit(1);
});
