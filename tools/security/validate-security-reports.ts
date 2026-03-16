import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

type ValidationStatus = 'ok' | 'warn' | 'fail';

type ValidationResult = {
  name: string;
  status: ValidationStatus;
  checks: string[];
  errors: string[];
};

type CliOptions = {
  strict: boolean;
  requireSeeds: boolean;
  out?: string;
};

type SemgrepSummary = {
  scanner: 'semgrep';
  schemaVersion: string;
  status: 'clean' | 'findings' | 'runtime_error';
  findings: number;
  expectFindings: boolean;
  targets: string[];
  reportSize: number;
  reportSha256: string;
  parseError: string | null;
};

type TrivySummary = {
  scanner: 'trivy';
  schemaVersion: string;
  status: 'clean' | 'warn' | 'fail' | 'runtime_error';
  targets: string[];
  targetScans: Array<{ target: string; findings: number; status: string; exitCode: number; reportPath: string }>;
  totalFindings: number;
  parseErrors: Array<{ target: string; parseError: string }>;
  expectFindings: boolean;
  reportSize: number;
};

type GitleaksSummary = {
  scanner: 'gitleaks';
  schemaVersion: string;
  status: 'clean' | 'warn' | 'fail' | 'runtime_error' | 'parse_error';
  targets: string[];
  targetScans: Array<{ target: string; findings: number; status: string; exitCode: number; reportPath: string }>;
  totalFindings: number;
  parseErrors: Array<{ target: string; parseError: string }>;
  expectFindings: boolean;
  reportSize: number;
  reportSha256: string;
};

type SeededReport = {
  schemaVersion: string;
  mode: 'all' | 'sast' | 'secrets' | 'deps';
  seedFileCount: number;
  seedPaths: string[];
  report: Record<string, { detected: boolean; message: string; evidence?: string[]; detailHints?: string[] }>;
};

type EvidenceFile = {
  schemaVersion: string;
  generatedAt: string;
  strict: boolean;
  status: 'ok' | 'fail';
  checks: Array<{
    name: string;
    status: ValidationStatus;
    checks: string[];
    errors: string[];
  }>;
  artifacts: Array<{ file: string; status: ValidationStatus; digest: string; size: number }>;
  digest: string;
};

const root = process.cwd();

const toBool = (name: string, fallback: boolean): boolean => {
  const raw = process.argv.find((arg) => arg.startsWith(`--${name}=`))?.split('=', 2)[1];
  if (raw === undefined) return fallback;
  const value = raw.toLowerCase();
  return value === '1' || value === 'true' || value === 'on' || value === 'yes';
};

const toStringArg = (name: string, fallback: string): string => {
  const found = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  return found ? found.split('=', 2)[1] : fallback;
};

const parseBoolean = (value: unknown): boolean => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 'on' || normalized === 'yes';
  }
  return false;
};

const readJson = async <T>(path: string): Promise<T> => {
  const raw = await readFile(join(root, path), 'utf8');
  return JSON.parse(raw) as T;
};

const buildArtifactDigest = async (path: string): Promise<{ size: number; digest: string }> => {
  const raw = await readFile(join(root, path));
  return { size: raw.length, digest: `sha256:${createHash('sha256').update(raw).digest('hex')}` };
};

const ensure = (condition: boolean, errors: string[], message: string): void => {
  if (!condition) {
    errors.push(message);
  }
};

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

const validateSemgrep = (file: string, summary: SemgrepSummary, label: 'clean' | 'seeded'): ValidationResult => {
  const checks: string[] = [];
  const errors: string[] = [];

  ensure(summary.scanner === 'semgrep', errors, `${file}: scanner must be semgrep`);
  ensure(summary.schemaVersion === '1.0.0', errors, `${file}: schemaVersion must be 1.0.0`);
  ensure(Array.isArray(summary.targets), errors, `${file}: targets must be an array`);
  ensure(typeof summary.reportSize === 'number' && summary.reportSize > 0, errors, `${file}: reportSize must be a non-empty integer`);
  ensure(/^[A-Fa-f0-9]{64}$/.test(summary.reportSha256), errors, `${file}: reportSha256 must be sha256 hex`);
  ensure(summary.parseError === null, errors, `${file}: parseError must be null`);

  if (label === 'clean') {
    ensure(!summary.expectFindings, errors, `${file}: clean report must not expect findings`);
    ensure(summary.status === 'clean', errors, `${file}: clean report status must be clean`);
    ensure(summary.findings === 0, errors, `${file}: clean report must contain zero findings`);
    checks.push('semgrep-clean-ok');
  } else {
    ensure(summary.expectFindings, errors, `${file}: seed report must expect findings`);
    ensure(summary.status !== 'runtime_error', errors, `${file}: seed report must not runtime error`);
    ensure(summary.findings > 0, errors, `${file}: seeded report should contain findings`);
    checks.push('semgrep-seed-ok');
  }

  return {
    name: file,
    status: errors.length > 0 ? 'fail' : 'ok',
    checks,
    errors
  };
};

