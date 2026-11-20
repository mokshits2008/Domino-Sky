import rawFlightNetwork from '@/data/flight_network.json';
import {
  ArrivalPolicy,
  ConnectionResult,
  CrewResult,
  FlightNetworkData,
  FlightResult,
  Metrics,
  Minute,
  Scenario,
  SimulationResult
} from '@/engine/types';

// Pure time parser helper inside oracle (no engine internal imports)
function parseTime(t: string): Minute {
  const m = t.match(/^(\d{1,2}):(\d{2})(?:\+(\d+)d)?$/);
  if (!m) throw new Error(`Invalid time: ${t}`);
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const d = m[3] ? parseInt(m[3], 10) : 0;
  return d * 1440 + h * 60 + min;
}

export interface OracleSimulationResult {
  flights: FlightResult[];
  connections: ConnectionResult[];
  crews: CrewResult[];
  metrics: Metrics;
}

/**
 * Independent relaxation-based (Bellman-Ford style) oracle simulator.
 * Completely distinct implementation without importing engine internals.
 */
export function relaxationSimulate(
  scenario: Scenario,
  networkData?: FlightNetworkData
): SimulationResult {
  const network: FlightNetworkData = networkData ?? (rawFlightNetwork as FlightNetworkData);
  const minTurnaround = scenario.config?.minTurnaround ?? network.meta.min_turnaround_minutes;
  const arrivalPolicy: ArrivalPolicy = scenario.config?.arrivalPolicy ?? 'AIRBORNE_HOLD';
  const spareCrewReportMin = scenario.config?.spareCrewReportMin ?? 60;

  // 1. Process actions
  const cancelledIds = new Set<string>();
  const spareSwaps = new Map<string, string>(); // flightId -> spareTail

  for (const a of scenario.actions ?? []) {
    if (a.type === 'CANCEL') {
      for (const fid of a.flightIds) cancelledIds.add(fid);
    } else if (a.type === 'SWAP_SPARE') {
      spareSwaps.set(a.flightId, a.spareTail);
    }
  }

  // Build effective tail assignments and crew assignments
  const spareMap = new Map(network.spare_aircraft.map((s) => [s.tail_id, s]));
  const flightMap = new Map(network.flights.map((f) => [f.flight_id, f]));

  // Group flights by original tail
  const tailFlightMap = new Map<string, typeof network.flights>();
  for (const f of network.flights) {
    const list = tailFlightMap.get(f.tail_id) ?? [];
    list.push(f);
    tailFlightMap.set(f.tail_id, list);
  }

  const effectiveTailChains = new Map<string, string[]>(); // tailId -> active flightIds
  const effectiveCrewChains = new Map<string, string[]>(); // crewId -> active flightIds
  const flightAssignments = new Map<string, {
    effectiveTail: string;
    originalTail: string;
    crewId: string;
    isSpare: boolean;
    isFirstOnSpare: boolean;
    spareAvail?: Minute;
  }>();

  const standbyCrewsList: { crewId: string; tailId: string; firstSchedDep: Minute }[] = [];

  for (const [origTail, legs] of tailFlightMap.entries()) {
    const sorted = [...legs].sort((a, b) => a.leg_order - b.leg_order);
    let activeSpare: string | null = null;
    let activeStandbyCrew: string | null = null;

    for (const f of sorted) {
      const fid = f.flight_id;
      const isCancelled = cancelledIds.has(fid);

      if (spareSwaps.has(fid)) {
        activeSpare = spareSwaps.get(fid)!;
        activeStandbyCrew = `CR-STANDBY-${activeSpare}`;
        standbyCrewsList.push({
          crewId: activeStandbyCrew,
          tailId: activeSpare,
          firstSchedDep: parseTime(f.dep)
        });
      }

      if (activeSpare !== null) {
        const spareObj = spareMap.get(activeSpare);
        const spareAvail = spareObj ? parseTime(spareObj.available_from) : 300;
        const isFirst = spareSwaps.has(fid);

        flightAssignments.set(fid, {
          effectiveTail: activeSpare,
          originalTail: origTail,
          crewId: activeStandbyCrew!,
          isSpare: true,
          isFirstOnSpare: isFirst,
          spareAvail: isFirst ? spareAvail : undefined
        });

        if (!isCancelled) {
          const list = effectiveTailChains.get(activeSpare) ?? [];
          list.push(fid);
          effectiveTailChains.set(activeSpare, list);

          const cList = effectiveCrewChains.get(activeStandbyCrew!) ?? [];
          cList.push(fid);
          effectiveCrewChains.set(activeStandbyCrew!, cList);
        }
      } else {
        const origCrew = network.crews.find((c) => c.tail_id === origTail)?.crew_id ?? `CR-${origTail}`;
        flightAssignments.set(fid, {
          effectiveTail: origTail,
          originalTail: origTail,
          crewId: origCrew,
          isSpare: false,
          isFirstOnSpare: false
        });

        if (!isCancelled) {
          const list = effectiveTailChains.get(origTail) ?? [];
          list.push(fid);
          effectiveTailChains.set(origTail, list);

          const cList = effectiveCrewChains.get(origCrew) ?? [];
          cList.push(fid);
          effectiveCrewChains.set(origCrew, cList);
        }
      }
    }
  }

  // Predecessor lookup maps
  const aircraftPredecessor = new Map<string, string>();
  for (const [, chain] of effectiveTailChains.entries()) {
    for (let i = 1; i < chain.length; i++) {
      aircraftPredecessor.set(chain[i], chain[i - 1]);
    }
  }

  const crewPredecessor = new Map<string, string>();
  for (const [, chain] of effectiveCrewChains.entries()) {
    for (let i = 1; i < chain.length; i++) {
      crewPredecessor.set(chain[i], chain[i - 1]);
    }
  }

  // 2. Initialize all non-cancelled flights at actualDep = schedDep, actualArr = schedArr
  const actualDepMap = new Map<string, Minute>();
  const actualArrMap = new Map<string, Minute>();
  const arrivalHoldMinMap = new Map<string, Minute>();

  for (const f of network.flights) {
    if (!cancelledIds.has(f.flight_id)) {
      actualDepMap.set(f.flight_id, parseTime(f.dep));
      actualArrMap.set(f.flight_id, parseTime(f.arr));
      arrivalHoldMinMap.set(f.flight_id, 0);
    }
  }

  // 3. Bellman-Ford iterative relaxation loop
  let changed = true;
  let iterations = 0;
  const maxIterations = 200;

  while (changed && iterations < maxIterations) {
    changed = false;
    iterations++;

    for (const f of network.flights) {
      const fid = f.flight_id;
      if (cancelledIds.has(fid)) continue;

      const schedDep = parseTime(f.dep);
      let targetDep = schedDep;

      // Relax aircraft predecessor constraint
      const acPredId = aircraftPredecessor.get(fid);
      if (acPredId) {
        const predArr = actualArrMap.get(acPredId)!;
        const acConstraint = predArr + minTurnaround;
        if (acConstraint > targetDep) {
          targetDep = acConstraint;
        }
      }

      // Relax crew predecessor constraint
      const crPredId = crewPredecessor.get(fid);
      if (crPredId) {
        const predArr = actualArrMap.get(crPredId)!;
        const crConstraint = predArr + minTurnaround;
        if (crConstraint > targetDep) {
          targetDep = crConstraint;
        }
      }

      // Relax spare ready constraint
      const assign = flightAssignments.get(fid)!;
      if (assign.isSpare && assign.isFirstOnSpare && assign.spareAvail !== undefined) {
        if (assign.spareAvail > targetDep) {
          targetDep = assign.spareAvail;
        }
      }

      // Relax origin closure constraints
      let currentDep = Math.max(actualDepMap.get(fid)!, targetDep);
      let closureIter = 0;
      let closureChanged = true;

      while (closureChanged && closureIter < 30) {
        closureChanged = false;
        closureIter++;

        // Origin closures
        for (const c of scenario.closures) {
          if (c.airport === f.origin && currentDep >= c.start && currentDep < c.end) {
            currentDep = c.end;
            closureChanged = true;
            break;
          }
        }

        // Destination closures under GROUND_HOLD
        if (!closureChanged && arrivalPolicy === 'GROUND_HOLD') {
          const tentativeArr = currentDep + f.block_minutes;
          for (const c of scenario.closures) {
            if (c.airport === f.destination && tentativeArr >= c.start && tentativeArr < c.end) {
              const shift = c.end - tentativeArr;
              currentDep += shift;
              closureChanged = true;
              break;
            }
          }
        }
      }

      // Destination arrival
      let finalArr = currentDep + f.block_minutes;
      let arrivalHoldMin = 0;

      if (arrivalPolicy === 'AIRBORNE_HOLD') {
        let destIter = 0;
        let destChanged = true;
        while (destChanged && destIter < 20) {
          destChanged = false;
          destIter++;
          for (const c of scenario.closures) {
            if (c.airport === f.destination && finalArr >= c.start && finalArr < c.end) {
              finalArr = c.end;
              arrivalHoldMin = finalArr - (currentDep + f.block_minutes);
              destChanged = true;
              break;
            }
          }
        }
      }

      if (currentDep > actualDepMap.get(fid)!) {
        actualDepMap.set(fid, currentDep);
        changed = true;
      }
      if (finalArr !== actualArrMap.get(fid)!) {
        actualArrMap.set(fid, finalArr);
        arrivalHoldMinMap.set(fid, arrivalHoldMin);
        changed = true;
      }
    }
  }

  // 4. Construct FlightResults
  const flightResults: FlightResult[] = network.flights.map((f) => {
    const fid = f.flight_id;
    const isCancelled = cancelledIds.has(fid);
    const assign = flightAssignments.get(fid)!;
    const schedDep = parseTime(f.dep);
    const schedArr = parseTime(f.arr);

    if (isCancelled) {
      return {
        flightId: fid,
        tailId: assign.effectiveTail,
        originalTailId: assign.originalTail,
        crewId: assign.crewId,
        origin: f.origin,
        destination: f.destination,
        schedDep,
        schedArr,
        actualDep: null,
        actualArr: null,
        depDelay: 0,
        arrDelay: 0,
        arrivalHoldMin: 0,
        cancelled: true,
        status: 'CANCELLED' as const,
        severity: 'NONE' as const,
        primaryCause: { type: 'CANCELLED' as const, minutes: 0 },
        rootCause: null,
        causeChain: [],
        slackAbsorbedMin: 0,
        explanation: `Flight ${fid} was cancelled.`
      };
    }

    const actualDep = actualDepMap.get(fid)!;
    const actualArr = actualArrMap.get(fid)!;
    const depDelay = actualDep - schedDep;
    const arrDelay = actualArr - schedArr;
    const arrivalHoldMin = arrivalHoldMinMap.get(fid)!;

    const status = arrDelay > 0 ? ('DELAYED' as const) : ('ON_TIME' as const);
    const severity =
      arrDelay === 0
        ? ('NONE' as const)
        : arrDelay < 15
        ? ('MINOR' as const)
        : arrDelay < 60
        ? ('MODERATE' as const)
        : ('SEVERE' as const);

    return {
      flightId: fid,
      tailId: assign.effectiveTail,
      originalTailId: assign.originalTail,
      crewId: assign.crewId,
      origin: f.origin,
      destination: f.destination,
      schedDep,
      schedArr,
      actualDep,
      actualArr,
      depDelay,
      arrDelay,
      arrivalHoldMin,
      cancelled: false,
      status,
      severity,
      primaryCause: { type: 'ON_TIME' as const, minutes: 0 }, // cause determination tested separately
      rootCause: null,
      causeChain: [],
      slackAbsorbedMin: 0,
      explanation: ''
    };
  });

  const flightResMap = new Map(flightResults.map((f) => [f.flightId, f]));

  // 5. Evaluate connections independently
  const connectionResults: ConnectionResult[] = network.connections.map((c) => {
    const fromF = flightResMap.get(c.from_flight);
    const toF = flightResMap.get(c.to_flight);

    if (toF?.cancelled) {
      return {
        connectionId: c.connection_id,
        airport: c.airport,
        fromFlight: c.from_flight,
        toFlight: c.to_flight,
        passengers: c.passengers,
        minConnect: c.min_connect_minutes,
        gapMin: null,
        status: 'TO_CANCELLED' as const,
        strandedPax: 0
      };
    }

    if (fromF?.cancelled) {
      return {
        connectionId: c.connection_id,
        airport: c.airport,
        fromFlight: c.from_flight,
        toFlight: c.to_flight,
        passengers: c.passengers,
        minConnect: c.min_connect_minutes,
        gapMin: null,
        status: 'MISSED' as const,
        reason: 'FROM_CANCELLED' as const,
        strandedPax: c.passengers
      };
    }

    const gap = toF!.actualDep! - fromF!.actualArr!;
    if (gap >= c.min_connect_minutes) {
      return {
        connectionId: c.connection_id,
        airport: c.airport,
        fromFlight: c.from_flight,
        toFlight: c.to_flight,
        passengers: c.passengers,
        minConnect: c.min_connect_minutes,
        gapMin: gap,
        status: 'CONNECTED' as const,
        strandedPax: 0
      };
    } else {
      return {
        connectionId: c.connection_id,
        airport: c.airport,
        fromFlight: c.from_flight,
        toFlight: c.to_flight,
        passengers: c.passengers,
        minConnect: c.min_connect_minutes,
        gapMin: gap,
        status: 'MISSED' as const,
        reason: 'INSUFFICIENT_TIME' as const,
        strandedPax: c.passengers
      };
    }
  });

  // 6. Evaluate crews independently
  const flightsByCrew = new Map<string, FlightResult[]>();
  for (const f of flightResults) {
    const list = flightsByCrew.get(f.crewId) ?? [];
    list.push(f);
    flightsByCrew.set(f.crewId, list);
  }

  const crewResults: CrewResult[] = network.crews.map((cr) => {
    const cFlights = flightsByCrew.get(cr.crew_id) ?? [];
    const active = cFlights.filter((f) => !f.cancelled && f.actualArr !== null);
    const dutyStart = parseTime(cr.duty_start);

    if (active.length === 0) {
      return {
        crewId: cr.crew_id,
        tailId: cr.tail_id,
        dutyStart,
        dutyEnd: null,
        dutyMin: 0,
        maxDutyMin: cr.max_duty_mins,
        breach: false,
        excessMin: 0,
        slackToLimitMin: cr.max_duty_mins,
        standby: false
      };
    }

    let maxArr = -1;
    for (const f of active) {
      if (f.actualArr! > maxArr) maxArr = f.actualArr!;
    }
    const dutyEnd = maxArr;
    const dutyMin = dutyEnd - dutyStart;
    const breach = dutyMin > cr.max_duty_mins;
    const excessMin = breach ? dutyMin - cr.max_duty_mins : 0;
    const slackToLimitMin = breach ? 0 : cr.max_duty_mins - dutyMin;

    return {
      crewId: cr.crew_id,
      tailId: cr.tail_id,
      dutyStart,
      dutyEnd,
      dutyMin,
      maxDutyMin: cr.max_duty_mins,
      breach,
      excessMin,
      slackToLimitMin,
      standby: false
    };
  });

  // Standby crews
  for (const standby of standbyCrewsList) {
    const cFlights = flightsByCrew.get(standby.crewId) ?? [];
    const active = cFlights.filter((f) => !f.cancelled && f.actualArr !== null);
    const dutyStart = standby.firstSchedDep - spareCrewReportMin;
    const maxDutyMin = 600;

    if (active.length === 0) {
      crewResults.push({
        crewId: standby.crewId,
        tailId: standby.tailId,
        dutyStart,
        dutyEnd: null,
        dutyMin: 0,
        maxDutyMin,
        breach: false,
        excessMin: 0,
        slackToLimitMin: maxDutyMin,
        standby: true
      });
      continue;
    }

    let maxArr = -1;
    for (const f of active) {
      if (f.actualArr! > maxArr) maxArr = f.actualArr!;
    }
    const dutyEnd = maxArr;
    const dutyMin = dutyEnd - dutyStart;
    const breach = dutyMin > maxDutyMin;
    const excessMin = breach ? dutyMin - maxDutyMin : 0;
    const slackToLimitMin = breach ? 0 : maxDutyMin - dutyMin;

    crewResults.push({
      crewId: standby.crewId,
      tailId: standby.tailId,
      dutyStart,
      dutyEnd,
      dutyMin,
      maxDutyMin,
      breach,
      excessMin,
      slackToLimitMin,
      standby: true
    });
  }

  // 7. Compute metrics independently
  let delayedFlights = 0;
  let cancelledFlights = 0;
  let totalDepDelayMin = 0;
  let totalArrDelayMin = 0;
  let maxArrDelayMin = 0;
  let paxDelayMinutes = 0;
  let cancelledPax = 0;
  const airportsAffectedSet = new Set<string>();
  const tailsAffectedSet = new Set<string>();
  const usedSpareTails = new Set<string>();

  const perAirport: Record<string, { delayedDepartures: number; delayedArrivals: number; totalDelayMin: number }> = {};
  for (const a of network.airports) {
    perAirport[a.id] = { delayedDepartures: 0, delayedArrivals: 0, totalDelayMin: 0 };
  }

  for (const f of flightResults) {
    const rawF = flightMap.get(f.flightId)!;
    if (f.cancelled) {
      cancelledFlights++;
      cancelledPax += rawF.pax;
      airportsAffectedSet.add(f.origin);
      airportsAffectedSet.add(f.destination);
      tailsAffectedSet.add(f.tailId);
      continue;
    }

    if (spareMap.has(f.tailId)) {
      usedSpareTails.add(f.tailId);
    }

    if (f.arrDelay > 0) {
      delayedFlights++;
      tailsAffectedSet.add(f.tailId);
      totalArrDelayMin += f.arrDelay;
      airportsAffectedSet.add(f.destination);
      perAirport[f.destination].delayedArrivals++;
      perAirport[f.destination].totalDelayMin += f.arrDelay;
      if (f.arrDelay > maxArrDelayMin) {
        maxArrDelayMin = f.arrDelay;
      }
    }

    if (f.depDelay > 0) {
      totalDepDelayMin += f.depDelay;
      airportsAffectedSet.add(f.origin);
      perAirport[f.origin].delayedDepartures++;
      perAirport[f.origin].totalDelayMin += f.depDelay;
    }

    paxDelayMinutes += f.arrDelay * rawF.pax;
  }

  let missedConnections = 0;
  let missedConnectionPax = 0;
  for (const conn of connectionResults) {
    if (conn.status === 'MISSED') {
      missedConnections++;
      missedConnectionPax += conn.strandedPax;
    }
  }

  const strandedPaxTotal = cancelledPax + missedConnectionPax;

  let crewBreaches = 0;
  let crewBreachExcessMin = 0;
  for (const cr of crewResults) {
    if (cr.breach) {
      crewBreaches++;
      crewBreachExcessMin += cr.excessMin;
    }
  }

  const metrics: Metrics = {
    totalFlights: flightResults.length,
    delayedFlights,
    cancelledFlights,
    totalDepDelayMin,
    totalArrDelayMin,
    maxArrDelayMin,
    paxDelayMinutes,
    cancelledPax,
    missedConnectionPax,
    strandedPaxTotal,
    strandedPaxVsBaseline: strandedPaxTotal, // baseline stranded pax is 0
    missedConnections,
    crewBreaches,
    crewBreachExcessMin,
    airportsAffected: Array.from(airportsAffectedSet).sort(),
    tailsAffected: Array.from(tailsAffectedSet).sort(),
    propagationDepthMax: 0,
    spareAircraftUsed: usedSpareTails.size
  };

  return {
    engineVersion: '1.0.0',
    scenarioFingerprint: '',
    flights: flightResults,
    connections: connectionResults,
    crews: crewResults,
    metrics,
    perAirport,
    propagationEdges: [],
    warnings: []
  };
}
