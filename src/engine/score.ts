import { Metrics, ScoreWeights } from './types';
import { DEFAULT_SCORE_WEIGHTS } from './config';

export interface ScoreBreakdown {
  strandedPaxTotal: number;
  totalArrDelayMin: number;
  crewBreaches: number;
  crewBreachExcessMin: number;
  cancelledFlights: number;
  sparesUsed: number;
  total: number;
}

export function calculateScore(
  metrics: Metrics,
  weights?: Partial<ScoreWeights>
): { score: number; breakdown: ScoreBreakdown } {
  const mergedWeights = { ...DEFAULT_SCORE_WEIGHTS, ...(weights ?? {}) };
  const strandedPaxCost = mergedWeights.strandedPaxTotal * metrics.strandedPaxTotal;
  const arrDelayCost = mergedWeights.totalArrDelayMin * metrics.totalArrDelayMin;
  const breachesCost = mergedWeights.crewBreaches * metrics.crewBreaches;
  const excessCost = mergedWeights.crewBreachExcessMin * metrics.crewBreachExcessMin;
  const cancelledCost = mergedWeights.cancelledFlights * metrics.cancelledFlights;
  const sparesCost = mergedWeights.sparesUsed * metrics.spareAircraftUsed;

  const total = strandedPaxCost + arrDelayCost + breachesCost + excessCost + cancelledCost + sparesCost;

  return {
    score: total,
    breakdown: {
      strandedPaxTotal: strandedPaxCost,
      totalArrDelayMin: arrDelayCost,
      crewBreaches: breachesCost,
      crewBreachExcessMin: excessCost,
      cancelledFlights: cancelledCost,
      sparesUsed: sparesCost,
      total
    }
  };
}