const validateTrivy = (file: string, summary: TrivySummary, label: 'clean' | 'seeded'): ValidationResult => {
  const checks: string[] = [];
  const errors: string[] = [];

  ensure(summary.scanner === 'trivy', errors, `${file}: scanner must be trivy`);
  ensure(summary.schemaVersion === '1.0.0', errors, `${file}: schemaVersion must be 1.0.0`);
  ensure(Array.isArray(summary.targets), errors, `${file}: targets must be an array`);
  ensure(Array.isArray(summary.targetScans), errors, `${file}: targetScans must be an array`);
  ensure(summary.targetScans.length === summary.targets.length, errors, `${file}: targetScans length must match targets`);
  ensure(typeof summary.reportSize === 'number' && summary.reportSize > 0, errors, `${file}: reportSize must be a non-empty integer`);
  ensure(summary.parseErrors.length >= 0, errors, `${file}: parseErrors must be array`);

  if (summary.targetScans.some((entry) => !isObject(entry))) {
    errors.push(`${file}: target scan entries must be objects`);
  }

  if (label === 'clean') {
    ensure(!summary.expectFindings, errors, `${file}: clean report must not expect findings`);
    ensure(summary.status === 'clean', errors, `${file}: clean report status must be clean`);
    ensure(summary.totalFindings === 0, errors, `${file}: clean report should have zero findings`);
    checks.push('trivy-clean-ok');
  } else {
    ensure(summary.expectFindings, errors, `${file}: seed report must expect findings`);
    ensure(summary.totalFindings > 0, errors, `${file}: seeded report should contain findings`);
    ensure(summary.status !== 'runtime_error', errors, `${file}: seed report should not runtime error`);
    checks.push('trivy-seed-ok');
  }

  return {
    name: file,
    status: errors.length > 0 ? 'fail' : 'ok',
    checks,
    errors
  };
};

const validateGitleaks = (file: string, summary: GitleaksSummary, label: 'clean' | 'seeded'): ValidationResult => {
  const checks: string[] = [];
  const errors: string[] = [];

  ensure(summary.scanner === 'gitleaks', errors, `${file}: scanner must be gitleaks`);
  ensure(summary.schemaVersion === '1.0.0', errors, `${file}: schemaVersion must be 1.0.0`);
  ensure(Array.isArray(summary.targets), errors, `${file}: targets must be an array`);
  ensure(Array.isArray(summary.targetScans), errors, `${file}: targetScans must be an array`);
  ensure(summary.targetScans.length > 0, errors, `${file}: targetScans must contain at least one target`);
  ensure(summary.targetScans.length === summary.targets.length, errors, `${file}: targetScans length must match targets`);
  ensure(typeof summary.totalFindings === 'number', errors, `${file}: totalFindings must be number`);
  ensure(/^[A-Fa-f0-9]{64}$/.test(summary.reportSha256), errors, `${file}: reportSha256 must be sha256 hex`);
  ensure(typeof summary.reportSize === 'number' && summary.reportSize > 0, errors, `${file}: reportSize must be non-empty`);

  if (label === 'clean') {
    ensure(!summary.expectFindings, errors, `${file}: clean report must not expect findings`);
    ensure(summary.status === 'clean', errors, `${file}: clean report status must be clean`);
    ensure(summary.totalFindings === 0, errors, `${file}: clean report total findings must be zero`);
    checks.push('gitleaks-clean-ok');
  } else {
    ensure(summary.expectFindings, errors, `${file}: seed report must expect findings`);
    ensure(summary.status !== 'runtime_error' && summary.status !== 'parse_error', errors, `${file}: seed report must not runtime/parse error`);
    ensure(summary.totalFindings > 0, errors, `${file}: seeded report should contain findings`);
    checks.push('gitleaks-seed-ok');
  }

  return {
    name: file,
    status: errors.length > 0 ? 'fail' : 'ok',
    checks,
    errors
  };
};

const validateSeeded = (summary: SeededReport, requireAll = true): ValidationResult => {
  const checks: string[] = [];
  const errors: string[] = [];
  const report = summary.report || {};

  ensure(summary.schemaVersion === '1.0.0', errors, 'security.seeded.report.json: schemaVersion must be 1.0.0');
  ensure(['all', 'sast', 'secrets', 'deps'].includes(summary.mode), errors, 'security.seeded.report.json: invalid mode');
  ensure(Array.isArray(summary.seedPaths), errors, 'security.seeded.report.json: seedPaths must be array');
  ensure(summary.seedFileCount === Object.keys(report).length, errors, 'security.seeded.report.json: seedFileCount mismatch');

  if (requireAll) {
    ensure(!!report.sast, errors, 'security.seeded.report.json: missing sast check');
    ensure(!!report.secrets, errors, 'security.seeded.report.json: missing secrets check');
    ensure(!!report.deps, errors, 'security.seeded.report.json: missing deps check');
  }

  const toCheck = summary.mode === 'all' ? ['sast', 'secrets', 'deps'] : [summary.mode];
  for (const key of toCheck) {
    const entry = report[key];
    if (!entry) {
      errors.push(`security.seeded.report.json: missing required seed report entry "${key}"`);
      continue;
    }
    ensure(parseBoolean(entry.detected), errors, `security.seeded.report.json: seed "${key}" not detected`);
    ensure(Array.isArray(entry.evidence), errors, `security.seeded.report.json: seed "${key}" evidence must be array`);
  }

  checks.push('seeded-report-ok');

  return {
    name: 'security.seeded.report.json',
    status: errors.length > 0 ? 'fail' : 'ok',
    checks,
    errors
  };
};

