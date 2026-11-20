import { describe, it, expect } from 'vitest';
import { loadFlightNetwork } from '@/engine/load';
import { simulate } from '@/engine/simulate';
import { recommendRecoveryPlans } from '@/engine/candidates';
import { runVulnerabilitySweep } from '@/engine/sweep';
import { parseTimeToMinutes } from '@/engine/time';

describe('Recovery Optimiser & Vulnerability Sweep', () => {
  const network = loadFlightNetwork();

  it('optimiser discovers spare swap plan for G1 and improves score', () => {
    const start = parseTimeToMinutes('06:00');
    const end = parseTimeToMinutes('08:30');
    const scenario = { closures: [{ id: 'C_BLR', airport: 'BLR', start, end }] };

    const { rankedPlans } = recommendRecoveryPlans(network, scenario, 2);

    expect(rankedPlans.length).toBeGreaterThan(0);
    const topPlan = rankedPlans[0];

    // Score must be strictly improved
    expect(topPlan.deltas.totalArrDelayMin).toBeLessThan(0);
    expect(topPlan.deltas.crewBreaches).toBeLessThanOrEqual(0);

    // Verify afterMetrics match an independent re-simulation
    const reSim = simulate(network, { ...scenario, actions: topPlan.actions });
    expect(reSim.metrics.totalArrDelayMin).toBe(topPlan.afterMetrics.totalArrDelayMin);
    expect(reSim.metrics.strandedPaxTotal).toBe(topPlan.afterMetrics.strandedPaxTotal);
    expect(reSim.metrics.crewBreaches).toBe(topPlan.afterMetrics.crewBreaches);
    expect(reSim.metrics.cancelledFlights).toBe(topPlan.afterMetrics.cancelledFlights);
  });

  it('runs full vulnerability sweep across 16 airports and finishes under 5 seconds', () => {
    const sweep = runVulnerabilitySweep(network, {
      durations: [60, 90, 120],
      stepMin: 30,
      windowStart: 300,
      windowEnd: 1200
    });

    // 16 airports * 3 durations * 31 intervals = 1488 scenarios
    expect(sweep.totalScenariosEvaluated).toBe(16 * 3 * 31);
    expect(sweep.heatmap.length).toBe(1488);
    expect(sweep.mostDamagingClosures.length).toBe(20);

    // Verify performance requirement: < 5000 ms
    expect(sweep.elapsedMs).toBeLessThan(5000);
  });
});
