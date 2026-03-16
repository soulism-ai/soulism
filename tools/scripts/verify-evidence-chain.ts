import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readEvidenceEnvelope, type EvidenceEnvelope, verifyEvidenceChain } from '@soulism/shared/evidence.js';

type VerifyEvidenceOptions = {
  inputs: string[];
  requireChainOk: boolean;
  strict: boolean;
  out?: string;
  pretty: boolean;
};

type VerifyReport = {
  status: 'ok' | 'fail';
  inputCount: number;
  checked: number;
  ok: boolean;
  failedAt?: number;
  failureReason?: string;
};

const parseBool = (value: string | undefined, fallback: boolean): boolean => {
  if (!value) return fallback;
  const normalized = value.toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on') return true;
  if (normalized === 'false' || normalized === '0' || normalized === 'no' || normalized === 'off') return false;
  return fallback;
};

const parseArgs = (): VerifyEvidenceOptions => {
  const options: VerifyEvidenceOptions = {
    inputs: [
      join(process.cwd(), 'ci', 'baselines', 'audit-evidence.json'),
      join(process.cwd(), 'ci', 'baselines', 'audit-export.json')
    ],
    requireChainOk: true,
    strict: true,
    pretty: true
  };

  for (const arg of process.argv.slice(2)) {
    if (!arg.startsWith('--')) {
      options.inputs.push(arg);
      continue;
    }
    const eq = arg.indexOf('=');
    const key = (eq === -1 ? arg.slice(2) : arg.slice(2, eq)).toLowerCase();
    const value = eq === -1 ? undefined : arg.slice(eq + 1);
    switch (key) {
      case 'input':
      case 'file':
      case 'path':
        if (value) options.inputs.push(value);
        break;
      case 'out':
      case 'output':
        options.out = value;
        break;
      case 'require-chain-ok':
      case 'requirechainok':
        options.requireChainOk = parseBool(value, true);
        break;
      case 'strict':
        options.strict = parseBool(value, true);
        break;
      case 'pretty':
        options.pretty = parseBool(value, true);
        break;
      default:
        break;
    }
  }

  return options;
};

const uniqueInputs = (inputs: string[]): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const input of inputs) {
    const normalized = input.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
};

const loadEvidenceEnvelope = async (path: string): Promise<EvidenceEnvelope<Record<string, unknown>>> => {
  const raw = await readFile(path, 'utf8');
  return readEvidenceEnvelope(JSON.parse(raw));
};

const run = async () => {
  const options = parseArgs();
  const inputs = uniqueInputs(options.inputs);
  if (inputs.length === 0) {
    throw new Error('no input evidence files');
  }

  const entries: Array<EvidenceEnvelope<Record<string, unknown>>> = [];
  const missing: string[] = [];

  for (const input of inputs) {
    try {
      const envelope = await loadEvidenceEnvelope(input);
      entries.push(envelope);
    } catch (error) {
      if (options.strict) {
        throw new Error(`evidence_load_failed:${input}:${error instanceof Error ? error.message : 'unknown'}`);
      }
      missing.push(input);
    }
  }

  if (entries.length === 0 && options.strict) {
    throw new Error(`no_valid_evidence_entries:${missing.join(',')}`);
  }

  const chain = verifyEvidenceChain(entries);
  const report: VerifyReport = {
    status: chain.ok ? 'ok' : 'fail',
    inputCount: entries.length,
    checked: chain.checked,
    ok: chain.ok,
    failedAt: chain.failureIndex,
    failureReason: chain.failureReason
  };

  if (options.out) {
    const payload = {
      generatedBy: 'tools/scripts/verify-evidence-chain.ts',
      generatedAt: new Date().toISOString(),
      status: report.status,
      ok: chain.ok,
      checked: chain.checked,
      failureIndex: chain.failureIndex,
      failureReason: chain.failureReason,
      requireChainOk: options.requireChainOk,
      inputs,
      missing
    };
    await writeFile(options.out!, JSON.stringify(payload, null, options.pretty ? 2 : 0), 'utf8');
  }

  console.log(JSON.stringify(report, null, options.pretty ? 2 : 0));

  if (!chain.ok && options.requireChainOk) {
    process.exitCode = 1;
    return;
  }
};

void run().catch((error) => {
  console.error(String(error));
  process.exit(1);
});
