import { EngineConfig, ScoreWeights } from './types';

export const ENGINE_VERSION = '1.0.0';

export const DEFAULT_SCORE_WEIGHTS: ScoreWeights = {
  strandedPaxTotal: 1.0,
  totalArrDelayMin: 0.5,
  crewBreaches: 250,
  crewBreachExcessMin: 0.1,
  cancelledFlights: 50,
  sparesUsed: 20
};

export const DEFAULT_CONFIG: EngineConfig = {
  minTurnaround: 30,
  arrivalPolicy: 'AIRBORNE_HOLD',
  spareCrewReportMin: 60,
  maxFixpointIterations: 50,
  scoreWeights: DEFAULT_SCORE_WEIGHTS
};

export type UserEngineConfig = Partial<Omit<EngineConfig, 'scoreWeights'>> & {
  scoreWeights?: Partial<ScoreWeights>;
};

export function resolveConfig(userConfig?: UserEngineConfig): EngineConfig {
  if (!userConfig) {
    return { ...DEFAULT_CONFIG, scoreWeights: { ...DEFAULT_SCORE_WEIGHTS } };
  }
  return {
    minTurnaround: userConfig.minTurnaround ?? DEFAULT_CONFIG.minTurnaround,
    arrivalPolicy: userConfig.arrivalPolicy ?? DEFAULT_CONFIG.arrivalPolicy,
    spareCrewReportMin: userConfig.spareCrewReportMin ?? DEFAULT_CONFIG.spareCrewReportMin,
    maxFixpointIterations: userConfig.maxFixpointIterations ?? DEFAULT_CONFIG.maxFixpointIterations,
    scoreWeights: {
      ...DEFAULT_SCORE_WEIGHTS,
      ...(userConfig.scoreWeights ?? {})
    }
  };
}
