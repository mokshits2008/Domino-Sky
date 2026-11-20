import {
  Action,
  FlightNetworkData,
  FlightResult,
  Metrics,
  Scenario,
  SimulationResult
} from './types';
import { simulate } from './simulate';
import { validateActions } from './actions';
import { calculateScore, ScoreBreakdown } from './score';

export interface RecoveryPlan {
  id: string;
  actions: Action[];
  score: number;
  scoreBreakdown: ScoreBreakdown;
  beforeMetrics: Metrics;
  afterMetrics: Metrics;
  deltas: {
    totalArrDelayMin: number;
    totalDepDelayMin: number;
    delayedFlights: number;
    cancelledFlights: number;
    strandedPaxTotal: number;
    missedConnections: number;
    crewBreaches: number;
    crewBreachExcessMin: number;
    spareAircraftUsed: number;
  };
  flightDiffs: {
    flightId: string;
    beforeArrDelay: number;
    afterArrDelay: number;
    diffMin: number; // before - after (positive means improved)
    status: 'IMPROVED' | 'RESOLVED' | 'WORSENED' | 'CANCELLED';
  }[];
  crewChanges: {
    crewId: string;
    beforeBreach: boolean;
    afterBreach: boolean;
    beforeDutyMin: number;
    afterDutyMin: number;
  }[];
  connectionChanges: {
    connectionId: string;
    beforeStatus: string;
    afterStatus: string;
    passengers: number;
  }[];
  tradeoffs: string[];
}

/**
 * Enumerates all valid single recovery action candidates for a disrupted network.
 * Prunes no-ops: only considers actions touching delayed flights or breaching crews.
 */
export function enumerateCandidates(
  network: FlightNetworkData,
  scenario: Scenario,
  currentSimResult?: SimulationResult
): Action[] {
  const currentResult = currentSimResult ?? simulate(network, scenario);
  const existingActions = scenario.actions ?? [];

  // Identify flights with delay and tails with breaches
  const delayedFlightIds = new Set<string>();
  const affectedTailIds = new Set<string>();

  for (const f of currentResult.flights) {
    if (!f.cancelled && f.arrDelay > 0) {
      delayedFlightIds.add(f.flightId);
      affectedTailIds.add(f.tailId);
    }
  }

  for (const cr of currentResult.crews) {
    if (cr.breach) {
      affectedTailIds.add(cr.tailId);
    }
  }

  // If no delays or breaches, no recovery actions needed
  if (affectedTailIds.size === 0) {
    return [];
  }

  const spareMap = new Map(network.spare_aircraft.map((s) => [s.tail_id, s]));
  const usedSpares = new Set<string>();
  for (const a of existingActions) {
    if (a.type === 'SWAP_SPARE') {
      usedSpares.add(a.spareTail);
    }
  }

  const candidates: Action[] = [];

  // Group flights by effective tail
  const flightsByTail = new Map<string, FlightResult[]>();
  for (const f of currentResult.flights) {
    if (!f.cancelled) {
      const list = flightsByTail.get(f.tailId) ?? [];
      list.push(f);
      flightsByTail.set(f.tailId, list);
    }
  }

  for (const tailId of affectedTailIds) {
    const tailFlights = flightsByTail.get(tailId) ?? [];
    if (tailFlights.length === 0) continue;

    // 1. Suffix cancels of length 1..4
    for (let len = 1; len <= Math.min(4, tailFlights.length); len++) {
      const suffix = tailFlights.slice(tailFlights.length - len);
      const flightIds = suffix.map((f) => f.flightId);

      // Only candidate if it touches at least one delayed flight or breaching tail
      const touchesDelay = suffix.some((f) => delayedFlightIds.has(f.flightId));
      if (!touchesDelay && !currentResult.crews.some((c) => c.tailId === tailId && c.breach)) {
        continue;
      }

      const action: Action = { type: 'CANCEL', flightIds };
      const val = validateActions(network, {
        ...scenario,
        actions: [...existingActions, action]
      });
      if (val.valid) {
        candidates.push(action);
      }
    }

    // 2. Out-and-back contiguous run cancels of length 2 or 4
    for (let runLen = 2; runLen <= Math.min(4, tailFlights.length); runLen += 2) {
      for (let i = 0; i <= tailFlights.length - runLen; i++) {
        const run = tailFlights.slice(i, i + runLen);
        const flightIds = run.map((f) => f.flightId);

        // Check if run forms out-and-back
        if (run[0].origin === run[run.length - 1].destination) {
          const touchesDelay = run.some((f) => delayedFlightIds.has(f.flightId));
          if (!touchesDelay) continue;

          const action: Action = { type: 'CANCEL', flightIds };
          const val = validateActions(network, {
            ...scenario,
            actions: [...existingActions, action]
          });
          if (val.valid) {
            candidates.push(action);
          }
        }
      }
    }

    // 3. SWAP_SPARE candidates
    for (const f of tailFlights) {
      for (const [spareTail, spare] of spareMap.entries()) {
        if (usedSpares.has(spareTail)) continue;
        if (f.origin === spare.base) {
          const action: Action = { type: 'SWAP_SPARE', flightId: f.flightId, spareTail };
          const val = validateActions(network, {
            ...scenario,
            actions: [...existingActions, action]
          });
          if (val.valid) {
            candidates.push(action);
          }
        }
      }
    }
  }

  // Deduplicate candidates by JSON signature
  const uniqueMap = new Map<string, Action>();
  for (const c of candidates) {
    const key = JSON.stringify(c);
    if (!uniqueMap.has(key)) {
      uniqueMap.set(key, c);
    }
  }

  return Array.from(uniqueMap.values());
}

