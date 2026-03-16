import { mkdir, readdir, readFile, writeFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';

export type Severity = 'error' | 'warning';

export type IssuePath = string;

export interface ValidationIssue {
  file: string;
  severity: Severity;
  code: string;
  path: IssuePath;
  message: string;
  actualType?: string;
  expectedType?: string;
}

export interface EvidenceSummary {
  section: string;
  schemaVersion: string;
  generatedAt: string;
  totalFiles: number;
  failed: number;
  errorCount: number;
  warningCount: number;
  files: Array<{
    file: string;
    passed: boolean;
    errors: number;
    warnings: number;
    issues: Array<{
      severity: Severity;
      code: string;
      path: IssuePath;
      message: string;
      actualType?: string;
      expectedType?: string;
    }>;
  }>;
}

export interface ValidationOptions {
  schemaVersion?: string;
  rootDir?: string;
  allowlist?: Array<(issues: ValidationIssue[]) => ValidationIssue[]>;
  maxIssuesPerFile?: number;
  emitWarnings?: boolean;
}

export type JsonValue = null | boolean | number | string | unknown[] | Record<string, unknown>;

export type SchemaNode =
  | {
      type: 'string';
      minLength?: number;
      maxLength?: number;
      pattern?: string;
      enum?: string[];
      const?: unknown;
      default?: unknown;
      required?: string[];
    }
  | {
      type: 'number' | 'integer' | 'boolean' | 'null';
      minimum?: number;
      maximum?: number;
      const?: unknown;
      enum?: unknown[];
      required?: string[];
    }
  | {
      type: 'array';
      items?: SchemaNode;
      minItems?: number;
      maxItems?: number;
      uniqueItems?: boolean;
      required?: string[];
    }
  | {
      type: 'object';
      properties?: Record<string, SchemaNode>;
      required?: string[];
      additionalProperties?: boolean;
      minProperties?: number;
      maxProperties?: number;
    }
  | {
      allOf?: SchemaNode[];
      anyOf?: SchemaNode[];
      oneOf?: SchemaNode[];
      not?: SchemaNode;
      type?: string;
      enum?: unknown[];
      const?: unknown;
    };

export interface RuleContext {
  path: string;
  value: unknown;
  filePath: string;
  issues: ValidationIssue[];
}

export type DomainRule = (context: RuleContext) => void;

const ROOT_SENTINEL = '§';
const issueLimit = 200;

const placeholderChecks = [/placeholder/i, /TODO/i, /\bWIP\b/i, /FILL_ME/i, /replace_me/i];

const defaultOptions: Required<ValidationOptions> = {
  schemaVersion: '1.0.0',
  rootDir: process.cwd(),
  allowlist: [],
  maxIssuesPerFile: 250,
  emitWarnings: true
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every((v) => typeof v === 'string');

const asYamlString = (value: string): string => {
  const trimmed = value.trim();
  if (trimmed.length === 0) return '';
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
};

const isPlaceholderText = (value: unknown): boolean => {
  if (typeof value !== 'string') return false;
  return placeholderChecks.some((pattern) => pattern.test(value));
};

const canonicalType = (value: unknown): string => {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
};

const stripBom = (value: string): string => {
  if (value.charCodeAt(0) === 0xfeff) return value.slice(1);
  return value;
};

const indentBy = (depth: number): string => '  '.repeat(depth);

const quotePathSegment = (segment: string): string => {
  if (/^\d+$/.test(segment)) return `[${segment}]`;
  if (/^[A-Za-z0-9_.$-]+$/.test(segment)) return segment;
  return `["${segment.replace(/"/g, '\\"')}"]`;
};

const joinPath = (base: string, segment: string): string =>
  base === ROOT_SENTINEL ? `$.${segment}` : `${base}${segment.startsWith('[') ? '' : '.'}${segment}`;

const parseFlowScalar = (raw: string): unknown => {
  const value = raw.trim();
  if (value.length === 0) return null;

  if (value.startsWith('[') && value.endsWith(']')) {
    return parseFlowArray(value.slice(1, -1));
  }
  if (value.startsWith('{') && value.endsWith('}')) {
    return parseFlowObject(value.slice(1, -1));
  }
  if (value === '~' || value.toLowerCase() === 'null') return null;
  if (value === 'true' || value === 'true') return true;
  if (value === 'false' || value === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(value)) {
    const num = Number(value);
    if (Number.isFinite(num)) return num;
  }
  return asYamlString(value);
};

const parseFlowArray = (body: string): unknown[] => {
  const items: unknown[] = [];
  let i = 0;
  let depth = 0;
  let quote: '"' | "'" | null = null;
  let token = '';

  const flush = () => {
    const current = token.trim();
    if (current.length > 0) {
      items.push(parseFlowScalar(current));
    }
    token = '';
  };

  for (let p = 0; p < body.length; p += 1) {
    const ch = body[p]!;
    const prev = body[p - 1];
    if (ch === quote && prev !== '\\') {
      quote = null;
      token += ch;
      continue;
    }
    if (!quote && (ch === '"' || ch === "'")) {
      quote = ch;
      token += ch;
      continue;
    }
    if (!quote && (ch === '{' || ch === '[')) {
      depth += 1;
      token += ch;
      continue;
    }
    if (!quote && (ch === '}' || ch === ']')) {
      depth -= 1;
      token += ch;
      continue;
    }
    if (!quote && ch === ',' && depth === 0) {
      flush();
      continue;
    }
    token += ch;
  }
  flush();
  return items;
};

const parseFlowObject = (body: string): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  let i = 0;
  let quote: '"' | "'" | null = null;
  let depth = 0;
  let token = '';
  let key: string | null = null;

  const flushPair = () => {
    const part = token.trim();
    if (part.length === 0) return;
    const idx = part.indexOf(':');
    if (idx === -1) return;
    const rawKey = part.slice(0, idx).trim();
    const rawValue = part.slice(idx + 1).trim();
    const normKey = asYamlString(rawKey.replace(/^["']|["']$/g, ''));
    out[normKey] = parseFlowScalar(rawValue);
    key = null;
  };

  for (let p = 0; p < body.length; p += 1) {
    const ch = body[p]!;
    const prev = body[p - 1];
    if (ch === quote && prev !== '\\') {
      quote = null;
      token += ch;
      continue;
    }
    if (!quote && (ch === '"' || ch === "'")) {
      quote = ch;
      token += ch;
      continue;
    }
    if (!quote && (ch === '{' || ch === '[')) {
      depth += 1;
      token += ch;
      continue;
    }
    if (!quote && (ch === '}' || ch === ']')) {
      depth -= 1;
      token += ch;
      continue;
    }
    if (!quote && ch === ':' && key === null && depth === 0 && token.length > 0 && token.indexOf(':') === -1) {
      key = token;
      token = '';
      continue;
    }
    if (!quote && ch === ',' && depth === 0 && key === null) {
      flushPair();
      continue;
    }
    token += ch;
  }
  if (token.length > 0) {
    flushPair();
  }
  return out;
};

const removeLineComment = (input: string): string => {
  if (!input.includes('#')) return input;
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i]!;
    const prev = input[i - 1];
    if (ch === quote && prev !== '\\') {
      quote = null;
      continue;
    }
    if (!quote && (ch === '"' || ch === "'")) {
      quote = ch;
      continue;
    }
    if (!quote && ch === '#') {
      return input.slice(0, i);
    }
  }
  return input;
};

const nextNonEmpty = (lines: string[], start: number): { line: string; indent: number } | null => {
  for (let i = start; i < lines.length; i += 1) {
    const raw = removeLineComment(lines[i]!).trimEnd();
    if (raw.trim().length === 0) continue;
    const indent = raw.length - raw.trimStart().length;
    return { line: raw, indent };
  }
  return null;
};

const parseScalarFromLine = (value: string): unknown => {
  const trimmed = value.trim();
  if (trimmed.length === 0) return '';
  if (trimmed.startsWith('"') || trimmed.startsWith("'")) {
    return asYamlString(trimmed);
  }
  if (trimmed === '|' || trimmed === '>-') {
    return '';
  }
  return parseFlowScalar(trimmed);
};

export const parseYamlDocument = (input: string, filePath: string): JsonValue => {
  const lines = stripBom(input).split('\n');
  const root: Record<string, unknown> = {};
  const stack: Array<{ indent: number; container: Record<string, unknown> | unknown[] }> = [{ indent: -1, container: root }];

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = removeLineComment(lines[index]!).replace(/\r$/, '');
    const line = rawLine;
    if (line.trim().length === 0) continue;

    const indent = line.length - line.trimStart().length;
    const trimmed = line.trim();
    if (trimmed.startsWith('#')) continue;

    while (stack.length > 1 && indent <= stack[stack.length - 1]!.indent) {
      stack.pop();
    }

    const frame = stack[stack.length - 1]!;
    const target = frame.container;

    if (Array.isArray(target)) {
      if (!trimmed.startsWith('-')) {
        continue;
      }
      const rest = trimmed.slice(1).trim();

      if (rest.length === 0) {
        const next = nextNonEmpty(lines, index + 1);
        if (!next) {
          target.push(null);
        } else if (next.line.trimStart().startsWith('-')) {
          const child: unknown[] = [];
          target.push(child);
          stack.push({ indent, container: child });
        } else if (next.line.includes(':')) {
          const child: Record<string, unknown> = {};
          target.push(child);
          stack.push({ indent, container: child });
        } else {
          const child: unknown[] = [];
          target.push(child);
          stack.push({ indent, container: child });
        }
        continue;
      }

      const pairSplit = rest.indexOf(':');
      if (pairSplit === -1) {
        target.push(parseScalarFromLine(rest));
        continue;
      }

      const restKey = rest.slice(0, pairSplit).trim();
      const restValue = rest.slice(pairSplit + 1).trim();
      if (!restKey) {
        target.push(parseScalarFromLine(rest));
        continue;
      }

      const current: Record<string, unknown> = {};
      current[restKey] = restValue.length > 0 ? parseScalarFromLine(restValue) : {};
      target.push(current);
      if (restValue.length === 0) {
        stack.push({ indent, container: current });
      }
      continue;
    }

    const pairSplit = trimmed.indexOf(':');
    if (pairSplit === -1) {
      continue;
    }

    const key = trimmed.slice(0, pairSplit).trim();
    if (key.length === 0) {
      continue;
    }
    const rest = trimmed.slice(pairSplit + 1).trim();
    const parent = frame.container as Record<string, unknown>;

    if (rest.length === 0) {
      const next = nextNonEmpty(lines, index + 1);
      if (!next) {
        parent[key] = {};
        continue;
      }
      const child: Record<string, unknown> | unknown[] = next.line.trimStart().startsWith('-') ? [] : {};
      parent[key] = child;
      stack.push({ indent, container: child });
      continue;
    }

    if (rest === '>') {
      const folded = [];
      let blockLine = index + 1;
      const childIndent = indent + 2;
      while (blockLine < lines.length) {
        const candidateRaw = removeLineComment(lines[blockLine]!).replace(/\r$/, '');
        const candidate = candidateRaw.trimEnd();
        const candidateIndent = candidate.length - candidate.trimStart().length;
        if (candidate.trim().length === 0) {
          folded.push('');
          blockLine += 1;
          continue;
        }
        if (candidateIndent <= indent) break;
        if (candidateIndent < childIndent) break;
        folded.push(candidate.trimStart());
        blockLine += 1;
      }
      index = blockLine - 1;
      parent[key] = folded.join(' ');
      continue;
    }

    if (rest.startsWith('|')) {
      const folded = [];
      let blockLine = index + 1;
      const blockIndent = indent + 2;
      while (blockLine < lines.length) {
        const raw = removeLineComment(lines[blockLine]!).replace(/\r$/, '');
        const candidateIndent = raw.length - raw.trimStart().length;
        const normalized = raw.trimEnd();
        if (normalized.trim().length === 0) {
          folded.push('');
          blockLine += 1;
          continue;
        }
        if (candidateIndent <= indent) break;
        if (candidateIndent < blockIndent) break;
        folded.push(normalized.trimStart());
        blockLine += 1;
      }
      index = blockLine - 1;
      parent[key] = folded.join('\n');
      continue;
    }

    parent[key] = parseScalarFromLine(rest);
  }

  return root;
};

const typeMismatch = (actual: unknown, expected: string): boolean => {
  const actualType = canonicalType(actual);
  if (expected === 'integer') return actualType === 'number' && Number.isInteger(actual as number);
  if (expected === 'array') return actualType === 'array';
  if (expected === 'boolean') return actualType === 'boolean';
  if (expected === 'object') return actualType === 'object';
  if (expected === 'null') return actualType === 'null';
  if (expected === 'number') return actualType === 'number';
  if (expected === 'string') return actualType === 'string';
  return actualType === expected;
};

const validateSchemaNode = (
  filePath: string,
  value: unknown,
  schema: SchemaNode,
  path: string,
  issueCollector: ValidationIssue[]
): void => {
  if (!schema || typeof schema !== 'object') return;

  if ('allOf' in schema && Array.isArray(schema.allOf)) {
    for (let i = 0; i < schema.allOf.length; i += 1) {
      const branch = schema.allOf[i];
      if (!branch) continue;
      validateSchemaNode(filePath, value, branch, path, issueCollector);
    }
    return;
  }

  if ('anyOf' in schema && Array.isArray(schema.anyOf)) {
    const matched = schema.anyOf.some((candidate) => {
      if (!candidate || typeof candidate !== 'object') return false;
      const nestedIssues: ValidationIssue[] = [];
      validateSchemaNode(filePath, value, candidate, path, nestedIssues);
      return nestedIssues.length === 0;
    });
    if (!matched) {
      issueCollector.push({
        file: filePath,
        severity: 'error',
        code: 'schema_anyOf_mismatch',
        path,
        message: 'value does not match any schemas',
        actualType: canonicalType(value)
      });
    }
    return;
  }

  if ('oneOf' in schema && Array.isArray(schema.oneOf)) {
    const matched = schema.oneOf.filter((candidate) => {
      if (!candidate || typeof candidate !== 'object') return false;
      const nestedIssues: ValidationIssue[] = [];
      validateSchemaNode(filePath, value, candidate, path, nestedIssues);
      return nestedIssues.length === 0;
    });
    if (matched.length !== 1) {
      issueCollector.push({
        file: filePath,
        severity: 'error',
        code: 'schema_oneOf_invalid',
        path,
        message: `value must match exactly one schema; matched ${matched.length}`,
        actualType: canonicalType(value)
      });
    }
    return;
  }

  if ('not' in schema && schema.not) {
    const nested: ValidationIssue[] = [];
    validateSchemaNode(filePath, value, schema.not, path, nested);
    if (nested.length === 0) {
      issueCollector.push({
        file: filePath,
        severity: 'error',
        code: 'schema_not_violated',
        path,
        message: 'value must not match negated schema',
        actualType: canonicalType(value)
      });
    }
  }

  if ('const' in schema && schema.const !== undefined && value !== schema.const) {
    issueCollector.push({
      file: filePath,
      severity: 'error',
      code: 'schema_const_mismatch',
      path,
      message: 'value does not match constant',
      expectedType: JSON.stringify(schema.const),
      actualType: JSON.stringify(value)
    });
    return;
  }

  if ('enum' in schema && Array.isArray(schema.enum)) {
    const ok = schema.enum.some((entry) => Object.is(entry, value));
    if (!ok) {
      issueCollector.push({
        file: filePath,
        severity: 'error',
        code: 'schema_enum_mismatch',
        path,
        message: 'value is not in allowed enumeration',
        actualType: canonicalType(value),
        expectedType: 'enum'
      });
    }
  }

  if ('type' in schema) {
    const type = schema.type;
    if (!typeMismatch(value, type)) {
      issueCollector.push({
        file: filePath,
        severity: 'error',
        code: 'schema_type_mismatch',
        path,
        message: `expected ${type}`,
        expectedType: type,
        actualType: canonicalType(value)
      });
      return;
    }
  }

  if (schema.type === 'string' && typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      issueCollector.push({
        file: filePath,
        severity: 'error',
        code: 'schema_string_too_short',
        path,
        message: `string shorter than minLength(${schema.minLength})`,
        actualType: String(value.length)
      });
    }
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      issueCollector.push({
        file: filePath,
        severity: 'warning',
        code: 'schema_string_too_long',
        path,
        message: `string longer than maxLength(${schema.maxLength})`,
        actualType: String(value.length)
      });
    }
    if (schema.pattern) {
      const expression = new RegExp(schema.pattern);
      if (!expression.test(value)) {
        issueCollector.push({
          file: filePath,
          severity: 'error',
          code: 'schema_string_pattern',
          path,
          message: `string does not match pattern ${schema.pattern}`,
          actualType: value
        });
      }
    }
    return;
  }

  if ((schema.type === 'number' || schema.type === 'integer') && typeof value === 'number') {
    if (schema.type === 'integer' && !Number.isInteger(value)) {
      issueCollector.push({
        file: filePath,
        severity: 'error',
        code: 'schema_integer_required',
        path,
        message: 'value is not an integer',
        actualType: String(value)
      });
    }
    if (schema.minimum !== undefined && value < schema.minimum) {
      issueCollector.push({
        file: filePath,
        severity: 'error',
        code: 'schema_number_min',
        path,
        message: `number below minimum ${schema.minimum}`,
        actualType: String(value)
      });
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      issueCollector.push({
        file: filePath,
        severity: 'error',
        code: 'schema_number_max',
        path,
        message: `number above maximum ${schema.maximum}`,
        actualType: String(value)
      });
    }
    return;
  }

  if (schema.type === 'array' && Array.isArray(value)) {
    const minItems = schema.minItems ?? 0;
    if (value.length < minItems) {
      issueCollector.push({
        file: filePath,
        severity: 'error',
        code: 'schema_array_min_items',
        path,
        message: `array shorter than minItems(${minItems})`,
        actualType: String(value.length)
      });
    }
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      issueCollector.push({
        file: filePath,
        severity: 'warning',
        code: 'schema_array_max_items',
        path,
        message: `array longer than maxItems(${schema.maxItems})`,
        actualType: String(value.length)
      });
    }
    if (schema.uniqueItems && Array.isArray(value)) {
      const seen = new Set<string>();
      for (const item of value) {
        const stamp = JSON.stringify(item);
        if (seen.has(stamp)) {
          issueCollector.push({
            file: filePath,
            severity: 'error',
            code: 'schema_array_unique_items',
            path,
            message: 'array contains duplicate items',
            actualType: stamp
          });
          break;
        }
        seen.add(stamp);
      }
    }
    if (schema.items && value.length > 0) {
      for (let index = 0; index < value.length; index += 1) {
        validateSchemaNode(filePath, value[index], schema.items, `${path}[${index}]`, issueCollector);
      }
    }
    return;
  }

  if (schema.type === 'object' && isRecord(value)) {
    const props = schema.properties || {};
    const required = schema.required || [];
    for (const key of required) {
      if (!(key in value)) {
        issueCollector.push({
          file: filePath,
          severity: 'error',
          code: 'schema_required_property_missing',
          path: joinPath(path, quotePathSegment(key)),
          message: `required property '${key}' is missing`,
          expectedType: 'defined'
        });
      }
    }

    for (const [key, child] of Object.entries(value)) {
      const propertySchema = props[key];
      if (!propertySchema) {
        if (schema.additionalProperties === false) {
          issueCollector.push({
            file: filePath,
            severity: 'error',
            code: 'schema_additional_property',
            path: joinPath(path, quotePathSegment(key)),
            message: `additional property '${key}' not allowed`
          });
        }
        continue;
      }
      validateSchemaNode(filePath, child, propertySchema, joinPath(path, quotePathSegment(key)), issueCollector);
    }

    const keys = Object.keys(value).length;
    const minProperties = schema.minProperties ?? 0;
    const maxProperties = schema.maxProperties;
    if (keys < minProperties) {
      issueCollector.push({
        file: filePath,
        severity: 'error',
        code: 'schema_object_min_properties',
        path,
        message: `object has fewer than minProperties(${minProperties})`,
        actualType: String(keys)
      });
    }
    if (maxProperties !== undefined && keys > maxProperties) {
      issueCollector.push({
        file: filePath,
        severity: 'warning',
        code: 'schema_object_max_properties',
        path,
        message: `object has more than maxProperties(${maxProperties})`,
        actualType: String(keys)
      });
    }
    return;
  }

  if (schema.type === 'boolean' && typeof value !== 'boolean') {
    issueCollector.push({
      file: filePath,
      severity: 'error',
      code: 'schema_boolean',
      path,
      message: 'value should be boolean',
      actualType: canonicalType(value),
      expectedType: 'boolean'
    });
  }
};

