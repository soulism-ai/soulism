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

type TrivyResult = {
  Vulnerabilities?: unknown[];
  Secrets?: unknown[];
  Misconfigurations?: unknown[];
};

type ScanResultStatus = 'clean' | 'warn' | 'fail' | 'runtime_error' | 'parse_error';

type TargetScan = {
  target: string;
  findings: number;
  vulnerabilities: number;
  secrets: number;
  misconfigurations: number;
  exitCode: number;
  reportPath: string;
  status: ScanResultStatus;
  reportSize: number;
  reportSha256: string;
  parseError: string | null;
};

const targetLabel = (findings: number): ScanResultStatus => {
  if (findings === 0) return 'clean';
  if (findings < 5) return 'warn';
  return 'fail';
};

const extractCounts = (payload: unknown): { vulnerabilities: number; secrets: number; misconfigurations: number; findings: number } => {
  const parsed = payload as { Results?: TrivyResult[] };
  if (!Array.isArray(parsed.Results)) {
    return { vulnerabilities: 0, secrets: 0, misconfigurations: 0, findings: 0 };
  }

  return parsed.Results.reduce(
    (acc, result) => {
      const vulnerabilities = Array.isArray(result.Vulnerabilities) ? result.Vulnerabilities.length : 0;
      const secrets = Array.isArray(result.Secrets) ? result.Secrets.length : 0;
      const misconfigurations = Array.isArray(result.Misconfigurations) ? result.Misconfigurations.length : 0;
      acc.vulnerabilities += vulnerabilities;
      acc.secrets += secrets;
      acc.misconfigurations += misconfigurations;
      acc.findings += vulnerabilities + secrets + misconfigurations;
      return acc;
    },
    { vulnerabilities: 0, secrets: 0, misconfigurations: 0, findings: 0 }
  );
};

const digestSha256 = (input: string | Buffer): string => createHash('sha256').update(input).digest('hex');

