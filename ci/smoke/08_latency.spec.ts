import { describe, expect, it } from 'vitest';
import { loadRoute, startRouteServer } from './helpers.js';

describe('smoke: latency baseline', () => {
  it('keeps p95 health latency under threshold', async () => {
    const route = await loadRoute('../../services/trust-safety/policy-gate-service/src/routes.ts');
    const running = await startRouteServer(route);

    const samples: number[] = [];
    for (let i = 0; i < 50; i += 1) {
      const start = performance.now();
      const response = await fetch(`${running.url}/health`);
      expect(response.status).toBe(200);
      samples.push(performance.now() - start);
    }

    const sorted = [...samples].sort((a, b) => a - b);
    const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
    expect(p95).toBeLessThan(250);

    await running.close();
  });
});
