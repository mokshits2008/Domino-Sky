import { FlightNetworkData, SimulationResult } from './types';
import { parseTimeToMinutes } from './time';
import { simulateBaseline } from './simulate';

export interface TurnaroundSlack {
  tailId: string;
  fromFlightId: string;
  toFlightId: string;
  airport: string;
  schedArrival: string;
  schedDeparture: string;
  turnaroundScheduledMin: number;
  minTurnaroundMin: number;
  slackMin: number;
  fragile: boolean; // true if slack == 0 (tight turnaround)
}

export interface CrewSlack {
  crewId: string;
  tailId: string;
  base: string;
  dutyStart: string;
  dutyEndSched: string;
  dutyScheduledMin: number;
  maxDutyMin: number;
  slackToLimitMin: number;
  fragile: boolean; // true if slack < 60 min
}

export interface BaselineSlackReport {
  turnaroundSlack: TurnaroundSlack[];
  crewSlack: CrewSlack[];
  mostFragileTails: string[];
  mostFragileCrews: string[];
}

export function computeBaselineSlackReport(network: FlightNetworkData): BaselineSlackReport {
  const turnaroundSlack: TurnaroundSlack[] = [];

  // Group flights by tail ordered by leg_order
  const flightsByTail = new Map<string, typeof network.flights>();
  for (const f of network.flights) {
    const list = flightsByTail.get(f.tail_id) ?? [];
    list.push(f);
    flightsByTail.set(f.tail_id, list);
  }

  const minTurnaround = network.meta.min_turnaround_minutes;
  const tailFragilityScore = new Map<string, number>();

  for (const [tailId, legs] of flightsByTail.entries()) {
    const sorted = [...legs].sort((a, b) => a.leg_order - b.leg_order);
    for (let i = 0; i < sorted.length - 1; i++) {
      const prev = sorted[i];
      const next = sorted[i + 1];
      const prevArr = parseTimeToMinutes(prev.arr);
      const nextDep = parseTimeToMinutes(next.dep);
      const gap = nextDep - prevArr;
      const slack = gap - minTurnaround;
      const fragile = slack === 0;

      if (fragile) {
        tailFragilityScore.set(tailId, (tailFragilityScore.get(tailId) ?? 0) + 1);
      }

      turnaroundSlack.push({
        tailId,
        fromFlightId: prev.flight_id,
        toFlightId: next.flight_id,
        airport: prev.destination,
        schedArrival: prev.arr,
        schedDeparture: next.dep,
        turnaroundScheduledMin: gap,
        minTurnaroundMin: minTurnaround,
        slackMin: slack,
        fragile
      });
    }
  }

  turnaroundSlack.sort((a, b) => a.slackMin - b.slackMin);

  // Crew slack
  const crewSlack: CrewSlack[] = [];
  const baselineSim = simulateBaseline(network);

  for (const cr of baselineSim.crews) {
    const rawCrew = network.crews.find((c) => c.crew_id === cr.crewId);
    if (!rawCrew) continue;

    const fragile = cr.slackToLimitMin < 60;
    crewSlack.push({
      crewId: cr.crewId,
      tailId: cr.tailId,
      base: rawCrew.base,
      dutyStart: rawCrew.duty_start,
      dutyEndSched: rawCrew.duty_start, // computed
      dutyScheduledMin: cr.dutyMin,
      maxDutyMin: cr.maxDutyMin,
      slackToLimitMin: cr.slackToLimitMin,
      fragile
    });
  }

  crewSlack.sort((a, b) => a.slackToLimitMin - b.slackToLimitMin);

  const mostFragileTails = Array.from(tailFragilityScore.entries())
    .sort((a, b) => b[1] - a[1])
    .map((e) => e[0]);

  const mostFragileCrews = crewSlack
    .filter((c) => c.fragile)
    .map((c) => c.crewId);

  return {
    turnaroundSlack,
    crewSlack,
    mostFragileTails,
    mostFragileCrews
  };
}

export interface ScenarioDiff {
  fingerprintA: string;
  fingerprintB: string;
  metricsDiff: {
    totalArrDelayMinDelta: number;
    delayedFlightsDelta: number;
    cancelledFlightsDelta: number;
    strandedPaxTotalDelta: number;
    crewBreachesDelta: number;
  };
  flightDiffs: {
    flightId: string;
    actualDepA: number | null;
    actualDepB: number | null;
    actualArrA: number | null;
    actualArrB: number | null;
    arrDelayDiff: number; // B - A
  }[];
}

export function diffResults(a: SimulationResult, b: SimulationResult): ScenarioDiff {
  const mapA = new Map(a.flights.map((f) => [f.flightId, f]));
  const flightDiffs: ScenarioDiff['flightDiffs'] = [];

  for (const f of b.flights) {
    const fa = mapA.get(f.flightId);
    if (!fa) continue;

    const delayDiff = f.arrDelay - fa.arrDelay;
    if (delayDiff !== 0 || f.actualArr !== fa.actualArr || f.cancelled !== fa.cancelled) {
      flightDiffs.push({
        flightId: f.flightId,
        actualDepA: fa.actualDep,
        actualDepB: f.actualDep,
        actualArrA: fa.actualArr,
        actualArrB: f.actualArr,
        arrDelayDiff: delayDiff
      });
    }
  }

  return {
    fingerprintA: a.scenarioFingerprint,
    fingerprintB: b.scenarioFingerprint,
    metricsDiff: {
      totalArrDelayMinDelta: b.metrics.totalArrDelayMin - a.metrics.totalArrDelayMin,
      delayedFlightsDelta: b.metrics.delayedFlights - a.metrics.delayedFlights,
      cancelledFlightsDelta: b.metrics.cancelledFlights - a.metrics.cancelledFlights,
      strandedPaxTotalDelta: b.metrics.strandedPaxTotal - a.metrics.strandedPaxTotal,
      crewBreachesDelta: b.metrics.crewBreaches - a.metrics.crewBreaches
    },
    flightDiffs
  };
}
