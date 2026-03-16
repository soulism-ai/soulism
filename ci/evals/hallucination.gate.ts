import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

type HallucinationDataset = {
  schemaVersion: string;
  threshold: number;
  minSamples: number;
  samples: Array<{ id: string; output: string; grounded: boolean }>;
};

const run = async () => {
  const datasetPath = join(process.cwd(), 'ci', 'evals', 'datasets', 'hallucination.samples.json');
  const dataset = JSON.parse(await readFile(datasetPath, 'utf8')) as HallucinationDataset;
  const samples = dataset.samples || [];

  const total = samples.length;
  const failures = samples.filter((x) => !x.grounded).length;
  const rate = total === 0 ? 0 : failures / total;
  const threshold = dataset.threshold;
  const minSamples = dataset.minSamples;
  const datasetDigest = `sha256:${createHash('sha256').update(JSON.stringify(dataset)).digest('hex')}`;

  const enoughSamples = total >= minSamples;
  const passed = enoughSamples && rate <= threshold;

  const report = {
    gate: 'hallucination',
    schemaVersion: dataset.schemaVersion,
    datasetPath,
    datasetDigest,
    total,
    failures,
    failureRate: rate,
    minSamples,
    enoughSamples,
    threshold,
    passed,
    createdAt: new Date().toISOString()
  };

  const out = join(process.cwd(), 'ci', 'baselines', 'evals', 'hallucination.report.json');
  await writeFile(out, JSON.stringify(report, null, 2));

  if (!passed) {
    console.error(`Hallucination gate failed: rate=${rate}, threshold=${threshold}, samples=${total}, minSamples=${minSamples}`);
    process.exit(1);
  }

  console.log(`Hallucination gate passed: rate=${rate}`);
};

void run();