export const collectFiles = async (
  rootDir: string,
  matcher: (relativePath: string, fullPath: string) => boolean,
  acc: string[] = []
): Promise<string[]> => {
  const entries = await readdir(rootDir, { withFileTypes: true });
  const normalizedRoot = rootDir.endsWith('/') ? rootDir : `${rootDir}/`;
  for (const entry of entries) {
    const nextPath = join(rootDir, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === '.turbo' || entry.name === '.next') {
      continue;
    }
    if (entry.isDirectory()) {
      await collectFiles(nextPath, matcher, acc);
      continue;
    }
    if (entry.isFile()) {
      const relative = nextPath.startsWith(normalizedRoot) ? nextPath.slice(normalizedRoot.length) : nextPath;
      if (matcher(relative, nextPath)) {
        acc.push(nextPath);
      }
    }
  }
  return acc;
};

export const readTextFile = async (path: string): Promise<string> => stripBom(await readFile(path, 'utf8'));

export const readJsonFile = async <T>(path: string): Promise<T> => {
  const raw = await readTextFile(path);
  return JSON.parse(raw) as T;
};

export const readYamlFile = async (path: string): Promise<JsonValue> => {
  const raw = await readTextFile(path);
  return parseYamlDocument(raw, path);
};

export const readDocument = async (
  path: string
): Promise<{
  data: JsonValue;
  format: 'json' | 'yaml';
}> => {
  const raw = await readTextFile(path);
  if (!raw || raw.trim().length === 0) {
    throw new Error('empty_document');
  }
  if (path.endsWith('.json')) {
    return { data: JSON.parse(raw) as JsonValue, format: 'json' };
  }
  return { data: parseYamlDocument(raw, path), format: 'yaml' };
};

