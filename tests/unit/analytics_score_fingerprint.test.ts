import { describe, it, expect } from 'vitest';
import { loadFlightNetwork } from '../../src/engine/load';
import { calculateScore } from '../../src/engine/score';
import { hashScenario, canonicalizeScenario } from '../../src/engine/fingerprint';
import { computeBaselineSlackReport, diffResults } from '../../src/engine/analytics';
import { simulate } from '../../src/engine/simulate';
import { Metrics } from '../../src/engine/types';

describe('Analytics, Scoring & Fingerprint Unit Tests', () => {
  const network = loadFlightNetwork();

  it('computes baseline slack report accurately across all tails and crews', () => {
    const report = computeBaselineSlackReport(network);

    expect(report.turnaroundSlack.length).toBeGreaterThan(0);
    expect(report.crewSlack.length).toBe(16); // 16 active crews
    expect(Array.isArray(report.mostFragileTails)).toBe(true);
    expect(Array.isArray(report.mostFragileCrews)).toBe(true);

    // Verify turnaround slack properties
    for (const slack of report.turnaroundSlack) {
      expect(slack.turnaroundScheduledMin).toBeGreaterThanOrEqual(slack.minTurnaroundMin);
      expect(slack.slackMin).toBe(slack.turnaroundScheduledMin - slack.minTurnaroundMin);
      expect(slack.fragile).toBe(slack.slackMin === 0);
    }

    // Verify crew slack properties
    for (const crew of report.crewSlack) {
      expect(crew.maxDutyMin).toBe(600);
      expect(crew.slackToLimitMin).toBe(crew.maxDutyMin - crew.dutyScheduledMin);
      expect(crew.fragile).toBe(crew.slackToLimitMin < 60);
    }
  });

  it('calculates multi-objective score and itemized breakdown deterministically', () => {
    const metrics: Metrics = {
      totalFlights: 70,
      delayedFlights: 5,
      totalArrDelayMin: 300,
      totalDepDelayMin: 280,
      maxArrDelayMin: 80,
      paxDelayMinutes: 45000,
      missedConnections: 2,
      missedConnectionPax: 72,
      cancelledFlights: 1,
      cancelledPax: 150,
      strandedPaxTotal: 222,
      strandedPaxVsBaseline: 222,
      crewBreaches: 1,
      crewBreachExcessMin: 35,
      spareAircraftUsed: 1,
      propagationDepthMax: 3,
      airportsAffected: ['BLR', 'DEL'],
      tailsAffected: ['VT-DS01'],
    };

    const { score, breakdown } = calculateScore(metrics);

    // Formula: 1.0 * 222 + 0.5 * 300 + 250 * 1 + 0.1 * 35 + 50 * 1 + 20 * 1
    // 222 + 150 + 250 + 3.5 + 50 + 20 = 695.5
    expect(breakdown.strandedPaxTotal).toBe(222);
    expect(breakdown.totalArrDelayMin).toBe(150);
    expect(breakdown.crewBreaches).toBe(250);
    expect(breakdown.crewBreachExcessMin).toBe(3.5);
    expect(breakdown.cancelledFlights).toBe(50);
    expect(breakdown.sparesUsed).toBe(20);
    expect(score).toBe(695.5);
    expect(breakdown.total).toBe(695.5);
  });

  it('supports custom scoring weights override', () => {
    const metrics: Metrics = {
      totalFlights: 70,
      delayedFlights: 1,
      totalArrDelayMin: 60,
      totalDepDelayMin: 60,
      maxArrDelayMin: 60,
      paxDelayMinutes: 9000,
      missedConnections: 0,
      missedConnectionPax: 0,
      cancelledFlights: 0,
      cancelledPax: 0,
      strandedPaxTotal: 0,
      strandedPaxVsBaseline: 0,
      crewBreaches: 0,
      crewBreachExcessMin: 0,
      spareAircraftUsed: 0,
      propagationDepthMax: 0,
      airportsAffected: ['DEL'],
      tailsAffected: ['VT-DS01'],
    };

    const custom = calculateScore(metrics, { totalArrDelayMin: 1.5 });
    expect(custom.score).toBe(90);
    expect(custom.breakdown.totalArrDelayMin).toBe(90);
  });

  it('produces canonical, order-independent 16-character hex scenario fingerprints', () => {
    const s1 = {
      closures: [
        { id: 'c1', airport: 'BLR', start: 360, end: 510 },
        { id: 'c2', airport: 'DEL', start: 400, end: 600 },
      ],
    };
    const s2 = {
      closures: [
        { id: 'c2', airport: 'DEL', start: 400, end: 600 },
        { id: 'c1', airport: 'BLR', start: 360, end: 510 },
      ],
    };

    const canonical1 = canonicalizeScenario(s1);
    const canonical2 = canonicalizeScenario(s2);
    expect(canonical1).toBe(canonical2);

    const hash1 = hashScenario(s1);
    const hash2 = hashScenario(s2);

    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^[0-9a-f]{16}$/);

    // Changing closure time produces distinct hash
    const s3 = {
      closures: [{ id: 'c1', airport: 'BLR', start: 360, end: 520 }],
    };
    expect(hashScenario(s3)).not.toBe(hash1);
  });

  it('computes differential cascade analysis between two simulation results via diffResults', () => {
    const resA = simulate(network, {
      closures: [{ id: 'cA', airport: 'BLR', start: 360, end: 510 }],
    });
    const resB = simulate(network, {
      closures: [{ id: 'cB', airport: 'BOM', start: 540, end: 630 }],
    });

    const diff = diffResults(resA, resB);

    expect(diff.fingerprintA).toBe(resA.scenarioFingerprint);
    expect(diff.fingerprintB).toBe(resB.scenarioFingerprint);
    expect(diff.metricsDiff.totalArrDelayMinDelta).toBe(
      resB.metrics.totalArrDelayMin - resA.metrics.totalArrDelayMin
    );
    expect(diff.metricsDiff.delayedFlightsDelta).toBe(
      resB.metrics.delayedFlights - resA.metrics.delayedFlights
    );
    expect(diff.metricsDiff.strandedPaxTotalDelta).toBe(
      resB.metrics.strandedPaxTotal - resA.metrics.strandedPaxTotal
    );
    expect(diff.metricsDiff.crewBreachesDelta).toBe(
      resB.metrics.crewBreaches - resA.metrics.crewBreaches
    );
    expect(Array.isArray(diff.flightDiffs)).toBe(true);
    expect(diff.flightDiffs.length).toBeGreaterThan(0);
  });
});
