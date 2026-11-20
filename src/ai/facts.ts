import { FlightNetworkData, SimulationResult } from '../engine/types';
import { RecoveryPlan } from '../engine/candidates';
import { formatMinutesToTime } from '../engine/time';

export interface FactsCatalog {
  facts: Record<string, string | number>;
  allowedNumbers: Set<string>;
  knownFlightIds: Set<string>;
  knownTailIds: Set<string>;
  knownAirports: Set<string>;
  formattedTimes: Set<string>;
}

export function buildFactsCatalog(
  network: FlightNetworkData,
  disruptedResult: SimulationResult,
  plans: RecoveryPlan[]
): FactsCatalog {
  const facts: Record<string, string | number> = {};
  const allowedNumbers = new Set<string>();
  const knownFlightIds = new Set<string>(network.flights.map((f) => f.flight_id));
  const knownTailIds = new Set<string>(network.flights.map((f) => f.tail_id));
  for (const s of network.spare_aircraft) {
    knownTailIds.add(s.tail_id);
  }
  const knownAirports = new Set<string>(network.airports.map((a) => a.id));
  const formattedTimes = new Set<string>();

  // Add a fact and register its numeric representation
  function addFact(key: string, value: string | number) {
    facts[key] = value;
    if (typeof value === 'number') {
      allowedNumbers.add(value.toString());
      allowedNumbers.add(Math.abs(value).toString());
    } else if (typeof value === 'string') {
      const nums = value.match(/\d+/g) || [];
      for (const n of nums) {
        allowedNumbers.add(n);
        allowedNumbers.add(parseInt(n, 10).toString());
      }
    }
  }

  // Network facts
  addFact('network.totalAirports', network.airports.length);
  addFact('network.totalFlights', network.flights.length);
  addFact('network.totalTails', knownTailIds.size);

  // Disrupted scenario metrics
  const dm = disruptedResult.metrics;
  addFact('disrupted.totalFlights', dm.totalFlights);
  addFact('disrupted.delayedFlights', dm.delayedFlights);
  addFact('disrupted.cancelledFlights', dm.cancelledFlights);
  addFact('disrupted.totalDepDelayMin', dm.totalDepDelayMin);
  addFact('disrupted.totalArrDelayMin', dm.totalArrDelayMin);
  addFact('disrupted.maxArrDelayMin', dm.maxArrDelayMin);
  addFact('disrupted.paxDelayMinutes', dm.paxDelayMinutes);
  addFact('disrupted.cancelledPax', dm.cancelledPax);
  addFact('disrupted.missedConnectionPax', dm.missedConnectionPax);
  addFact('disrupted.strandedPaxTotal', dm.strandedPaxTotal);
  addFact('disrupted.missedConnections', dm.missedConnections);
  addFact('disrupted.crewBreaches', dm.crewBreaches);
  addFact('disrupted.crewBreachExcessMin', dm.crewBreachExcessMin);
  addFact('disrupted.airportsAffectedCount', dm.airportsAffected.length);
  addFact('disrupted.tailsAffectedCount', dm.tailsAffected.length);
  addFact('disrupted.propagationDepthMax', dm.propagationDepthMax);
  addFact('disrupted.spareAircraftUsed', dm.spareAircraftUsed);

  // Add individual flight schedule & actual times
  for (const f of disruptedResult.flights) {
    const depTime = formatMinutesToTime(f.schedDep);
    const arrTime = formatMinutesToTime(f.schedArr);
    formattedTimes.add(depTime);
    formattedTimes.add(arrTime);

    if (f.actualDep !== null) {
      formattedTimes.add(formatMinutesToTime(f.actualDep));
    }
    if (f.actualArr !== null) {
      formattedTimes.add(formatMinutesToTime(f.actualArr));
    }

    addFact(`flight.${f.flightId}.depDelay`, f.depDelay);
    addFact(`flight.${f.flightId}.arrDelay`, f.arrDelay);
  }

  // Plans facts
  for (let idx = 0; idx < plans.length; idx++) {
    const p = plans[idx];
    const prefix1 = `plan.p${idx + 1}`;
    const prefix2 = `plan.${p.id}`;

    for (const prefix of [prefix1, prefix2]) {
      addFact(`${prefix}.id`, p.id);
      addFact(`${prefix}.actionCount`, p.actions.length);
      addFact(`${prefix}.score`, Math.round(p.score * 10) / 10);

      // Before metrics
      addFact(`${prefix}.before.totalArrDelayMin`, p.beforeMetrics.totalArrDelayMin);
      addFact(`${prefix}.before.delayedFlights`, p.beforeMetrics.delayedFlights);
      addFact(`${prefix}.before.cancelledFlights`, p.beforeMetrics.cancelledFlights);
      addFact(`${prefix}.before.strandedPaxTotal`, p.beforeMetrics.strandedPaxTotal);
      addFact(`${prefix}.before.crewBreaches`, p.beforeMetrics.crewBreaches);
      addFact(`${prefix}.before.crewBreachExcessMin`, p.beforeMetrics.crewBreachExcessMin);

      // After metrics
      addFact(`${prefix}.after.totalArrDelayMin`, p.afterMetrics.totalArrDelayMin);
      addFact(`${prefix}.after.delayedFlights`, p.afterMetrics.delayedFlights);
      addFact(`${prefix}.after.cancelledFlights`, p.afterMetrics.cancelledFlights);
      addFact(`${prefix}.after.strandedPaxTotal`, p.afterMetrics.strandedPaxTotal);
      addFact(`${prefix}.after.crewBreaches`, p.afterMetrics.crewBreaches);
      addFact(`${prefix}.after.crewBreachExcessMin`, p.afterMetrics.crewBreachExcessMin);
      addFact(`${prefix}.after.spareAircraftUsed`, p.afterMetrics.spareAircraftUsed);

      // Deltas
      addFact(`${prefix}.delta.totalArrDelayMin`, p.deltas.totalArrDelayMin);
      addFact(`${prefix}.delta.totalArrDelayMin_abs`, Math.abs(p.deltas.totalArrDelayMin));
      addFact(`${prefix}.delta.delayedFlights`, p.deltas.delayedFlights);
      addFact(`${prefix}.delta.delayedFlights_abs`, Math.abs(p.deltas.delayedFlights));
      addFact(`${prefix}.delta.cancelledFlights`, p.deltas.cancelledFlights);
      addFact(`${prefix}.delta.strandedPaxTotal`, p.deltas.strandedPaxTotal);
      addFact(`${prefix}.delta.strandedPaxTotal_abs`, Math.abs(p.deltas.strandedPaxTotal));
      addFact(`${prefix}.delta.crewBreaches`, p.deltas.crewBreaches);
      addFact(`${prefix}.delta.crewBreaches_abs`, Math.abs(p.deltas.crewBreaches));
      addFact(`${prefix}.delta.crewBreachExcessMin`, p.deltas.crewBreachExcessMin);
      addFact(`${prefix}.delta.spareAircraftUsed`, p.deltas.spareAircraftUsed);
    }
  }

  return {
    facts,
    allowedNumbers,
    knownFlightIds,
    knownTailIds,
    knownAirports,
    formattedTimes
  };
}
