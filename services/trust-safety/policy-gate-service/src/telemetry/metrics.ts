export interface MetricSample {
  name: string;
  value: number;
  unit?: string;
  labels?: Record<string, string>;
  timestamp: string;
}

const records: MetricSample[] = [];

export const emitMetric = (
  name: string,
  value: number,
  options?: { unit?: string; labels?: Record<string, string> }
): MetricSample => {
  const sample: MetricSample = {
    name,
    value,
    unit: options?.unit,
    labels: options?.labels,
    timestamp: new Date().toISOString()
  };
  records.push(sample);
  return sample;
};

export const listMetrics = (): MetricSample[] => [...records];