export const validateDocument = (
  filePath: string,
  document: unknown,
  schema: SchemaNode,
  maxIssues = issueLimit,
  extraRules: DomainRule[] = [],
  includeWarnings = true
): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  validateSchemaNode(filePath, document, schema, ROOT_SENTINEL, issues);

  if (isPlaceholderText(document)) {
    issues.push({
      file: filePath,
      severity: 'error',
      code: 'placeholder_content',
      path: ROOT_SENTINEL,
      message: 'document includes placeholder-like text'
    });
  }

  if (includeWarnings) {
    if (typeof document === 'string' && document.length > 50_000_000) {
      issues.push({
        file: filePath,
        severity: 'warning',
        code: 'oversized_document',
        path: ROOT_SENTINEL,
        message: 'document is unusually large'
      });
    }
  }

  for (const rule of extraRules) {
    if (issues.length >= maxIssues) break;
    rule({ path: ROOT_SENTINEL, value: document, filePath, issues });
  }

  if (issues.length > maxIssues) {
    issues.length = maxIssues;
    issues.push({
      file: filePath,
      severity: 'warning',
      code: 'issue_cap_reached',
      path: ROOT_SENTINEL,
      message: `issue cap ${maxIssues} reached`
    });
  }

  return issues;
};

const issueCodeCounts = (issues: ValidationIssue[]): Record<string, number> =>
  issues.reduce<Record<string, number>>((acc, issue) => {
    acc[issue.code] = (acc[issue.code] || 0) + 1;
    return acc;
  }, {});

