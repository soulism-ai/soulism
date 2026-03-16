import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const root = process.cwd();

type SemgrepFinding = {
  check_id?: string;
  path?: string;
  extra?: {
    severity?: string;
  };
};

type SemgrepReport = {
  results?: SemgrepFinding[];
  errors?: unknown[];
};

type ScanSummary = {
  scanner: 'semgrep';
  schemaVersion: '1.0.0';
  status: 'clean' | 'findings' | 'runtime_error';
  findings: number;
  expectFindings: boolean;
  exitCode: number;
  targets: string[];
  configPath: string;
  reportPath: string;
  reportSize: number;
  reportSha256: string;
  bySeverity: Record<string, number>;
  byRule: Record<string, number>;
  byPath: Record<string, number>;
  topSeverities: string[];
  parseError: string | null;
  createdAt: string;
  digest: string;
};

const getArg = (name: string, fallback: string): string => {
  const match = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  return match ? match.split('=').slice(1).join('=') : fallback;
};

const getBoolArg = (name: string, fallback: boolean): boolean => {
  const value = getArg(name, fallback ? 'true' : 'false').toLowerCase();
  return value === 'true';
};

const toList = (value: string): string[] =>
  value
    .split(',')
    .map((x) => x.trim())
    .filter((x) => x.length > 0);

const summarizeFindings = (results: SemgrepFinding[]) => {
  const bySeverity = new Map<string, number>();
  const byRule = new Map<string, number>();
  const byPath = new Map<string, number>();

  for (const finding of results) {
    const severity = String(finding?.extra?.severity || 'unknown').toLowerCase();
    const rule = String(finding?.check_id || 'unknown');
    const filePath = String(finding?.path || 'unknown');
    bySeverity.set(severity, (bySeverity.get(severity) || 0) + 1);
    byRule.set(rule, (byRule.get(rule) || 0) + 1);
    byPath.set(filePath, (byPath.get(filePath) || 0) + 1);
  }

  return {
    bySeverity: Object.fromEntries(bySeverity),
    byRule: Object.fromEntries(byRule),
    byPath: Object.fromEntries(byPath)
  };
};

const extractTopSeverities = (bySeverity: Record<string, number>, findings: number, max = 5): string[] => {
  return Object.entries(bySeverity)
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([severity, count]) => `${severity}:${count}`)
    .concat(`total:${findings}`);
};

const run = async () => {
  const targets = toList(getArg('targets', 'services,packages,apps,tools'));
  const configPath = getArg('config', 'tools/security/semgrep.yml');
  const reportPath = getArg('report', 'ci/baselines/security/semgrep.report.json');
  const expectFindings = getBoolArg('expect-findings', false);
  const summaryPath = reportPath.replace(/\.json$/, '.summary.json');

  await mkdir(dirname(join(root, reportPath)), { recursive: true });

  const args = [
    'run',
    '--rm',
    '-v',
    `${root}:/workspace`,
    '-w',
    '/workspace',
    'returntocorp/semgrep:latest',
    'semgrep',
    '--config',
    configPath,
    '--json',
    '--output',
    `/workspace/${reportPath}`,
    '--error',
    ...targets
  ];

  const exec = spawnSync('docker', args, { stdio: 'inherit' });
  if (exec.error) {
    throw new Error(`semgrep_runtime_error:${String(exec.error)}`);
  }

  const exitCode = exec.status ?? 1;
  let findings = 0;
  let parseError: string | undefined;
  const bySeverity: Record<string, number> = {};
  const byRule: Record<string, number> = {};
  const byPath: Record<string, number> = {};

  try {
    const rawReport = await readFile(join(root, reportPath), 'utf8');
    const parsed = JSON.parse(rawReport) as SemgrepReport;
    const results = Array.isArray(parsed.results) ? parsed.results : [];
    const summary = summarizeFindings(results);
    findings = results.length;
    Object.assign(bySeverity, summary.bySeverity);
    Object.assign(byRule, summary.byRule);
    Object.assign(byPath, summary.byPath);
    if (Array.isArray(parsed.errors) && parsed.errors.length > 0) {
      parseError = `semgrep runtime reported errors: ${JSON.stringify(parsed.errors).slice(0, 512)}`;
    }
  } catch (error) {
    parseError = String(error);
  }

  const rawReport = await readFile(join(root, reportPath), 'utf8').catch(() => '');
  const reportSize = rawReport.length;
  const reportSha256 = createHash('sha256').update(rawReport).digest('hex');

  const summary: ScanSummary = {
    scanner: 'semgrep',
    schemaVersion: '1.0.0',
    status: exitCode === 0 ? 'clean' : exitCode === 1 ? 'findings' : 'runtime_error',
    findings,
    expectFindings,
    exitCode,
    targets,
    configPath,
    reportPath,
    reportSize,
    reportSha256,
    bySeverity,
    byRule,
    byPath,
    topSeverities: extractTopSeverities(bySeverity, findings),
    parseError: parseError || null,
    createdAt: new Date().toISOString(),
    digest: createHash('sha256')
      .update(JSON.stringify({ findings, bySeverity, byRule, byPath, configPath, targets }))
      .digest('hex')
  };

  await writeFile(join(root, summaryPath), JSON.stringify(summary, null, 2), 'utf8');

  if (parseError) {
    throw new Error(`semgrep_report_parse_error:${parseError}`);
  }

  if (expectFindings) {
    if (findings <= 0 || exitCode === 0) {
      throw new Error(`semgrep_expected_findings_missing: findings=${findings} exit=${exitCode}`);
    }
    if (exitCode > 1) {
      throw new Error(`semgrep_seeded_scan_had_runtime_error: findings=${findings} exit=${exitCode}`);
    }
    console.log(`Semgrep seeded check passed with ${findings} finding(s).`);
    return;
  }

  if (exitCode !== 0 || findings > 0) {
    throw new Error(`semgrep_clean_scan_failed: findings=${findings} exit=${exitCode}`);
  }

  console.log('Semgrep clean scan passed.');
};

void run().catch((error) => {
  console.error(String(error));
  process.exit(1);
});
