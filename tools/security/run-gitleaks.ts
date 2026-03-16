import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const root = process.cwd();

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

type GitleaksFinding = {
  File?: string;
  file?: string;
};

type ScanResultStatus = 'clean' | 'warn' | 'fail' | 'runtime_error' | 'parse_error';

type GitleaksTargetScan = {
  target: string;
  findings: number;
  files: string[];
  exitCode: number;
  status: ScanResultStatus;
  reportPath: string;
  reportSize: number;
  reportSha256: string;
};

type GitleaksSummary = {
  scanner: 'gitleaks';
  schemaVersion: string;
  targetScans: GitleaksTargetScan[];
  parseErrors: Array<{ target: string; parseError: string }>;
  targets: string[];
  expectFindings: boolean;
  reportPath: string;
  configPath: string;
  status: ScanResultStatus;
  totalFindings: number;
  runtimeError: boolean;
  targetScansMetadata?: {
    targetsScanned: number;
    targetsClean: number;
    targetsFail: number;
    targetsRuntimeError: number;
    targetsParseError: number;
  };
  byPath?: Record<string, number>;
  byPathTop?: string[];
  targetsScanned?: number;
  uniqueFilesWithFindings?: string[];
  createdAt: string;
  reportSize: number;
  reportSha256: string;
  digest: string;
};

const parseFindings = (payload: unknown): string[] => {
  if (Array.isArray(payload)) {
    return payload.map((entry) => {
      if (entry && typeof entry === 'object') {
        const finding = entry as GitleaksFinding;
        return String(finding.File || finding.file || 'unknown');
      }
      return 'unknown';
    });
  }

  if (payload && typeof payload === 'object' && Array.isArray((payload as { findings?: unknown[] }).findings)) {
    return ((payload as { findings: unknown[] }).findings ?? []).map((entry) => {
      if (entry && typeof entry === 'object') {
        const finding = entry as GitleaksFinding;
        return String(finding.File || finding.file || 'unknown');
      }
      return 'unknown';
    });
  }

  return [];
};

const countPaths = (path: string): string => (path && path.length > 0 ? path : 'unknown');