export const collectReport = (section: string, fileReports: { file: string; issues: ValidationIssue[] }[]): EvidenceSummary => {
  const files = fileReports.map((report) => {
    const errors = report.issues.filter((issue) => issue.severity === 'error').length;
    const warnings = report.issues.filter((issue) => issue.severity === 'warning').length;
    return {
      file: report.file,
      passed: report.issues.every((issue) => issue.severity !== 'error'),
      errors,
      warnings,
      issues: report.issues.map((entry) => ({
        severity: entry.severity,
        code: entry.code,
        path: entry.path,
        message: entry.message,
        actualType: entry.actualType,
        expectedType: entry.expectedType
      }))
    };
  });

  return {
    section,
    schemaVersion: defaultOptions.schemaVersion,
    generatedAt: new Date().toISOString(),
    totalFiles: fileReports.length,
    failed: files.filter((entry) => !entry.passed).length,
    errorCount: files.reduce((acc, file) => acc + file.errors, 0),
    warningCount: files.reduce((acc, file) => acc + file.warnings, 0),
    files
  };
};

export const writeEvidence = async (path: string, evidence: EvidenceSummary): Promise<string> => {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(evidence, null, 2), 'utf8');
  return path;
};

export const failOnIssues = (label: string, summary: EvidenceSummary): void => {
  if (summary.failed > 0) {
    const issueBreakdown = summary.files
      .flatMap((item) => item.issues.map((issue) => issue.code))
      .reduce<Record<string, number>>((acc, code) => {
        acc[code] = (acc[code] || 0) + 1;
        return acc;
      }, {});
    const sorted = Object.entries(issueBreakdown)
      .map(([code, count]) => `${code}=${count}`)
      .join(', ');
    throw new Error(`${label} failed: ${summary.failed} file(s), ${summary.errorCount} error(s) [${sorted}]`);
  }
};

