import { FlightNetworkData, Scenario, Minute } from './types';
import { parseTimeToMinutes } from './time';

export interface ActionValidationResult {
  valid: boolean;
  reasons: string[];
}

export class ActionValidationError extends Error {
  public readonly reasons: string[];

  constructor(reasons: string[]) {
    super(`Action validation failed: ${reasons.join('; ')}`);
    this.name = 'ActionValidationError';
    this.reasons = reasons;
  }
}

export interface EffectiveFlightAssignment {
  flightId: string;
  originalTailId: string;
  effectiveTailId: string;
  crewId: string;
  cancelled: boolean;
  isSpare: boolean;
  isFirstOnSpare: boolean;
  spareAvailableFrom?: Minute;
}

export interface EffectiveAssignments {
  assignments: Map<string, EffectiveFlightAssignment>;
  tailChains: Map<string, string[]>; // tailId -> ordered active flightIds
  crewChains: Map<string, string[]>; // crewId -> ordered active flightIds
  standbyCrews: { crewId: string; tailId: string; firstSchedDep: Minute; spareCrewReportMin: number }[];
}

/**
 * Validates scenario actions against network constraints.
 * Deterministic and human-readable error reasons.
 */
export function validateActions(
  network: FlightNetworkData,
  scenario: Scenario
): ActionValidationResult {
  const reasons: string[] = [];
  const actions = scenario.actions ?? [];
  if (actions.length === 0) {
    return { valid: true, reasons: [] };
  }

  const flightMap = new Map(network.flights.map((f) => [f.flight_id, f]));
  const spareMap = new Map(network.spare_aircraft.map((s) => [s.tail_id, s]));
  const originalTailSet = new Set(network.flights.map((f) => f.tail_id));

  const cancelledFlightIds = new Set<string>();
  const usedSpareTails = new Set<string>();
  const swappedOriginalTails = new Set<string>();
  const swappedFlightIds = new Set<string>();

  for (const action of actions) {
    if (action.type === 'CANCEL') {
      if (!action.flightIds || action.flightIds.length === 0) {
        reasons.push('CANCEL action must specify at least one flightId');
        continue;
      }
      for (const fid of action.flightIds) {
        if (!flightMap.has(fid)) {
          reasons.push(`Unknown flightId in CANCEL action: ${fid}`);
          continue;
        }
        if (cancelledFlightIds.has(fid)) {
          reasons.push(`Flight ${fid} is cancelled multiple times`);
        }
        cancelledFlightIds.add(fid);
      }
    } else if (action.type === 'SWAP_SPARE') {
      const flight = flightMap.get(action.flightId);
      if (!flight) {
        reasons.push(`Unknown flightId in SWAP_SPARE action: ${action.flightId}`);
        continue;
      }
      const spare = spareMap.get(action.spareTail);
      if (!spare) {
        reasons.push(`Unknown spareTail in SWAP_SPARE action: ${action.spareTail}`);
        continue;
      }
      if (usedSpareTails.has(action.spareTail)) {
        reasons.push(`Spare aircraft ${action.spareTail} is already used in another action`);
      }
      usedSpareTails.add(action.spareTail);

      if (swappedOriginalTails.has(flight.tail_id)) {
        reasons.push(`Tail ${flight.tail_id} already has a spare swap action`);
      }
      swappedOriginalTails.add(flight.tail_id);
      swappedFlightIds.add(action.flightId);

      // flight.origin == spare.base
      if (flight.origin !== spare.base) {
        reasons.push(
          `Spare ${action.spareTail} base (${spare.base}) does not match flight ${action.flightId} origin (${flight.origin})`
        );
      }

      // flight's original tail is not a spare
      if (!originalTailSet.has(flight.tail_id)) {
        reasons.push(`Flight ${action.flightId} belongs to a spare tail, cannot swap spare`);
      }
    }
  }

  // A flight cannot be both cancelled and the trigger of a spare swap
  for (const fid of swappedFlightIds) {
    if (cancelledFlightIds.has(fid)) {
      reasons.push(`Flight ${fid} cannot be both cancelled and swapped to a spare`);
    }
  }

  // Decision time check: actions may not touch flights whose scheduled departure is prior to decisionTime
  if (scenario.decisionTime !== undefined) {
    for (const fid of cancelledFlightIds) {
      const f = flightMap.get(fid);
      if (f && parseTimeToMinutes(f.dep) < scenario.decisionTime) {
        reasons.push(
          `Cannot cancel flight ${fid} scheduled before decisionTime (${scenario.decisionTime})`
        );
      }
    }
    for (const fid of swappedFlightIds) {
      const f = flightMap.get(fid);
      if (f && parseTimeToMinutes(f.dep) < scenario.decisionTime) {
        reasons.push(
          `Cannot swap spare on flight ${fid} scheduled before decisionTime (${scenario.decisionTime})`
        );
      }
    }
  }

  // Geographic continuity check for CANCEL actions on every tail
  // Group original flights by tail ordered by leg_order
  const flightsByTail = new Map<string, typeof network.flights>();
  for (const flight of network.flights) {
    const list = flightsByTail.get(flight.tail_id) ?? [];
    list.push(flight);
    flightsByTail.set(flight.tail_id, list);
  }

  for (const [, legs] of flightsByTail.entries()) {
    const sorted = [...legs].sort((a, b) => a.leg_order - b.leg_order);
    const remaining = sorted.filter((f) => !cancelledFlightIds.has(f.flight_id));

    if (remaining.length <= 1) {
      continue;
    }

    for (let i = 0; i < remaining.length - 1; i++) {
      const curr = remaining[i];
      const next = remaining[i + 1];
      if (curr.destination !== next.origin) {
        reasons.push(`aircraft would be stranded at ${curr.destination}`);
      }
    }
  }

  return {
    valid: reasons.length === 0,
    reasons
  };
}