const run = async () => {
  const targets = toList(getArg('targets', 'services,packages,apps,tools'));
  const configPath = getArg('config', 'tools/security/secrets-scan-config.toml');
  const reportPath = getArg('report', 'ci/baselines/security/gitleaks.clean.report.json');
  const expectFindings = getBoolArg('expect-findings', false);
  const summaryPath = reportPath.replace(/\.json$/, '.summary.json');

  await mkdir(dirname(join(root, reportPath)), { recursive: true });

  const targetScans: GitleaksTargetScan[] = [];
  const parseErrors: Array<{ target: string; parseError: string }> = [];
  const pathCounts = new Map<string, number>();
  let runtimeError = false;
  let totalFindings = 0;
  let totalScannedTargets = 0;

  for (let i = 0; i < targets.length; i += 1) {
    const target = targets[i];
    const partialReport = reportPath.replace(/\.json$/, `.${i}.json`);
    const partialReportInContainer = `/${partialReport}`;

    const args = [
      'run',
      '--rm',
      '-v',
      `${root}:/workspace`,
      '-w',
      '/workspace',
      'zricethezav/gitleaks:latest',
      'detect',
      '--source',
      `/workspace/${target}`,
      '--config',
      `/workspace/${configPath}`,
      '--report-format',
      'json',
      '--report-path',
      partialReportInContainer,
      '--redact',
      '--no-git',
      '--exit-code',
      '1'
    ];

    const exec = spawnSync('docker', args, { stdio: 'inherit' });
    if (exec.error) {
      throw new Error(`gitleaks_runtime_error:${String(exec.error)}`);
    }

    const exitCode = exec.status ?? 1;
    let parseError: string | null = null;
    if (exitCode > 1) {
      runtimeError = true;
    }

    let files: string[] = [];
    try {
      const parsed = JSON.parse(await readFile(join(root, partialReport), 'utf8')) as unknown;
      files = parseFindings(parsed);
    } catch (error) {
      parseError = String(error);
      parseErrors.push({ target, parseError: String(error) });
      runtimeError = true;
    }

    let reportBytes = Buffer.from('');
    try {
      reportBytes = await readFile(join(root, partialReport));
    } catch (error) {
      const message = `${parseError ? `${parseError} | ` : ''}${String(error)}`;
      parseError = message;
      parseErrors.push({ target, parseError: message });
      runtimeError = true;
      reportBytes = Buffer.from('');
    }

    const uniqueFiles = [...new Set(files.map((value) => countPaths(value)))];
    for (const value of uniqueFiles) {
      pathCounts.set(value, (pathCounts.get(value) || 0) + 1);
    }

    const findings = files.length;
    const status: ScanResultStatus = parseError
      ? 'parse_error'
      : exitCode === 0
        ? (findings === 0 ? 'clean' : 'fail')
        : exitCode === 1
          ? 'fail'
          : 'runtime_error';

    totalFindings += findings;
    totalScannedTargets += 1;
    targetScans.push({
      target,
      findings,
      files: uniqueFiles,
      exitCode,
      status,
      reportPath: partialReport,
      reportSize: reportBytes.length,
      reportSha256: createHash('sha256').update(reportBytes).digest('hex')
    });
  }

  const byPath: Record<string, number> = {};
  for (const [path, count] of pathCounts.entries()) {
    byPath[path] = count;
  }
  const byPathTop = Object.entries(byPath)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 10)
    .map(([path, count]) => `${path}:${count}`);

  const cleanTargets = targetScans.filter((scan) => scan.status === 'clean').length;
  const failTargets = targetScans.filter((scan) => scan.status === 'fail' || scan.status === 'warn').length;
  const runtimeTargets = targetScans.filter((scan) => scan.status === 'runtime_error').length;
  const parseTargets = targetScans.filter((scan) => scan.status === 'parse_error').length;

  const overallStatus: ScanResultStatus = parseErrors.length > 0
    ? 'parse_error'
    : runtimeError
      ? 'runtime_error'
      : totalFindings === 0
        ? 'clean'
        : totalFindings < 5
          ? 'warn'
          : 'fail';

  const basePayload = {
    scanner: 'gitleaks',
    schemaVersion: '1.0.0',
    targets,
    configPath,
    reportPath,
    expectFindings,
    targetScans,
    parseErrors,
    totalFindings,
    byPath,
    byPathTop,
    status: overallStatus,
    runtimeError,
    targetsScanned: totalScannedTargets,
    targetsClean: cleanTargets,
    targetsFail: failTargets,
    targetsRuntimeError: runtimeTargets,
    targetsParseError: parseTargets,
    uniqueFilesWithFindings: Array.from(pathCounts.keys()),
    createdAt: new Date().toISOString(),
    reportSize: 0,
    reportSha256: '',
    digest: createHash('sha256')
      .update(JSON.stringify({ targets, configPath, targetScans, expectFindings, totalFindings }))
      .digest('hex')
  };

  let payloadText = JSON.stringify(basePayload, null, 2);
  basePayload.reportSize = Buffer.byteLength(payloadText);
  basePayload.reportSha256 = createHash('sha256').update(payloadText).digest('hex');
  const payload = {
    ...basePayload,
    reportSize: Buffer.byteLength(payloadText),
    reportSha256: basePayload.reportSha256
  };
  payloadText = JSON.stringify(payload, null, 2);
  await writeFile(join(root, summaryPath), payloadText, 'utf8');
  await writeFile(join(root, reportPath), payloadText, 'utf8');

  if (parseErrors.length > 0) {
    throw new Error(`gitleaks_report_parse_errors=${parseErrors.map((entry) => `${entry.target}:${entry.parseError}`).join(' | ')}`);
  }

  if (runtimeError) {
    throw new Error('gitleaks_scan_runtime_error');
  }

  if (expectFindings) {
    if (totalFindings <= 0 || overallStatus === 'runtime_error' || overallStatus === 'parse_error') {
      throw new Error(`gitleaks_expected_findings_missing: findings=${totalFindings} status=${overallStatus}`);
    }
    console.log(`Gitleaks seeded check passed with ${totalFindings} finding(s).`);
    return;
  }

  if (totalFindings > 0) {
    throw new Error(`gitleaks_clean_scan_failed: findings=${totalFindings}`);
  }

  console.log('Gitleaks clean scan passed.');
};

void run().catch((error) => {
  console.error(String(error));
  process.exit(1);
});