export const issueSummary = (issues: ValidationIssue[]): string => {
  const errors = issues.filter((issue) => issue.severity === 'error');
  const warnings = issues.filter((issue) => issue.severity === 'warning');
  const buckets = issueCodeCounts(issues);
  const codes = Object.entries(buckets)
    .sort((a, b) => b[1] - a[1])
    .map(([code, count]) => `${code}=${count}`)
    .join(', ');
  return `errors=${errors.length} warnings=${warnings.length}${codes ? ` codes=${codes}` : ''}`;
};

export const isSemVer = (value: string): boolean =>
  typeof value === 'string' && /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/.test(value);

export const assertSemVer = (value: string, file: string, path: string): ValidationIssue[] => {
  if (!isSemVer(value)) {
    return [
      {
        file,
        severity: 'error',
        code: 'invalid_semver',
        path,
        message: `invalid semantic version '${value}'`,
        actualType: value
      }
    ];
  }
  return [];
};

export const ensureIsoDate = (value: string, file: string, path: string): ValidationIssue[] => {
  if (!value || Number.isNaN(Date.parse(value))) {
    return [
      {
        file,
        severity: 'error',
        code: 'invalid_iso_date',
        path,
        message: 'invalid ISO 8601 timestamp'
      }
    ];
  }
  return [];
};