/**
 * Applies validated actions to build effective flight, tail, and crew assignments.
 */
export function buildEffectiveAssignments(
  network: FlightNetworkData,
  scenario: Scenario
): EffectiveAssignments {
  const actions = scenario.actions ?? [];
  const validation = validateActions(network, scenario);
  if (!validation.valid) {
    throw new ActionValidationError(validation.reasons);
  }

  const cancelledFlightIds = new Set<string>();
  const spareSwaps = new Map<string, { flightId: string; spareTail: string }>();

  for (const a of actions) {
    if (a.type === 'CANCEL') {
      for (const fid of a.flightIds) {
        cancelledFlightIds.add(fid);
      }
    } else if (a.type === 'SWAP_SPARE') {
      spareSwaps.set(a.flightId, a);
    }
  }

  const spareMap = new Map(network.spare_aircraft.map((s) => [s.tail_id, s]));
  const assignments = new Map<string, EffectiveFlightAssignment>();
  const tailChains = new Map<string, string[]>();
  const crewChains = new Map<string, string[]>();
  const standbyCrews: { crewId: string; tailId: string; firstSchedDep: Minute; spareCrewReportMin: number }[] = [];

  // Map each flight to its original crew
  const flightToCrew = new Map<string, string>();
  for (const crew of network.crews) {
    for (const fid of crew.flight_ids) {
      flightToCrew.set(fid, crew.crew_id);
    }
  }

  // Group flights by original tail
  const flightsByTail = new Map<string, typeof network.flights>();
  for (const flight of network.flights) {
    const list = flightsByTail.get(flight.tail_id) ?? [];
    list.push(flight);
    flightsByTail.set(flight.tail_id, list);
  }

  const spareReportMin = scenario.config?.spareCrewReportMin ?? 60;

  for (const [tailId, legs] of flightsByTail.entries()) {
    const sorted = [...legs].sort((a, b) => a.leg_order - b.leg_order);

    let activeSpareTail: string | null = null;
    let activeStandbyCrewId: string | null = null;

    for (const flight of sorted) {
      const fid = flight.flight_id;
      const isCancelled = cancelledFlightIds.has(fid);
      const originalCrew = flightToCrew.get(fid) ?? `CR-${tailId}`;

      // Check if this flight initiates a spare swap
      const swap = spareSwaps.get(fid);
      let isFirstOnSpare = false;

      if (swap) {
        activeSpareTail = swap.spareTail;
        activeStandbyCrewId = `CR-STANDBY-${swap.spareTail}`;
        isFirstOnSpare = true;

        const schedDep = parseTimeToMinutes(flight.dep);
        standbyCrews.push({
          crewId: activeStandbyCrewId,
          tailId: activeSpareTail,
          firstSchedDep: schedDep,
          spareCrewReportMin: spareReportMin
        });
      }

      if (activeSpareTail !== null) {
        // Flight runs on spare with standby crew
        const spareObj = spareMap.get(activeSpareTail);
        const spareAvail = spareObj ? parseTimeToMinutes(spareObj.available_from) : 300;

        assignments.set(fid, {
          flightId: fid,
          originalTailId: tailId,
          effectiveTailId: activeSpareTail,
          crewId: activeStandbyCrewId!,
          cancelled: isCancelled,
          isSpare: true,
          isFirstOnSpare,
          spareAvailableFrom: isFirstOnSpare ? spareAvail : undefined
        });

        if (!isCancelled) {
          const tcList = tailChains.get(activeSpareTail) ?? [];
          tcList.push(fid);
          tailChains.set(activeSpareTail, tcList);

          const ccList = crewChains.get(activeStandbyCrewId!) ?? [];
          ccList.push(fid);
          crewChains.set(activeStandbyCrewId!, ccList);
        }
      } else {
        // Flight runs on original tail with original crew
        assignments.set(fid, {
          flightId: fid,
          originalTailId: tailId,
          effectiveTailId: tailId,
          crewId: originalCrew,
          cancelled: isCancelled,
          isSpare: false,
          isFirstOnSpare: false
        });

        if (!isCancelled) {
          const tcList = tailChains.get(tailId) ?? [];
          tcList.push(fid);
          tailChains.set(tailId, tcList);

          const ccList = crewChains.get(originalCrew) ?? [];
          ccList.push(fid);
          crewChains.set(originalCrew, ccList);
        }
      }
    }
  }

  return {
    assignments,
    tailChains,
    crewChains,
    standbyCrews
  };
}