const parseOptions = (): { options: CliOptions; files: string[] } => {
  const options: CliOptions = {
    strict: toBool('strict', true),
    requireSeeds: toBool('require-seeds', true)
  };

  const explicitOut = toStringArg('out', '');
  if (explicitOut.length > 0) options.out = explicitOut;

  const files: string[] = [
    'ci/baselines/security/semgrep.clean.summary.json',
    'ci/baselines/security/semgrep.seed.summary.json',
    'ci/baselines/security/trivy.deps.clean.summary.json',
    'ci/baselines/security/trivy.deps.seed.summary.json',
    'ci/baselines/security/gitleaks.clean.summary.json',
    'ci/baselines/security/gitleaks.seed.summary.json',
    'ci/baselines/security.seeded.report.json'
  ];

  return { options, files };
};

const run = async () => {
  const { options, files } = parseOptions();
  const checks: ValidationResult[] = [];
  const artifacts: EvidenceFile['artifacts'] = [];
  const missing: string[] = [];
  let failed = false;

  for (const file of files) {
    try {
      if (file.endsWith('semgrep.clean.summary.json')) {
        const summary = await readJson<SemgrepSummary>(file);
        const result = validateSemgrep(file, summary, 'clean');
        checks.push(result);
        if (result.status === 'fail') failed = true;
      } else if (file.endsWith('semgrep.seed.summary.json')) {
        const summary = await readJson<SemgrepSummary>(file);
        const result = validateSemgrep(file, summary, 'seeded');
        checks.push(result);
        if (result.status === 'fail') failed = true;
      } else if (file.endsWith('trivy.deps.clean.summary.json')) {
        const summary = await readJson<TrivySummary>(file);
        const result = validateTrivy(file, summary, 'clean');
        checks.push(result);
        if (result.status === 'fail') failed = true;
      } else if (file.endsWith('trivy.deps.seed.summary.json')) {
        const summary = await readJson<TrivySummary>(file);
        const result = validateTrivy(file, summary, 'seeded');
        checks.push(result);
        if (result.status === 'fail') failed = true;
      } else if (file.endsWith('gitleaks.clean.summary.json')) {
        const summary = await readJson<GitleaksSummary>(file);
        const result = validateGitleaks(file, summary, 'clean');
        checks.push(result);
        if (result.status === 'fail') failed = true;
      } else if (file.endsWith('gitleaks.seed.summary.json')) {
        const summary = await readJson<GitleaksSummary>(file);
        const result = validateGitleaks(file, summary, 'seeded');
        checks.push(result);
        if (result.status === 'fail') failed = true;
      } else {
        const seeded = await readJson<SeededReport>(file);
        const result = validateSeeded(seeded, options.requireSeeds);
        checks.push(result);
        if (result.status === 'fail') failed = true;
      }
      const details = await buildArtifactDigest(file);
      artifacts.push({ file, status: 'ok', ...details, });
    } catch (error) {
      const message = String(error);
      missing.push(`${file}:${message}`);
      checks.push({
        name: file,
        status: options.strict ? 'fail' : 'warn',
        checks: [],
        errors: [message]
      });
      failed = failed || options.strict;
      artifacts.push({ file, status: options.strict ? 'fail' : 'warn', size: 0, digest: `missing:${message.slice(0, 64)}` });
    }
  }

  const status = failed ? 'fail' : 'ok';
  const evidence: EvidenceFile = {
    schemaVersion: '1.0.0',
    generatedAt: new Date().toISOString(),
    strict: options.strict,
    status,
    checks,
    artifacts,
    digest: createHash('sha256')
      .update(JSON.stringify({ generatedAt: new Date().toISOString(), checks: checks.map((entry) => entry.name) }))
      .digest('hex')
  };

  const outputPath = options.out ? options.out : join(root, 'ci', 'baselines', 'security', 'reports.validation.json');
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(evidence, null, 2), 'utf8');

  if (failed && options.strict) {
    throw new Error(`security_report_validation_failed:${checks
      .filter((entry) => entry.status === 'fail')
      .flatMap((entry) => entry.errors)
      .join(' | ')}`);
  }

  if (missing.length > 0) {
    console.log(`Security report validation warnings: ${missing.join(' | ')}`);
  }
};

void run().catch((error) => {
  console.error(String(error));
  process.exit(1);
});