export const ensureString = (value: unknown, file: string, path: string, code = 'invalid_type'): ValidationIssue[] => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return [
      {
        file,
        severity: 'error',
        code,
        path,
        message: `expected non-empty string`,
        actualType: canonicalType(value)
      }
    ];
  }
  if (isPlaceholderText(value)) {
    return [
      {
        file,
        severity: 'error',
        code: 'placeholder_in_value',
        path,
        message: 'placeholder-like text in required string',
        actualType: value
      }
    ];
  }
  return [];
};

export const ensureBoolean = (value: unknown, file: string, path: string, code = 'invalid_boolean'): ValidationIssue[] => {
  if (typeof value !== 'boolean') {
    return [
      {
        file,
        severity: 'error',
        code,
        path,
        message: 'expected boolean',
        actualType: canonicalType(value)
      }
    ];
  }
  return [];
};

export const ensureObject = (value: unknown, file: string, path: string, code = 'invalid_object'): ValidationIssue[] => {
  if (!isRecord(value)) {
    return [
      {
        file,
        severity: 'error',
        code,
        path,
        message: 'expected object',
        actualType: canonicalType(value)
      }
    ];
  }
  if (isPlaceholderText(JSON.stringify(value))) {
    return [
      {
        file,
        severity: 'error',
        code: 'placeholder_in_value',
        path,
        message: 'placeholder-like text in object payload'
      }
    ];
  }
  return [];
};

