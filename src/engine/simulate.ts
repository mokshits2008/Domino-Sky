import {
  Closure,
  FlightNetworkData,
  FlightResult,
  Minute,
  Scenario,
  SimulationResult
} from './types';
import { ENGINE_VERSION, resolveConfig } from './config';
import { parseTimeToMinutes, isWithinInterval } from './time';
import { buildEffectiveAssignments } from './actions';
import { determineFlightCauses } from './causes';
import { evaluateConnections } from './connections';
import { evaluateCrews } from './crews';
import { computeMetrics } from './metrics';
import { hashScenario } from './fingerprint';

/**
 * WeakMap cache for baseline stranded passenger counts keyed by network data instance.
 * Preserves function purity, prevents memory leaks, and avoids global mutable state.
 */
const baselineStrandedPaxCache = new WeakMap<FlightNetworkData, number>();

/**
 * Simulates a single disruption scenario against the flight network.
 * Pure function with integer math, zero side-effects, zero Node-only APIs.
 */
export function simulate(
  network: FlightNetworkData,
  scenario: Scenario
): SimulationResult {
  const config = resolveConfig(scenario.config);
  const warnings: string[] = [];

  // 1. Build effective assignments (applies actions, validates continuity)
  const { assignments, tailChains, crewChains, standbyCrews } = buildEffectiveAssignments(
    network,
    scenario
  );


  // Index effective tail chains: flightId -> index in tail chain
  const tailChainIndexMap = new Map<string, { tailId: string; index: number }>();
  for (const [tailId, chain] of tailChains.entries()) {
    for (let i = 0; i < chain.length; i++) {
      tailChainIndexMap.set(chain[i], { tailId, index: i });
    }
  }

  // Index effective crew chains: flightId -> index in crew chain
  const crewChainIndexMap = new Map<string, { crewId: string; index: number }>();
  for (const [crewId, chain] of crewChains.entries()) {
    for (let i = 0; i < chain.length; i++) {
      crewChainIndexMap.set(chain[i], { crewId, index: i });
    }
  }

  // Pre-calculate scheduled departure/arrival for all flights
  const flightSchedTimes = new Map<string, { schedDep: Minute; schedArr: Minute }>();
  for (const f of network.flights) {
    flightSchedTimes.set(f.flight_id, {
      schedDep: parseTimeToMinutes(f.dep),
      schedArr: parseTimeToMinutes(f.arr)
    });
  }

  // 2. Separate active flights and cancelled flights
  const activeRawFlights = network.flights.filter((f) => {
    const eff = assignments.get(f.flight_id);
    return eff && !eff.cancelled;
  });

  // Sort active flights in topological order: (schedDep, flightId)
  activeRawFlights.sort((a, b) => {
    const depA = flightSchedTimes.get(a.flight_id)!.schedDep;
    const depB = flightSchedTimes.get(b.flight_id)!.schedDep;
    if (depA !== depB) {
      return depA - depB;
    }
    return a.flight_id.localeCompare(b.flight_id);
  });

  const flightResultMap = new Map<string, FlightResult>();

  // Closures lookup by airport
  const closuresByAirport = new Map<string, Closure[]>();
  for (const c of scenario.closures) {
    const list = closuresByAirport.get(c.airport) ?? [];
    list.push(c);
    closuresByAirport.set(c.airport, list);
  }

  // 3. Process active flights in topological order
  for (const rawF of activeRawFlights) {
    const fid = rawF.flight_id;
    const eff = assignments.get(fid)!;
    const sched = flightSchedTimes.get(fid)!;

    // Collect constraints
    let aircraftConstraint: { time: Minute; sourceFlightId: string } | undefined;
    let crewConstraint: { time: Minute; sourceFlightId: string } | undefined;
    let spareConstraint: { time: Minute } | undefined;

    // Aircraft predecessor on effective tail chain
    const tcInfo = tailChainIndexMap.get(fid);
    let predecessorFlightResult: FlightResult | undefined;
    if (tcInfo && tcInfo.index > 0) {
      const prevFid = tailChains.get(tcInfo.tailId)![tcInfo.index - 1];
      const prevRes = flightResultMap.get(prevFid);
      if (prevRes && prevRes.actualArr !== null) {
        predecessorFlightResult = prevRes;
        aircraftConstraint = {
          time: prevRes.actualArr + config.minTurnaround,
          sourceFlightId: prevFid
        };
      }
    }

    // Spare ready constraint (only on first flight of spare's chain)
    if (eff.isSpare && eff.isFirstOnSpare && eff.spareAvailableFrom !== undefined) {
      spareConstraint = { time: eff.spareAvailableFrom };
    }

    // Crew predecessor (standby crews have no predecessor constraint)
    const ccInfo = crewChainIndexMap.get(fid);
    let predecessorCrewResult: FlightResult | undefined;
    if (ccInfo && ccInfo.index > 0) {
      const prevCrewFid = crewChains.get(ccInfo.crewId)![ccInfo.index - 1];
      const prevCrewRes = flightResultMap.get(prevCrewFid);
      if (prevCrewRes && prevCrewRes.actualArr !== null) {
        predecessorCrewResult = prevCrewRes;
        crewConstraint = {
          time: prevCrewRes.actualArr + config.minTurnaround,
          sourceFlightId: prevCrewFid
        };
      }
    }

    // base = max of all non-closure constraints
    const schedDep = sched.schedDep;
    const acTime = aircraftConstraint?.time ?? -1;
    const spTime = spareConstraint?.time ?? -1;
    const crTime = crewConstraint?.time ?? -1;

    const base = Math.max(schedDep, acTime, spTime, crTime);

    // 4. Closure resolution fixpoint loop
    let t = base;
    let groundHoldShift = 0;
    let activeOriginClosureId: string | undefined;
    let activeDestClosureId: string | undefined;
    let finalArr = t + rawF.block_minutes;
    let arrivalHoldMin = 0;

    const originClosures = closuresByAirport.get(rawF.origin) ?? [];
    const destClosures = closuresByAirport.get(rawF.destination) ?? [];

    let iterations = 0;
    let changed = true;

    while (changed && iterations < config.maxFixpointIterations) {
      iterations++;
      changed = false;

      // (a) for every closure at origin with s <= t < e: t = e
      for (const oc of originClosures) {
        if (isWithinInterval(t, oc.start, oc.end)) {
          t = oc.end;
          activeOriginClosureId = oc.id;
          changed = true;
          break;
        }
      }

      // (b) arr = t + block
      finalArr = t + rawF.block_minutes;
      arrivalHoldMin = 0;

      // (c) for every closure at destination with s <= arr < e
      let destIter = 0;
      let destChanged = true;
      while (destChanged && destIter < 20) {
        destChanged = false;
        destIter++;

        for (const dc of destClosures) {
          if (isWithinInterval(finalArr, dc.start, dc.end)) {
            activeDestClosureId = dc.id;
            if (config.arrivalPolicy === 'AIRBORNE_HOLD') {
              finalArr = dc.end;
              arrivalHoldMin = finalArr - (t + rawF.block_minutes);
              destChanged = true;
              break;
            } else {
              // GROUND_HOLD
              const shift = dc.end - finalArr;
              t += shift;
              groundHoldShift += shift;
              changed = true;
              break;
            }
          }
        }

        if (config.arrivalPolicy === 'GROUND_HOLD' && changed) {
          break; // restart outer loop to recheck origin closures
        }
      }
    }

    if (iterations >= config.maxFixpointIterations) {
      warnings.push(`Fixpoint iteration limit (${config.maxFixpointIterations}) exceeded for flight ${fid}`);
    }

    // 5. Final times and delays
    const actualDep = t;
    const actualArr = finalArr;
    const depDelay = actualDep - schedDep;
    const arrDelay = actualArr - sched.schedArr;

    let status: 'ON_TIME' | 'DELAYED' | 'CANCELLED' = 'ON_TIME';
    if (arrDelay > 0) {
      status = 'DELAYED';
    }

    let severity: 'NONE' | 'MINOR' | 'MODERATE' | 'SEVERE' = 'NONE';
    if (arrDelay === 0) {
      severity = 'NONE';
    } else if (arrDelay < 15) {
      severity = 'MINOR';
    } else if (arrDelay < 60) {
      severity = 'MODERATE';
    } else {
      severity = 'SEVERE';
    }

    // Determine relevant predecessor for knock-on inheritance
    const chosenPredecessor =
      acTime === base && acTime > schedDep
        ? predecessorFlightResult
        : crTime === base && crTime > schedDep
          ? predecessorCrewResult
          : undefined;

    // 6. Determine causes, root cause, causeChain, explanation
    const causeRes = determineFlightCauses({
      flightId: fid,
      origin: rawF.origin,
      destination: rawF.destination,
      schedDep,
      schedArr: sched.schedArr,
      actualDep,
      actualArr,
      depDelay,
      arrDelay,
      arrivalHoldMin,
      cancelled: false,
      baseDep: base,
      tAfterClosure: t,
      groundHoldShift,
      activeOriginClosureId,
      activeDestClosureId,
      aircraftConstraint,
      crewConstraint,
      spareConstraint,
      predecessorArrDelay: chosenPredecessor?.arrDelay ?? 0,
      predecessorRootCause: chosenPredecessor?.rootCause ?? null,
      predecessorCauseChain: chosenPredecessor?.causeChain ?? []
    });

    const flightResult: FlightResult = {
      flightId: fid,
      tailId: eff.effectiveTailId,
      originalTailId: eff.originalTailId,
      crewId: eff.crewId,
      origin: rawF.origin,
      destination: rawF.destination,
      schedDep,
      schedArr: sched.schedArr,
      actualDep,
      actualArr,
      depDelay,
      arrDelay,
      arrivalHoldMin,
      cancelled: false,
      status,
      severity,
      primaryCause: causeRes.primaryCause,
      rootCause: causeRes.rootCause,
      causeChain: causeRes.causeChain,
      slackAbsorbedMin: causeRes.slackAbsorbedMin,
      explanation: causeRes.explanation
    };

    flightResultMap.set(fid, flightResult);
  }

  // 7. Handle cancelled flights
  for (const rawF of network.flights) {
    const fid = rawF.flight_id;
    const eff = assignments.get(fid)!;
    if (eff.cancelled) {
      const sched = flightSchedTimes.get(fid)!;
      const causeRes = determineFlightCauses({
        flightId: fid,
        origin: rawF.origin,
        destination: rawF.destination,
        schedDep: sched.schedDep,
        schedArr: sched.schedArr,
        actualDep: null,
        actualArr: null,
        depDelay: 0,
        arrDelay: 0,
        arrivalHoldMin: 0,
        cancelled: true,
        baseDep: sched.schedDep,
        tAfterClosure: sched.schedDep,
        groundHoldShift: 0
      });

      flightResultMap.set(fid, {
        flightId: fid,
        tailId: eff.effectiveTailId,
        originalTailId: eff.originalTailId,
        crewId: eff.crewId,
        origin: rawF.origin,
        destination: rawF.destination,
        schedDep: sched.schedDep,
        schedArr: sched.schedArr,
        actualDep: null,
        actualArr: null,
        depDelay: 0,
        arrDelay: 0,
        arrivalHoldMin: 0,
        cancelled: true,
        status: 'CANCELLED',
        severity: 'NONE',
        primaryCause: causeRes.primaryCause,
        rootCause: null,
        causeChain: [],
        slackAbsorbedMin: 0,
        explanation: causeRes.explanation
      });
    }
  }

  // Order flight results by original network order
  const orderedFlights: FlightResult[] = network.flights.map((f) => flightResultMap.get(f.flight_id)!);

  // 8. Connections evaluation
  const connections = evaluateConnections(network.connections, orderedFlights);

  // 9. Crews evaluation
  const crews = evaluateCrews(network.crews, orderedFlights, standbyCrews);

  // Compute baseline stranded pax if this is not a baseline scenario
  let baselineStrandedPax = 0;
  const isBaseline = scenario.closures.length === 0 && (!scenario.actions || scenario.actions.length === 0);
  if (!isBaseline) {
      let cached = baselineStrandedPaxCache.get(network);
      if (cached === undefined) {
        const baseline = simulateBaseline(network);
        cached = baseline.metrics.strandedPaxTotal;
        baselineStrandedPaxCache.set(network, cached);
      }
      baselineStrandedPax = cached;
    }

    // 10. Metrics calculation
    const { metrics, perAirport, propagationEdges } = computeMetrics(
      network,
      orderedFlights,
      connections,
      crews,
      baselineStrandedPax
    );

    const scenarioFingerprint = hashScenario(scenario);

    return {
      engineVersion: ENGINE_VERSION,
      scenarioFingerprint,
      flights: orderedFlights,
      connections,
      crews,
      metrics,
      perAirport,
      propagationEdges,
      warnings
    };
  }

  /**
   * Simulates the baseline scenario (no closures, no actions).
   */
  export function simulateBaseline(network: FlightNetworkData): SimulationResult {
    return simulate(network, { closures: [], actions: [] });
  }
