import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

type Mode = 'all' | 'sast' | 'secrets' | 'deps';

const root = process.cwd();
const validModes: readonly Mode[] = ['all', 'sast', 'secrets', 'deps'];
const modeArg = process.argv.find((arg) => arg.startsWith('--mode='))?.split('=')[1] || 'all';
if (!validModes.includes(modeArg as Mode)) {
  throw new Error(`invalid mode: ${modeArg}. valid: ${validModes.join(', ')}`);
}
const mode: Mode = modeArg as Mode;

type SeedReport = {
  detected: boolean;
  message: string;
  evidence?: string[];
  detailHints?: string[];
  details?: {
    path: string;
    bytes: number;
    sha256: string;
    modifiedAt: string;
  }[];
};

type SeedCheckSpec = {
  id: string;
  checks: Array<{
    id: string;
    label: string;
    patterns: RegExp[];
  }>;
  path: string;
};

type VerifiedSeedEvidence = {
  check: string;
  detected: boolean;
  message: string;
  evidence: string[];
  detailHints?: string[];
};

type SeedSpec = {
  path: string;
  checks: Array<{
    id: string;
    patterns: RegExp[];
    flags?: string;
    label: string;
  }>;
};

type SeedTargets = {
  sast: string;
  secrets: string;
  deps: string;
};

const seededPaths = {
  sast: join(root, 'ci/security/seeds/sast/unsafe-child-process.ts'),
  secrets: join(root, 'ci/security/seeds/secrets/hardcoded-secret.ts'),
  deps: join(root, 'ci/security/seeds/deps/package.json')
} as const satisfies SeedTargets;

const sha256 = (value: string | Buffer): string => `sha256:${createHash('sha256').update(value).digest('hex')}`;

const withSha = async (path: string) => {
  const content = await readFile(path);
  const info = await stat(path);
  return {
    path,
    bytes: content.length,
    sha256: sha256(content),
    modifiedAt: info.mtime.toISOString()
  };
};

const verifyFileExists = async (path: string): Promise<SeedReport> => {
  try {
    const info = await stat(path);
    if (!info.isFile()) {
      return { detected: false, message: 'path exists but is not a file' };
    }
    if (info.size <= 0) {
      return { detected: false, message: 'seed file is empty' };
    }
    return {
      detected: true,
      message: 'seed file present',
      details: [await withSha(path)]
    };
  } catch {
    return { detected: false, message: `seed file missing: ${path}` };
  }
};

const matchAllChecks = (raw: string, spec: SeedCheckSpec): VerifiedSeedEvidence => {
  const missing: string[] = [];
  const evidence: string[] = [];

  for (const check of spec.checks) {
    const passed = check.patterns.every((pattern) => pattern.test(raw));
    if (passed) {
      evidence.push(check.id);
      continue;
    }
    missing.push(check.label);
  }

  return {
    check: spec.id,
    detected: missing.length === 0,
    message:
      missing.length === 0
        ? `detected expected pattern set (${spec.checks.length}/${spec.checks.length})`
        : `missing required signal(s): ${missing.join(', ')}`,
    evidence,
    detailHints: missing
  };
};

const checkPatternMatches = async (spec: SeedSpec): Promise<SeedReport> => {
  const exists = await verifyFileExists(spec.path);
  if (!exists.detected) {
    return exists;
  }

  const raw = await readFile(spec.path, 'utf8');
  const evidence = matchAllChecks(raw, {
    id: 'seed-file',
    path: spec.path,
    checks: spec.checks
  });

  return {
    detected: evidence.detected,
    message: evidence.message,
    evidence: evidence.evidence,
    detailHints: evidence.detailHints,
    details: exists.details
  };
};

const isVulnerableVersion = (pkg: string, version: string): boolean => {
  const normalized = version.replace(/^[~^]/, '');
  if (pkg === 'minimist') {
    return /^0\./.test(normalized) || normalized === '1.2.0' || normalized === '1.2.1' || normalized === '1.2.2' || normalized === '1.2.3' || normalized === '1.2.4' || normalized === '1.2.5';
  }
  if (pkg === 'lodash') {
    return /^(0|1|2|3)\./.test(normalized) || /^4\.(0|1|2|3|4|5|6|7|8|9|10|11|12|13|14|15|16|17)\./.test(normalized) || normalized === '4.17.20';
  }
  return false;
};