export const ensureStringArray = (value: unknown, file: string, path: string, options?: { minLength?: number }): ValidationIssue[] => {
  if (!Array.isArray(value) || value.some((v) => typeof v !== 'string' || v.length === 0)) {
    return [
      {
        file,
        severity: 'error',
        code: 'invalid_string_array',
        path,
        message: 'expected array of non-empty strings'
      }
    ];
  }
  if (options?.minLength && value.length < options.minLength) {
    return [
      {
        file,
        severity: 'error',
        code: 'string_array_too_short',
        path,
        message: `array length below minimum ${options.minLength}`
      }
    ];
  }
  return [];
};

export const ensureUniqueValues = (values: readonly string[], file: string, path: string, code: string): ValidationIssue[] => {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates].map((value) => ({
    file,
    severity: 'error',
    code,
    path,
    message: `duplicate value '${value}'`
  }));
};

export const sha256 = (value: string): string => `sha256:${createHash('sha256').update(value).digest('hex')}`;

export const existsAndNonEmpty = async (path: string, file: string, fieldPath: string): Promise<ValidationIssue[]> => {
  try {
    const stats = await stat(path);
    if (!stats.isFile() || stats.size === 0) {
      return [
        {
          file,
          severity: 'error',
          code: 'artifact_empty',
          path: fieldPath,
          message: `artifact not found or empty: ${path}`
        }
      ];
    }
    return [];
  } catch {
    return [
      {
        file,
        severity: 'error',
        code: 'artifact_missing',
        path: fieldPath,
        message: `artifact missing: ${path}`
      }
    ];
  }
};

export const collectDiagnosticsText = (summary: EvidenceSummary, files: Array<{ file: string; issues: ValidationIssue[] }>): string => {
  const lines: string[] = [];
  lines.push(`section=${summary.section}`);
  lines.push(`files=${summary.totalFiles}`);
  lines.push(`failed=${summary.failed}`);
  lines.push(`errors=${summary.errorCount}`);
  lines.push(`warnings=${summary.warningCount}`);
  for (const file of files) {
    if (file.issues.length === 0) continue;
    lines.push(`${file.file}: ${issueSummary(file.issues)}`);
    for (const issue of file.issues.slice(0, 5)) {
      lines.push(`${indentBy(1)}${issue.severity} ${issue.code} ${issue.path} ${issue.message}`);
    }
  }
  return lines.join('\n');
};