const run = async () => {
  const targets = toList(getArg('targets', 'services,packages,apps'));
  const scanners = toList(getArg('scanners', 'vuln'));
  const severity = getArg('severity', 'HIGH,CRITICAL');
  const configPath = getArg('config', 'tools/security/trivy.yml');
  const reportPath = getArg('report', 'ci/baselines/security/trivy.clean.report.json');
  const summaryPath = reportPath.replace(/\.json$/, '.summary.json');
  const expectFindings = getBoolArg('expect-findings', false);

  await mkdir(dirname(join(root, reportPath)), { recursive: true });

  const targetScans: TargetScan[] = [];
  let totalFindings = 0;
  let runtimeError = false;
  const parseErrors: Array<{ target: string; parseError: string }> = [];

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
      'aquasec/trivy:latest',
      'fs',
      '--quiet',
      '--config',
      `/workspace/${configPath}`,
      '--scanners',
      scanners.join(','),
      '--severity',
      severity,
      '--ignore-unfixed=false',
      '--format',
      'json',
      '--output',
      partialReportInContainer,
      '--exit-code',
      '1',
      target
    ];

    const exec = spawnSync('docker', args, { stdio: 'inherit' });
    if (exec.error) {
      throw new Error(`trivy_runtime_error:${String(exec.error)}`);
    }

    const exitCode = exec.status ?? 1;
    let vulnerabilities = 0;
    let secrets = 0;
    let misconfigurations = 0;
    let findings = 0;
    let parseError: string | null = null;

    try {
      const parsed = JSON.parse(await readFile(join(root, partialReport), 'utf8'));
      const counts = extractCounts(parsed);
      vulnerabilities = counts.vulnerabilities;
      secrets = counts.secrets;
      misconfigurations = counts.misconfigurations;
      findings = counts.findings;
    } catch (error) {
      parseError = String(error);
      parseErrors.push({ target, parseError });
      runtimeError = true;
    }

    let reportBytes: Buffer;
    try {
      reportBytes = await readFile(join(root, partialReport));
    } catch (error) {
      parseError = `${parseError ? `${parseError} | ` : ''}${String(error)}`;
      parseErrors.push({ target, parseError: String(error) });
      runtimeError = true;
      reportBytes = Buffer.from('');
    }

    let status: ScanResultStatus = targetLabel(findings);
    if (parseError) {
      status = 'parse_error';
    } else if (exitCode > 1) {
      status = 'runtime_error';
      runtimeError = true;
    }

    totalFindings += findings;
    targetScans.push({
      target,
      findings,
      vulnerabilities,
      secrets,
      misconfigurations,
      exitCode,
      reportPath: partialReport,
      status,
      reportSize: reportBytes.length,
      reportSha256: digestSha256(reportBytes),
      parseError
    });
  }

  const totalVulnerabilities = targetScans.reduce((acc, scan) => acc + scan.vulnerabilities, 0);
  const totalSecrets = targetScans.reduce((acc, scan) => acc + scan.secrets, 0);
  const totalMisconfigurations = targetScans.reduce((acc, scan) => acc + scan.misconfigurations, 0);

  const cleanTargets = targetScans.filter((scan) => scan.status === 'clean').length;
  const warnTargets = targetScans.filter((scan) => scan.status === 'warn').length;
  const failTargets = targetScans.filter((scan) => scan.status === 'fail').length;
  const runtimeTargets = targetScans.filter((scan) => scan.status === 'runtime_error').length;
  const parseTargets = targetScans.filter((scan) => scan.status === 'parse_error').length;

  const overallStatus: 'clean' | 'warn' | 'fail' | 'runtime_error' = runtimeError
    ? 'runtime_error'
    : totalFindings === 0
      ? 'clean'
      : totalFindings < 5
        ? 'warn'
        : 'fail';

  const baseSummary = {
    scanner: 'trivy',
    schemaVersion: '1.0.0',
    expectFindings,
    targets,
    scanners,
    severity,
    configPath,
    reportPath,
    targetScans,
    parseErrors,
    totalFindings,
    runtimeError,
    totalVulnerabilities,
    totalSecrets,
    totalMisconfigurations,
    targetsScanned: targetScans.length,
    targetsClean: cleanTargets,
    targetsWarn: warnTargets,
    targetsFail: failTargets,
    targetsRuntimeError: runtimeTargets,
    targetsParseError: parseTargets,
    scanSummary: targetScans.map((scan) => `${scan.target}:${scan.findings}:${scan.status}`),
    digest: digestSha256(JSON.stringify({ targets: targetScans, configPath, scanners, severity, expectFindings })),
    createdAt: new Date().toISOString()
  };

  const ciSummary = {
    ...baseSummary,
    status: overallStatus,
    artifactPath: reportPath,
    artifactSummaryPath: summaryPath,
    reportSize: 0
  };

  await writeFile(join(root, reportPath), JSON.stringify(baseSummary, null, 2), 'utf8');
  const ciSummaryText = JSON.stringify(ciSummary, null, 2);
  const finalSize = Buffer.byteLength(ciSummaryText);
  const ciSummaryWithSize = { ...ciSummary, reportSize: finalSize };
  const finalSummaryText = JSON.stringify(ciSummaryWithSize, null, 2);
  await writeFile(join(root, summaryPath), finalSummaryText, 'utf8');

  if (parseErrors.length > 0) {
    throw new Error(`trivy_report_parse_errors=${parseErrors.map((entry) => `${entry.target}:${entry.parseError}`).join(' | ')}`);
  }

  if (runtimeError) {
    throw new Error(`trivy_scan_runtime_error: overallStatus=${overallStatus}`);
  }

  if (expectFindings) {
    if (totalFindings <= 0) {
      throw new Error(`trivy_expected_findings_missing: findings=${totalFindings}`);
    }
    console.log(`Trivy seeded check passed with ${totalFindings} finding(s).`);
    return;
  }

  if (totalFindings > 0) {
    throw new Error(`trivy_clean_scan_failed: findings=${totalFindings}`);
  }

  console.log('Trivy clean scan passed.');
};

void run().catch((error) => {
  console.error(String(error));
  process.exit(1);
});