const verifyDependencySeed = async (): Promise<SeedReport> => {
  const exists = await verifyFileExists(seededPaths.deps);
  if (!exists.detected) return exists;

  const json = JSON.parse(await readFile(seededPaths.deps, 'utf8')) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };

  const merged = { ...(json.dependencies || {}), ...(json.devDependencies || {}) };
  const found = Object.entries(merged).find(([name, version]) => isVulnerableVersion(name, String(version)));

  if (!found) {
    return {
      detected: false,
      message: 'dependency seed does not include a known vulnerable version',
      evidence: [],
      details: exists.details
    };
  }

  return {
    detected: true,
    message: `detected vulnerable dependency seed: ${found[0]}@${found[1]}`,
    evidence: [`${found[0]}:${found[1]}`],
    detailHints: [`version_match:${found[0]}:${found[1]}`],
    details: exists.details
  };
};

const SAST_SPEC: SeedSpec = {
  path: seededPaths.sast,
  checks: [
    {
      id: 'child_process-import',
      label: 'node child_process import',
      patterns: [
        /from\s+['"]node:child_process['"]/i,
        /require\s*\(\s*['"]child_process['"]\s*\)/i,
        /require\s*\(\s*['"]node:child_process['"]\s*\)/i
      ]
    },
    {
      id: 'child_process-exec-or-spawn',
      label: 'unsafe child_process execution',
      patterns: [/child_process\.(exec|execSync|spawn|spawnSync)\s*\(/i]
    }
  ]
};

const SECRET_SPEC: SeedSpec = {
  path: seededPaths.secrets,
  checks: [
    {
      id: 'hardcoded-key-token',
      label: 'hardcoded key-like credential',
      patterns: [/(api[_-]?key|service[_-]?token|secret[_-]?key|bearer[_-]?token|client[_-]?secret)\s*[:=]\s*['"][A-Za-z0-9_\-]{16,}['"]/i]
    },
    {
      id: 'hardcoded-value-literal',
      label: 'multiple secret-style literals',
      patterns: [/(service[_-]?token|api[_-]?key|session[_-]?token)\s*[:=]\s*['"][A-Za-z0-9_\-]{16,}['"]/i]
    }
  ]
};

type SeedCheck = { id: Exclude<Mode, 'all'>; execute: () => Promise<SeedReport> };
const checks: Array<SeedCheck> = [
  { id: 'sast', execute: () => checkPatternMatches(SAST_SPEC) },
  { id: 'secrets', execute: () => checkPatternMatches(SECRET_SPEC) },
  { id: 'deps', execute: verifyDependencySeed }
];

const run = async () => {
  await mkdir(dirname(join(root, 'ci/baselines')), { recursive: true });
  const selected = mode === 'all' ? checks : checks.filter((check) => check.id === mode);
  const report: Record<string, SeedReport> = {};
  const failures: string[] = [];

  for (const check of selected) {
    const result = await check.execute();
    report[check.id] = result;
    if (!result.detected) {
      failures.push(`${check.id}: ${result.message}`);
    }
  }

  const payload = {
    schemaVersion: '1.0.0',
    reportVersion: 1,
    createdAt: new Date().toISOString(),
    mode,
    seedFileCount: selected.length,
    seedPaths: Object.values(seededPaths),
    report
  };
  const digest = sha256(JSON.stringify(payload));
  const output = {
    ...payload,
    digest
  };

  const outPath = join(root, 'ci/baselines/security.seeded.report.json');
  await writeFile(outPath, JSON.stringify(output, null, 2), 'utf8');

  if (failures.length > 0) {
    console.error('Seeded violation verification failed:');
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log(`Seeded violation verification passed (${mode})`);
};

void run();
