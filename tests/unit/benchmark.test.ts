import { describe, it, expect } from 'vitest';
import { loadFlightNetwork } from '@/engine/load';
import { simulate } from '@/engine/simulate';
import { runVulnerabilitySweep } from '@/engine/sweep';

describe('Performance Benchmarks', () => {
  const network = loadFlightNetwork();

  it('single simulate() execution executes in < 10ms', () => {
    const scenario = {
      closures: [{ id: 'C_BLR', airport: 'BLR', start: 360, end: 510 }],
      actions: [{ type: 'SWAP_SPARE' as const, flightId: 'DS0603', spareTail: 'VT-DS17' }]
    };

    // Warm-up
    simulate(network, scenario);

    const RUNS = 100;
    const start = performance.now();
    for (let i = 0; i < RUNS; i++) {
      simulate(network, scenario);
    }
    const end = performance.now();
    const avgMs = (end - start) / RUNS;

    console.log(`Average single simulate() latency: ${avgMs.toFixed(3)} ms`);
    expect(avgMs).toBeLessThan(10);
  });

  it('vulnerability sweep (1,488 simulations) executes in < 5 seconds', () => {
    const sweepStart = performance.now();
    const result = runVulnerabilitySweep(network, {
      durations: [60, 90, 120],
      stepMin: 30,
      windowStart: 300,
      windowEnd: 1200
    });
    const sweepEnd = performance.now();
    const totalMs = sweepEnd - sweepStart;

    console.log(`Full vulnerability sweep (1,488 simulations) elapsed: ${totalMs.toFixed(1)} ms`);
    expect(result.totalScenariosEvaluated).toBe(1488);
    expect(totalMs).toBeLessThan(5000);
  });
});
