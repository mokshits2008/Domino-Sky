import { ConnectionData, ConnectionResult, FlightResult } from './types';

export function evaluateConnections(
  connections: ConnectionData[],
  flights: FlightResult[]
): ConnectionResult[] {
  const flightMap = new Map<string, FlightResult>();
  for (const f of flights) {
    flightMap.set(f.flightId, f);
  }

  const results: ConnectionResult[] = [];

  for (const conn of connections) {
    const fromF = flightMap.get(conn.from_flight);
    const toF = flightMap.get(conn.to_flight);

    // If to-flight is cancelled, pax are already counted in to-flight cancelledPax
    if (toF?.cancelled) {
      results.push({
        connectionId: conn.connection_id,
        airport: conn.airport,
        fromFlight: conn.from_flight,
        toFlight: conn.to_flight,
        passengers: conn.passengers,
        minConnect: conn.min_connect_minutes,
        gapMin: null,
        status: 'TO_CANCELLED',
        strandedPax: 0
      });
      continue;
    }

    // If from-flight is cancelled (and to-flight is not cancelled), pax miss connection
    if (fromF?.cancelled) {
      results.push({
        connectionId: conn.connection_id,
        airport: conn.airport,
        fromFlight: conn.from_flight,
        toFlight: conn.to_flight,
        passengers: conn.passengers,
        minConnect: conn.min_connect_minutes,
        gapMin: null,
        status: 'MISSED',
        reason: 'FROM_CANCELLED',
        strandedPax: conn.passengers
      });
      continue;
    }

    // Both flights operate
    if (fromF && toF && fromF.actualArr !== null && toF.actualDep !== null) {
      const gapMin = toF.actualDep - fromF.actualArr;
      // Equality CONNECTS (gap >= min_connect_minutes)
      if (gapMin >= conn.min_connect_minutes) {
        results.push({
          connectionId: conn.connection_id,
          airport: conn.airport,
          fromFlight: conn.from_flight,
          toFlight: conn.to_flight,
          passengers: conn.passengers,
          minConnect: conn.min_connect_minutes,
          gapMin,
          status: 'CONNECTED',
          strandedPax: 0
        });
      } else {
        results.push({
          connectionId: conn.connection_id,
          airport: conn.airport,
          fromFlight: conn.from_flight,
          toFlight: conn.to_flight,
          passengers: conn.passengers,
          minConnect: conn.min_connect_minutes,
          gapMin,
          status: 'MISSED',
          reason: 'INSUFFICIENT_TIME',
          strandedPax: conn.passengers
        });
      }
    } else {
      // Defensive fallback if flight results are incomplete
      results.push({
        connectionId: conn.connection_id,
        airport: conn.airport,
        fromFlight: conn.from_flight,
        toFlight: conn.to_flight,
        passengers: conn.passengers,
        minConnect: conn.min_connect_minutes,
        gapMin: null,
        status: 'MISSED',
        reason: 'INSUFFICIENT_TIME',
        strandedPax: conn.passengers
      });
    }
  }

  return results;
}
