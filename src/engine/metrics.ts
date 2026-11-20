import {
  ConnectionResult,
  CrewResult,
  FlightNetworkData,
  FlightResult,
  Metrics,
  PropagationEdge
} from './types';

export function computeMetrics(
  network: FlightNetworkData,
  flights: FlightResult[],
  connections: ConnectionResult[],
  crews: CrewResult[],
  baselineStrandedPax: number = 0
): {
  metrics: Metrics;
  perAirport: Record<string, { delayedDepartures: number; delayedArrivals: number; totalDelayMin: number }>;
  propagationEdges: PropagationEdge[];
} {
  // Flight map to look up original passenger counts
  const flightDataMap = new Map(network.flights.map((f) => [f.flight_id, f]));
  const spareTailSet = new Set(network.spare_aircraft.map((s) => s.tail_id));

  const totalFlights = flights.length;
  let delayedFlights = 0;
  let cancelledFlights = 0;
  let totalDepDelayMin = 0;
  let totalArrDelayMin = 0;
  let maxArrDelayMin = 0;
  let paxDelayMinutes = 0;
  let cancelledPax = 0;

  const airportsAffectedSet = new Set<string>();
  const tailsAffectedSet = new Set<string>();
  let propagationDepthMax = 0;
  const usedSpareTails = new Set<string>();

  // Initialize perAirport record for every airport in network
  const perAirport: Record<string, { delayedDepartures: number; delayedArrivals: number; totalDelayMin: number }> = {};
  for (const airport of network.airports) {
    perAirport[airport.id] = {
      delayedDepartures: 0,
      delayedArrivals: 0,
      totalDelayMin: 0
    };
  }

  const propagationEdges: PropagationEdge[] = [];

  for (const f of flights) {
    const rawFlight = flightDataMap.get(f.flightId);
    const flightPax = rawFlight?.pax ?? 0;

    if (spareTailSet.has(f.tailId)) {
      usedSpareTails.add(f.tailId);
    }

    if (f.cancelled) {
      cancelledFlights++;
      cancelledPax += flightPax;
      tailsAffectedSet.add(f.tailId);
      airportsAffectedSet.add(f.origin);
      airportsAffectedSet.add(f.destination);
      continue;
    }

    if (f.arrDelay > 0) {
      delayedFlights++;
      tailsAffectedSet.add(f.tailId);
    }

    if (f.depDelay > 0) {
      totalDepDelayMin += f.depDelay;
      airportsAffectedSet.add(f.origin);
      if (perAirport[f.origin]) {
        perAirport[f.origin].delayedDepartures++;
        perAirport[f.origin].totalDelayMin += f.depDelay;
      }
    }

    if (f.arrDelay > 0) {
      totalArrDelayMin += f.arrDelay;
      airportsAffectedSet.add(f.destination);
      if (perAirport[f.destination]) {
        perAirport[f.destination].delayedArrivals++;
        perAirport[f.destination].totalDelayMin += f.arrDelay;
      }
      if (f.arrDelay > maxArrDelayMin) {
        maxArrDelayMin = f.arrDelay;
      }
    }

    paxDelayMinutes += f.arrDelay * flightPax;

    if (f.causeChain.length > 1) {
      const depth = f.causeChain.length - 1;
      if (depth > propagationDepthMax) {
        propagationDepthMax = depth;
      }
    }

    // Build propagation edge if flight was knock-on delayed
    if (f.primaryCause.type === 'KNOCK_ON_AIRCRAFT' && f.primaryCause.sourceFlightId) {
      propagationEdges.push({
        from: f.primaryCause.sourceFlightId,
        to: f.flightId,
        minutesTransmitted: f.depDelay,
        minutesAbsorbed: f.slackAbsorbedMin,
        via: 'AIRCRAFT'
      });
    } else if (f.primaryCause.type === 'KNOCK_ON_CREW' && f.primaryCause.sourceFlightId) {
      propagationEdges.push({
        from: f.primaryCause.sourceFlightId,
        to: f.flightId,
        minutesTransmitted: f.depDelay,
        minutesAbsorbed: f.slackAbsorbedMin,
        via: 'CREW'
      });
    }
  }

  // Connections
  let missedConnections = 0;
  let missedConnectionPax = 0;
  for (const conn of connections) {
    if (conn.status === 'MISSED') {
      missedConnections++;
      missedConnectionPax += conn.strandedPax;
    }
  }

  const strandedPaxTotal = cancelledPax + missedConnectionPax;
  const strandedPaxVsBaseline = Math.max(0, strandedPaxTotal - baselineStrandedPax);

  // Crews
  let crewBreaches = 0;
  let crewBreachExcessMin = 0;
  for (const cr of crews) {
    if (cr.breach) {
      crewBreaches++;
      crewBreachExcessMin += cr.excessMin;
    }
  }

  const metrics: Metrics = {
    totalFlights,
    delayedFlights,
    cancelledFlights,
    totalDepDelayMin,
    totalArrDelayMin,
    maxArrDelayMin,
    paxDelayMinutes,
    cancelledPax,
    missedConnectionPax,
    strandedPaxTotal,
    strandedPaxVsBaseline,
    missedConnections,
    crewBreaches,
    crewBreachExcessMin,
    airportsAffected: Array.from(airportsAffectedSet).sort(),
    tailsAffected: Array.from(tailsAffectedSet).sort(),
    propagationDepthMax,
    spareAircraftUsed: usedSpareTails.size
  };

  return {
    metrics,
    perAirport,
    propagationEdges
  };
}
