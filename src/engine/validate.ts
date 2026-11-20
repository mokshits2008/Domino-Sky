import { FlightNetworkData } from './types';
import { parseTimeToMinutes } from './time';

export interface IntegrityWarning {
  code: string;
  entity: 'airport' | 'flight' | 'crew' | 'connection' | 'spare' | 'tail';
  id?: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface NetworkIntegrityReport {
  valid: boolean;
  counts: {
    airports: number;
    flights: number;
    tails: number;
    connections: number;
    crews: number;
    spares: number;
  };
  warnings: IntegrityWarning[];
}

/**
 * Validates the loaded flight network dataset against all integrity invariants.
 * Returns a structured report; never throws silently.
 */
export function validateNetworkIntegrity(network: FlightNetworkData): NetworkIntegrityReport {
  const warnings: IntegrityWarning[] = [];

  const airportSet = new Set(network.airports.map((a) => a.id));
  const flightMap = new Map(network.flights.map((f) => [f.flight_id, f]));
  const spareSet = new Set(network.spare_aircraft.map((s) => s.tail_id));

  // Collect distinct tails from flights
  const tailSet = new Set(network.flights.map((f) => f.tail_id));

  // 1. Verify flight tails, airports, crews exist
  // Map tails to crews
  const tailToCrewMap = new Map<string, string>();
  for (const crew of network.crews) {
    tailToCrewMap.set(crew.tail_id, crew.crew_id);
  }

  for (const flight of network.flights) {
    if (!airportSet.has(flight.origin)) {
      warnings.push({
        code: 'UNKNOWN_ORIGIN_AIRPORT',
        entity: 'flight',
        id: flight.flight_id,
        message: `Flight ${flight.flight_id} references unknown origin airport ${flight.origin}`
      });
    }
    if (!airportSet.has(flight.destination)) {
      warnings.push({
        code: 'UNKNOWN_DEST_AIRPORT',
        entity: 'flight',
        id: flight.flight_id,
        message: `Flight ${flight.flight_id} references unknown destination airport ${flight.destination}`
      });
    }
    if (!tailToCrewMap.has(flight.tail_id)) {
      warnings.push({
        code: 'MISSING_CREW_FOR_TAIL',
        entity: 'flight',
        id: flight.flight_id,
        message: `Flight ${flight.flight_id} has tail ${flight.tail_id} with no associated crew`
      });
    }

    // 4. dep + block == arr
    try {
      const depMin = parseTimeToMinutes(flight.dep);
      const arrMin = parseTimeToMinutes(flight.arr);
      if (depMin + flight.block_minutes !== arrMin) {
        warnings.push({
          code: 'BLOCK_TIME_MISMATCH',
          entity: 'flight',
          id: flight.flight_id,
          message: `Flight ${flight.flight_id} dep (${flight.dep}) + block (${flight.block_minutes}m) != arr (${flight.arr})`,
          details: { depMin, block: flight.block_minutes, arrMin, calculatedArr: depMin + flight.block_minutes }
        });
      }
    } catch (err: unknown) {
      warnings.push({
        code: 'INVALID_FLIGHT_TIME',
        entity: 'flight',
        id: flight.flight_id,
        message: `Flight ${flight.flight_id} has invalid time: ${(err as Error).message}`
      });
    }
  }

  // Group flights by tail
  const flightsByTail = new Map<string, typeof network.flights>();
  for (const flight of network.flights) {
    const list = flightsByTail.get(flight.tail_id) ?? [];
    list.push(flight);
    flightsByTail.set(flight.tail_id, list);
  }

  // 2, 3, 5: Each tail chain ordering, geographic continuity, turnaround
  for (const [tailId, legs] of flightsByTail.entries()) {
    // Sort legs by leg_order to check if sequential
    const sortedLegs = [...legs].sort((a, b) => a.leg_order - b.leg_order);

    for (let i = 0; i < sortedLegs.length; i++) {
      const current = sortedLegs[i];
      if (current.leg_order !== i + 1) {
        warnings.push({
          code: 'LEG_ORDER_NON_SEQUENTIAL',
          entity: 'tail',
          id: tailId,
          message: `Tail ${tailId} leg index ${i} has leg_order ${current.leg_order}, expected ${i + 1}`
        });
      }

      if (i > 0) {
        const prev = sortedLegs[i - 1];
        // 3. destination of leg n equals origin of leg n+1
        if (prev.destination !== current.origin) {
          warnings.push({
            code: 'GEOGRAPHIC_DISCONTINUITY',
            entity: 'tail',
            id: tailId,
            message: `Tail ${tailId} leg ${prev.flight_id} destination ${prev.destination} != next leg ${current.flight_id} origin ${current.origin}`
          });
        }

        // 5. scheduled gap between legs >= 30 and equals turnaround_before_min
        try {
          const prevArr = parseTimeToMinutes(prev.arr);
          const currDep = parseTimeToMinutes(current.dep);
          const gap = currDep - prevArr;

          if (gap < network.meta.min_turnaround_minutes) {
            warnings.push({
              code: 'TURNAROUND_BELOW_MINIMUM',
              entity: 'flight',
              id: current.flight_id,
              message: `Flight ${current.flight_id} turnaround gap ${gap}m < minimum ${network.meta.min_turnaround_minutes}m`
            });
          }

          if (current.turnaround_before_min !== null && gap !== current.turnaround_before_min) {
            warnings.push({
              code: 'TURNAROUND_FIELD_MISMATCH',
              entity: 'flight',
              id: current.flight_id,
              message: `Flight ${current.flight_id} scheduled gap ${gap}m != turnaround_before_min ${current.turnaround_before_min}m`
            });
          }
        } catch {
          // Handled above in flight time validation
        }
      }
    }
  }

  // 6. each crew's flight_ids equal its tail's chain
  for (const crew of network.crews) {
    const tailLegs = flightsByTail.get(crew.tail_id) ?? [];
    const expectedFlightIds = [...tailLegs]
      .sort((a, b) => a.leg_order - b.leg_order)
      .map((f) => f.flight_id);

    const crewIdsEqual =
      crew.flight_ids.length === expectedFlightIds.length &&
      crew.flight_ids.every((id, idx) => id === expectedFlightIds[idx]);

    if (!crewIdsEqual) {
      warnings.push({
        code: 'CREW_CHAIN_MISMATCH',
        entity: 'crew',
        id: crew.crew_id,
        message: `Crew ${crew.crew_id} flight_ids do not match tail ${crew.tail_id} chain`,
        details: { crewFlightIds: crew.flight_ids, tailFlightIds: expectedFlightIds }
      });
    }

    // 9. Baseline crew duty <= max
    try {
      const dutyStartMin = parseTimeToMinutes(crew.duty_start);
      if (expectedFlightIds.length > 0) {
        const lastFlight = flightMap.get(expectedFlightIds[expectedFlightIds.length - 1]);
        if (lastFlight) {
          const dutyEndMin = parseTimeToMinutes(lastFlight.arr);
          const dutyMin = dutyEndMin - dutyStartMin;
          if (dutyMin > crew.max_duty_mins) {
            warnings.push({
              code: 'BASELINE_CREW_DUTY_BREACH',
              entity: 'crew',
              id: crew.crew_id,
              message: `Crew ${crew.crew_id} baseline duty ${dutyMin}m exceeds max ${crew.max_duty_mins}m`,
              details: { dutyStartMin, dutyEndMin, dutyMin, maxDutyMins: crew.max_duty_mins }
            });
          }
        }
      }
    } catch (err: unknown) {
      warnings.push({
        code: 'INVALID_CREW_TIME',
        entity: 'crew',
        id: crew.crew_id,
        message: `Crew ${crew.crew_id} invalid time: ${(err as Error).message}`
      });
    }
  }

  // 7 & 8: Connections validation
  for (const conn of network.connections) {
    const fromF = flightMap.get(conn.from_flight);
    const toF = flightMap.get(conn.to_flight);

    if (!fromF) {
      warnings.push({
        code: 'UNKNOWN_CONNECTION_FROM_FLIGHT',
        entity: 'connection',
        id: conn.connection_id,
        message: `Connection ${conn.connection_id} references unknown from_flight ${conn.from_flight}`
      });
    }
    if (!toF) {
      warnings.push({
        code: 'UNKNOWN_CONNECTION_TO_FLIGHT',
        entity: 'connection',
        id: conn.connection_id,
        message: `Connection ${conn.connection_id} references unknown to_flight ${conn.to_flight}`
      });
    }

    if (fromF && toF) {
      // 7. airport equals from_flight.destination and to_flight.origin
      if (conn.airport !== fromF.destination || conn.airport !== toF.origin) {
        warnings.push({
          code: 'CONNECTION_AIRPORT_MISMATCH',
          entity: 'connection',
          id: conn.connection_id,
          message: `Connection ${conn.connection_id} airport ${conn.airport} does not match from destination (${fromF.destination}) or to origin (${toF.origin})`
        });
      }

      // 8. BASELINE connections are all feasible (gap >= min_connect_minutes)
      try {
        const fromArr = parseTimeToMinutes(fromF.arr);
        const toDep = parseTimeToMinutes(toF.dep);
        const gap = toDep - fromArr;
        if (gap < conn.min_connect_minutes) {
          warnings.push({
            code: 'BASELINE_CONNECTION_INFEASIBLE',
            entity: 'connection',
            id: conn.connection_id,
            message: `Connection ${conn.connection_id} baseline gap ${gap}m < min_connect_minutes ${conn.min_connect_minutes}m`,
            details: { fromArr, toDep, gap, minConnectMinutes: conn.min_connect_minutes }
          });
        }
      } catch {
        // Handled in flight time validation
      }
    }
  }

  // Spares validation
  for (const spare of network.spare_aircraft) {
    if (!airportSet.has(spare.base)) {
      warnings.push({
        code: 'UNKNOWN_SPARE_BASE',
        entity: 'spare',
        id: spare.tail_id,
        message: `Spare ${spare.tail_id} references unknown base airport ${spare.base}`
      });
    }
    try {
      parseTimeToMinutes(spare.available_from);
    } catch (err: unknown) {
      warnings.push({
        code: 'INVALID_SPARE_TIME',
        entity: 'spare',
        id: spare.tail_id,
        message: `Spare ${spare.tail_id} has invalid available_from: ${(err as Error).message}`
      });
    }
  }

  return {
    valid: warnings.length === 0,
    counts: {
      airports: network.airports.length,
      flights: network.flights.length,
      tails: tailSet.size,
      connections: network.connections.length,
      crews: network.crews.length,
      spares: spareSet.size
    },
    warnings
  };
}
