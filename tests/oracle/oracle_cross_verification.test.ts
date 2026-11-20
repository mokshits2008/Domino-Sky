import { describe, it, expect } from 'vitest';
import { loadFlightNetwork } from '@/engine/load';
import { simulate } from '@/engine/simulate';
import { relaxationSimulate } from './relaxation';
import { Action, Closure, Scenario } from '@/engine/types';

function createSeededPRNG(seed: number) {
  let s = seed >>> 0;
  return function next() {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('Independent Oracle Cross-Verification (>= 2,000 scenarios)', () => {
  const network = loadFlightNetwork();
  const airports = network.airports.map((a) => a.id);
  const spares = network.spare_aircraft;

  it('matches relaxation oracle across 2,000 randomized scenarios', () => {
    const prng = createSeededPRNG(42);
    const TOTAL_SCENARIOS = 2000;
    let matchedCount = 0;

    for (let i = 0; i < TOTAL_SCENARIOS; i++) {
      // 1-3 random closures
      const numClosures = 1 + Math.floor(prng() * 3);
      const closures: Closure[] = [];

      for (let c = 0; c < numClosures; c++) {
        const airport = airports[Math.floor(prng() * airports.length)];
        const start = 300 + Math.floor(prng() * 900); // 05:00 to 20:00
        const duration = 30 + Math.floor(prng() * 150); // 30 to 180 mins
        closures.push({
          id: `C_${i}_${c}`,
          airport,
          start,
          end: start + duration
        });
      }

      // Random arrival policy
      const arrivalPolicy = prng() < 0.5 ? 'AIRBORNE_HOLD' : 'GROUND_HOLD';

      // Random actions
      const actions: Action[] = [];
      const actionRoll = prng();

      if (actionRoll < 0.3) {
        // Valid spare swap on flights matching spare bases (BLR, DEL)
        const eligibleSpareFlights = network.flights.filter(
          (f) => f.origin === 'BLR' || f.origin === 'DEL'
        );
        if (eligibleSpareFlights.length > 0) {
          const chosenFlight = eligibleSpareFlights[Math.floor(prng() * eligibleSpareFlights.length)];
          const matchingSpare = spares.find((s) => s.base === chosenFlight.origin);
          if (matchingSpare) {
            actions.push({
              type: 'SWAP_SPARE',
              flightId: chosenFlight.flight_id,
              spareTail: matchingSpare.tail_id
            });
          }
        }
      } else if (actionRoll < 0.6) {
        // Valid suffix cancel on a random tail (last 1-2 legs)
        const validTails = ['VT-DS01', 'VT-DS02', 'VT-DS06', 'VT-DS07', 'VT-DS08', 'VT-DS10', 'VT-DS16'];
        const chosenTail = validTails[Math.floor(prng() * validTails.length)];
        const tailFlights = network.flights
          .filter((f) => f.tail_id === chosenTail)
          .sort((a, b) => a.leg_order - b.leg_order);
        const cancelLen = 1 + Math.floor(prng() * 2);
        const suffix = tailFlights.slice(tailFlights.length - cancelLen);
        actions.push({
          type: 'CANCEL',
          flightIds: suffix.map((f) => f.flight_id)
        });
      }

      const scenario: Scenario = {
        closures,
        actions,
        config: { arrivalPolicy }
      };

      const simResult = simulate(network, scenario);
      const oracleResult = relaxationSimulate(scenario, network);

      // Verify every flight
      for (let fIdx = 0; fIdx < network.flights.length; fIdx++) {
        const simF = simResult.flights[fIdx];
        const oraF = oracleResult.flights[fIdx];

        expect(simF.cancelled).toBe(oraF.cancelled);
        expect(simF.actualDep).toBe(oraF.actualDep);
        expect(simF.actualArr).toBe(oraF.actualArr);
        expect(simF.depDelay).toBe(oraF.depDelay);
        expect(simF.arrDelay).toBe(oraF.arrDelay);
      }

      // Verify all metrics
      expect(simResult.metrics.totalFlights).toBe(oracleResult.metrics.totalFlights);
      expect(simResult.metrics.delayedFlights).toBe(oracleResult.metrics.delayedFlights);
      expect(simResult.metrics.cancelledFlights).toBe(oracleResult.metrics.cancelledFlights);
      expect(simResult.metrics.totalDepDelayMin).toBe(oracleResult.metrics.totalDepDelayMin);
      expect(simResult.metrics.totalArrDelayMin).toBe(oracleResult.metrics.totalArrDelayMin);
      expect(simResult.metrics.maxArrDelayMin).toBe(oracleResult.metrics.maxArrDelayMin);
      expect(simResult.metrics.paxDelayMinutes).toBe(oracleResult.metrics.paxDelayMinutes);
      expect(simResult.metrics.cancelledPax).toBe(oracleResult.metrics.cancelledPax);
      expect(simResult.metrics.missedConnectionPax).toBe(oracleResult.metrics.missedConnectionPax);
      expect(simResult.metrics.strandedPaxTotal).toBe(oracleResult.metrics.strandedPaxTotal);
      expect(simResult.metrics.missedConnections).toBe(oracleResult.metrics.missedConnections);
      expect(simResult.metrics.crewBreaches).toBe(oracleResult.metrics.crewBreaches);
      expect(simResult.metrics.crewBreachExcessMin).toBe(oracleResult.metrics.crewBreachExcessMin);
      expect(simResult.metrics.spareAircraftUsed).toBe(oracleResult.metrics.spareAircraftUsed);

      matchedCount++;
    }

    expect(matchedCount).toBe(2000);
  });
});