interface BeamSearchNode {
  actions: Action[];
  simResult: SimulationResult;
  score: number;
  breakdown: ScoreBreakdown;
}

/**
 * Recommends optimal recovery plans using deterministic beam search (beam width 5, depth up to maxActions).
 */
export function recommendRecoveryPlans(
  network: FlightNetworkData,
  scenario: Scenario,
  maxActions: number = 3
): {
  disruptedResult: SimulationResult;
  rankedPlans: RecoveryPlan[];
} {
  const disruptedResult = simulate(network, scenario);
  const initialScore = calculateScore(disruptedResult.metrics, scenario.config?.scoreWeights);

  const initialNode: BeamSearchNode = {
    actions: scenario.actions ?? [],
    simResult: disruptedResult,
    score: initialScore.score,
    breakdown: initialScore.breakdown
  };

  let currentBeam: BeamSearchNode[] = [initialNode];
  const allImprovedNodes: BeamSearchNode[] = [];

  for (let depth = 1; depth <= maxActions; depth++) {
    const nextCandidates: BeamSearchNode[] = [];

    for (const node of currentBeam) {
      const singleCandidates = enumerateCandidates(
        network,
        { ...scenario, actions: node.actions },
        node.simResult
      );

      for (const cand of singleCandidates) {
        const nextActions = [...node.actions, cand];
        const nextSim = simulate(network, { ...scenario, actions: nextActions });
        const nextScore = calculateScore(nextSim.metrics, scenario.config?.scoreWeights);

        // Only keep if it improves score over the parent node
        if (nextScore.score < node.score) {
          nextCandidates.push({
            actions: nextActions,
            simResult: nextSim,
            score: nextScore.score,
            breakdown: nextScore.breakdown
          });
        }
      }
    }

    if (nextCandidates.length === 0) {
      break;
    }

    // Sort next candidates: lower score, fewer actions, deterministic signature
    nextCandidates.sort((a, b) => {
      if (Math.abs(a.score - b.score) > 1e-6) {
        return a.score - b.score;
      }
      if (a.actions.length !== b.actions.length) {
        return a.actions.length - b.actions.length;
      }
      return JSON.stringify(a.actions).localeCompare(JSON.stringify(b.actions));
    });

    // Deduplicate by action signature
    const seen = new Set<string>();
    const filteredNext: BeamSearchNode[] = [];
    for (const n of nextCandidates) {
      const sig = JSON.stringify(n.actions);
      if (!seen.has(sig)) {
        seen.add(sig);
        filteredNext.push(n);
        allImprovedNodes.push(n);
      }
    }

    // Take top beam width 5
    currentBeam = filteredNext.slice(0, 5);
  }

  // Sort all unique improved nodes
  const uniqueImproved = new Map<string, BeamSearchNode>();
  for (const n of allImprovedNodes) {
    const sig = JSON.stringify(n.actions);
    const existing = uniqueImproved.get(sig);
    if (!existing || n.score < existing.score) {
      uniqueImproved.set(sig, n);
    }
  }

  const sortedNodes = Array.from(uniqueImproved.values()).sort((a, b) => {
    if (Math.abs(a.score - b.score) > 1e-6) {
      return a.score - b.score;
    }
    if (a.actions.length !== b.actions.length) {
      return a.actions.length - b.actions.length;
    }
    return JSON.stringify(a.actions).localeCompare(JSON.stringify(b.actions));
  });

  // Construct recovery plan outputs
  const rankedPlans: RecoveryPlan[] = sortedNodes.slice(0, 5).map((node, index) => {
    const planId = `plan-${index + 1}`;
    const before = disruptedResult.metrics;
    const after = node.simResult.metrics;

    const deltas = {
      totalArrDelayMin: after.totalArrDelayMin - before.totalArrDelayMin,
      totalDepDelayMin: after.totalDepDelayMin - before.totalDepDelayMin,
      delayedFlights: after.delayedFlights - before.delayedFlights,
      cancelledFlights: after.cancelledFlights - before.cancelledFlights,
      strandedPaxTotal: after.strandedPaxTotal - before.strandedPaxTotal,
      missedConnections: after.missedConnections - before.missedConnections,
      crewBreaches: after.crewBreaches - before.crewBreaches,
      crewBreachExcessMin: after.crewBreachExcessMin - before.crewBreachExcessMin,
      spareAircraftUsed: after.spareAircraftUsed - before.spareAircraftUsed
    };

    // Flight diffs
    const beforeFlightMap = new Map(disruptedResult.flights.map((f) => [f.flightId, f]));
    const flightDiffs: RecoveryPlan['flightDiffs'] = [];

    for (const afterF of node.simResult.flights) {
      const beforeF = beforeFlightMap.get(afterF.flightId)!;
      if (afterF.cancelled) {
        flightDiffs.push({
          flightId: afterF.flightId,
          beforeArrDelay: beforeF.arrDelay,
          afterArrDelay: 0,
          diffMin: beforeF.arrDelay,
          status: 'CANCELLED'
        });
      } else if (beforeF.arrDelay !== afterF.arrDelay) {
        const diff = beforeF.arrDelay - afterF.arrDelay;
        flightDiffs.push({
          flightId: afterF.flightId,
          beforeArrDelay: beforeF.arrDelay,
          afterArrDelay: afterF.arrDelay,
          diffMin: diff,
          status: diff > 0 ? (afterF.arrDelay === 0 ? 'RESOLVED' : 'IMPROVED') : 'WORSENED'
        });
      }
    }

    // Crew changes
    const beforeCrewMap = new Map(disruptedResult.crews.map((c) => [c.crewId, c]));
    const crewChanges: RecoveryPlan['crewChanges'] = [];
    for (const afterC of node.simResult.crews) {
      const beforeC = beforeCrewMap.get(afterC.crewId);
      if (!beforeC || beforeC.breach !== afterC.breach || beforeC.dutyMin !== afterC.dutyMin) {
        crewChanges.push({
          crewId: afterC.crewId,
          beforeBreach: beforeC?.breach ?? false,
          afterBreach: afterC.breach,
          beforeDutyMin: beforeC?.dutyMin ?? 0,
          afterDutyMin: afterC.dutyMin
        });
      }
    }

    // Connection changes
    const beforeConnMap = new Map(disruptedResult.connections.map((c) => [c.connectionId, c]));
    const connectionChanges: RecoveryPlan['connectionChanges'] = [];
    for (const afterConn of node.simResult.connections) {
      const beforeConn = beforeConnMap.get(afterConn.connectionId)!;
      if (beforeConn.status !== afterConn.status) {
        connectionChanges.push({
          connectionId: afterConn.connectionId,
          beforeStatus: beforeConn.status,
          afterStatus: afterConn.status,
          passengers: afterConn.passengers
        });
      }
    }

    // Compute deterministic tradeoffs
    const tradeoffs: string[] = [];
    if (deltas.totalArrDelayMin < 0) {
      tradeoffs.push(`Reduced arrival delay by ${Math.abs(deltas.totalArrDelayMin)} minutes`);
    }
    if (deltas.crewBreaches < 0) {
      tradeoffs.push(`Eliminated ${Math.abs(deltas.crewBreaches)} crew breach`);
    }
    if (deltas.strandedPaxTotal < 0) {
      tradeoffs.push(`Prevented ${Math.abs(deltas.strandedPaxTotal)} stranded passengers`);
    }
    if (deltas.cancelledFlights > 0) {
      const addedCancelledPax = after.cancelledPax - before.cancelledPax;
      tradeoffs.push(`Cancelled ${deltas.cancelledFlights} flights (+${addedCancelledPax} cancelled pax)`);
    }
    if (deltas.spareAircraftUsed > 0) {
      tradeoffs.push(`Deployed ${deltas.spareAircraftUsed} spare aircraft`);
    }

    return {
      id: planId,
      actions: node.actions,
      score: node.score,
      scoreBreakdown: node.breakdown,
      beforeMetrics: before,
      afterMetrics: after,
      deltas,
      flightDiffs,
      crewChanges,
      connectionChanges,
      tradeoffs
    };
  });

  return {
    disruptedResult,
    rankedPlans
  };
}
