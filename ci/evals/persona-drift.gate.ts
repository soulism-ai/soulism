import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { sha256Hex } from '../../packages/shared/src/crypto.js';
import { stableStringify } from '../../packages/shared/src/json.js';
import { validatePersonaManifest } from '../../packages/persona-schema/src/validate.js';

type DriftDataset = {
  schemaVersion: string;
  minCases: number;
  cases: Array<{
    id: string;
    manifest: unknown;
  }>;
};

type DriftBaseline = {
  schemaVersion: string;
  minStableRate: number;
  expectedCaseIds: string[];
  expectedCaseFingerprints?: Record<string, string>;
};

const run = async () => {
  const datasetPath = join(process.cwd(), 'ci', 'evals', 'datasets', 'persona-drift.manifests.json');
  const baselinePath = join(process.cwd(), 'ci', 'evals', 'datasets', 'persona-drift.baseline.json');
  const dataset = JSON.parse(await readFile(datasetPath, 'utf8')) as DriftDataset;
  const baseline = JSON.parse(await readFile(baselinePath, 'utf8')) as DriftBaseline;

  const minCases = dataset.minCases;
  if (dataset.cases.length < minCases) {
    console.error(`Persona drift gate failed: insufficient cases (${dataset.cases.length}/${minCases}).`);
    process.exit(1);
  }

  const actualIds = dataset.cases.map((c) => c.id).sort();
  const expectedIds = [...baseline.expectedCaseIds].sort();
  const idsMatch = JSON.stringify(actualIds) === JSON.stringify(expectedIds);
  const expectedFingerprints = baseline.expectedCaseFingerprints || {};

  const caseResults = dataset.cases.map((entry) => {
    const manifest = validatePersonaManifest(entry.manifest);
    const manifestHash = sha256Hex(stableStringify(manifest));
    const manifestHashRepeat = sha256Hex(stableStringify(JSON.parse(JSON.stringify(manifest))));
    const expectedHash = expectedFingerprints[entry.id];
    const expectedMatch = expectedHash ? manifestHash === expectedHash : true;
    const deterministic = manifestHash === manifestHashRepeat;
    return {
      id: entry.id,
      hash: manifestHash,
      expectedHash,
      deterministic,
      matchesBaseline: expectedMatch,
      stable: deterministic && expectedMatch
    };
  });

  const stableCount = caseResults.filter((c) => c.stable).length;
  const stableRate = caseResults.length === 0 ? 0 : stableCount / caseResults.length;
  const minStableRate = baseline.minStableRate;
  const passed = idsMatch && stableRate >= minStableRate;

  const datasetDigest = `sha256:${createHash('sha256').update(JSON.stringify(dataset)).digest('hex')}`;
  const baselineDigest = `sha256:${createHash('sha256').update(JSON.stringify(baseline)).digest('hex')}`;

  const report = {
    gate: 'persona-drift',
    schemaVersion: dataset.schemaVersion,
    datasetPath,
    baselinePath,
    datasetDigest,
    baselineDigest,
    idsMatch,
    minStableRate,
    stableRate,
    stableCount,
    total: caseResults.length,
    cases: caseResults,
    passed,
    createdAt: new Date().toISOString()
  };

  await writeFile(join(process.cwd(), 'ci', 'baselines', 'evals', 'persona-drift.report.json'), JSON.stringify(report, null, 2), 'utf8');

  if (!passed) {
    console.error(`Persona drift gate failed: idsMatch=${idsMatch}, stableRate=${stableRate}, minStableRate=${minStableRate}`);
    process.exit(1);
  }

  console.log(`Persona drift gate passed: stableRate=${stableRate}`);
};

void run();
