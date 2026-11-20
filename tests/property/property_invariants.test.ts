import { describe, it, expect } from 'vitest';
import { loadFlightNetwork } from '@/engine/load';
import { simulate, simulateBaseline } from '@/engine/simulate';
import { Closure, FlightNetworkData, Scenario } from '@/engine/types';
import { parseTimeToMinutes, formatMinutesToTime } from '@/engine/time';

function createPRNG(seed: number) {
  let s = seed >>> 0;
  return function next() {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function deepFreeze<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  Object.freeze(obj);
  for (const key of Object.keys(obj as object)) {
    const val = (obj as Record<string, unknown>)[key];
    if (val && typeof val === 'object' && !Object.isFrozen(val)) {
      deepFreeze(val);
    }
  }
  return obj;
}

describe('Property Tests (>= 1,000 randomized scenarios each)', () => {
  const network = loadFlightNetwork();
  const airports = network.airports.map((a) => a.id);
  const totalNetworkPax = network.flights.reduce((sum, f) => sum + f.pax, 0);

  it('Property 1 & 2 & 3 & 4 & 7 & 11: Core invariants across 1,000 scenarios', () => {
    const prng = createPRNG(101);
    const ITERATIONS = 1000;

    for (let i = 0; i < ITERATIONS; i++) {
      const numClosures = 1 + Math.floor(prng() * 3);
      const closures: Closure[] = [];
      for (let c = 0; c < numClosures; c++) {
        const airport = airports[Math.floor(prng() * airports.length)];
        const start = 300 + Math.floor(prng() * 900);
        const duration = 30 + Math.floor(prng() * 120);
        closures.push({
          id: `C_${i}_${c}`,
          airport,
          start,
          end: start + duration
        });
      }

      const arrivalPolicy = prng() < 0.5 ? 'AIRBORNE_HOLD' : 'GROUND_HOLD';
      const scenario: Scenario = {
        closures,
        config: { arrivalPolicy }
      };

      const result = simulate(network, scenario);

      // Map non-cancelled flights by tail
      const flightsByTail = new Map<string, typeof result.flights>();

      for (const f of result.flights) {
        if (f.cancelled) {
          expect(f.actualDep).toBeNull();
          expect(f.actualArr).toBeNull();
          continue;
        }

        // P1: actual >= scheduled for all flights
        expect(f.actualDep!).toBeGreaterThanOrEqual(f.schedDep);
        expect(f.actualArr!).toBeGreaterThanOrEqual(f.schedArr);
        expect(f.depDelay).toBeGreaterThanOrEqual(0);
        expect(f.arrDelay).toBeGreaterThanOrEqual(0);

        // P3: no actual departure inside origin's closure window [s, e)
        for (const c of closures) {
          if (c.airport === f.origin) {
            const inWindow = f.actualDep! >= c.start && f.actualDep! < c.end;
            expect(inWindow).toBe(false);
          }
        }

        // P4: under AIRBORNE_HOLD no arrival inside destination's closure window
        if (arrivalPolicy === 'AIRBORNE_HOLD') {
          for (const c of closures) {
            if (c.airport === f.destination) {
              const inWindow = f.actualArr! >= c.start && f.actualArr! < c.end;
              expect(inWindow).toBe(false);
            }
          }
        }

        // P11: every explanation string's numbers match its own struct
        const explanationNums = f.explanation.match(/\d+/g) || [];
        const allowedNumbers = new Set<string>();

        // Numbers extracted from flight properties
        const idNum = f.flightId.match(/\d+/);
        if (idNum) allowedNumbers.add(idNum[0]);

        if (f.primaryCause.sourceFlightId) {
          const srcNum = f.primaryCause.sourceFlightId.match(/\d+/);
          if (srcNum) allowedNumbers.add(srcNum[0]);
        }

        allowedNumbers.add(f.depDelay.toString());
        allowedNumbers.add(f.arrDelay.toString());
        allowedNumbers.add(f.arrivalHoldMin.toString());
        allowedNumbers.add(f.slackAbsorbedMin.toString());
        allowedNumbers.add(f.primaryCause.minutes.toString());

        // HH:MM formatted times: add hours and minutes
        const timeStrings = [
          formatMinutesToTime(f.schedDep),
          formatMinutesToTime(f.schedArr)
        ];
        if (f.actualDep !== null) timeStrings.push(formatMinutesToTime(f.actualDep));
        if (f.actualArr !== null) timeStrings.push(formatMinutesToTime(f.actualArr));

        for (const t of timeStrings) {
          const parts = t.match(/\d+/g) || [];
          for (const p of parts) {
            allowedNumbers.add(p);
            allowedNumbers.add(parseInt(p, 10).toString());
          }
        }

        for (const num of explanationNums) {
          const normalized = parseInt(num, 10).toString();
          const matches = allowedNumbers.has(num) || allowedNumbers.has(normalized);
          expect(matches).toBe(true);
        }

        const list = flightsByTail.get(f.tailId) ?? [];
        list.push(f);
        flightsByTail.set(f.tailId, list);
      }

      // P2: consecutive flights on one tail satisfy turnaround >= 30
      for (const [, tailFlights] of flightsByTail.entries()) {
        for (let idx = 0; idx < tailFlights.length - 1; idx++) {
          const curr = tailFlights[idx];
          const next = tailFlights[idx + 1];
          const turnaround = next.actualDep! - curr.actualArr!;
          expect(turnaround).toBeGreaterThanOrEqual(30);
        }
      }

      // P7: strandedPaxTotal == cancelledPax + missedConnectionPax <= totalNetworkPax
      const m = result.metrics;
      expect(m.strandedPaxTotal).toBe(m.cancelledPax + m.missedConnectionPax);
      expect(m.strandedPaxTotal).toBeLessThanOrEqual(totalNetworkPax);
    }
  });

  it('Property 5: Closure widening monotonicity across 1,000 scenarios', () => {
    const prng = createPRNG(202);
    const ITERATIONS = 1000;

    for (let i = 0; i < ITERATIONS; i++) {
      const airport = airports[Math.floor(prng() * airports.length)];
      const start = 400 + Math.floor(prng() * 600);
      const duration = 60 + Math.floor(prng() * 60);
      const end = start + duration;

      const baseScenario: Scenario = {
        closures: [{ id: 'C_BASE', airport, start, end }]
      };

      // Widen closure
      const deltaStart = Math.floor(prng() * 30);
      const deltaEnd = Math.floor(prng() * 30);
      const widenedScenario: Scenario = {
        closures: [{ id: 'C_WIDE', airport, start: start - deltaStart, end: end + deltaEnd }]
      };

      const baseRes = simulate(network, baseScenario);
      const wideRes = simulate(network, widenedScenario);

      // Widening never reduces total delay or individual flight delay
      expect(wideRes.metrics.totalArrDelayMin).toBeGreaterThanOrEqual(baseRes.metrics.totalArrDelayMin);
      expect(wideRes.metrics.totalDepDelayMin).toBeGreaterThanOrEqual(baseRes.metrics.totalDepDelayMin);

      for (let fIdx = 0; fIdx < network.flights.length; fIdx++) {
        const baseF = baseRes.flights[fIdx];
        const wideF = wideRes.flights[fIdx];
        expect(wideF.arrDelay).toBeGreaterThanOrEqual(baseF.arrDelay);
        expect(wideF.depDelay).toBeGreaterThanOrEqual(baseF.depDelay);
      }
    }
  });

  it('Property 6: Inactive closure produces zero delay and matches baseline', () => {
    const baseline = simulateBaseline(network);

    // Inactive night window 01:00-03:00 (no flights in network operate during this period)
    const closure: Closure = {
      id: 'C_NIGHT',
      airport: 'DEL',
      start: parseTimeToMinutes('01:00'),
      end: parseTimeToMinutes('03:00')
    };

    const res = simulate(network, { closures: [closure] });

    expect(res.metrics.delayedFlights).toBe(0);
    expect(res.metrics.totalArrDelayMin).toBe(0);
    expect(res.metrics.strandedPaxTotal).toBe(baseline.metrics.strandedPaxTotal);

    for (let i = 0; i < network.flights.length; i++) {
      expect(res.flights[i].actualDep).toBe(baseline.flights[i].actualDep);
      expect(res.flights[i].actualArr).toBe(baseline.flights[i].actualArr);
    }
  });

  it('Property 8: Shuffling input arrays preserves identical results across 1,000 scenarios', () => {
    const prng = createPRNG(303);
    const ITERATIONS = 1000;

    for (let i = 0; i < ITERATIONS; i++) {
      const airport = airports[Math.floor(prng() * airports.length)];
      const start = 360 + Math.floor(prng() * 600);
      const closure: Closure = { id: 'C_SHUFFLE', airport, start, end: start + 90 };
      const scenario: Scenario = { closures: [closure] };

      const standardResult = simulate(network, scenario);

      // Shuffle network flights, crews, and connections
      const shuffledFlights = [...network.flights].sort(() => prng() - 0.5);
      const shuffledCrews = [...network.crews].sort(() => prng() - 0.5);
      const shuffledConnections = [...network.connections].sort(() => prng() - 0.5);

      const shuffledNetwork: FlightNetworkData = {
        ...network,
        flights: shuffledFlights,
        crews: shuffledCrews,
        connections: shuffledConnections
      };

      const shuffledResult = simulate(shuffledNetwork, scenario);

      // Verify metrics are identical
      expect(shuffledResult.metrics.totalArrDelayMin).toBe(standardResult.metrics.totalArrDelayMin);
      expect(shuffledResult.metrics.delayedFlights).toBe(standardResult.metrics.delayedFlights);
      expect(shuffledResult.metrics.strandedPaxTotal).toBe(standardResult.metrics.strandedPaxTotal);
      expect(shuffledResult.metrics.crewBreaches).toBe(standardResult.metrics.crewBreaches);
    }
  });

  it('Property 9: Determinism - same input produces byte-identical JSON', () => {
    const scenario: Scenario = {
      closures: [{ id: 'C_DET', airport: 'BLR', start: 360, end: 510 }],
      actions: [{ type: 'SWAP_SPARE', flightId: 'DS0603', spareTail: 'VT-DS17' }]
    };

    const res1 = simulate(network, scenario);
    const res2 = simulate(network, scenario);

    expect(JSON.stringify(res1)).toBe(JSON.stringify(res2));
    expect(res1.scenarioFingerprint).toBe(res2.scenarioFingerprint);
  });

  it('Property 10: Zero input mutation (deep-frozen input data)', () => {
    const frozenNetwork = deepFreeze(loadFlightNetwork());
    const frozenScenario = deepFreeze<Scenario>({
      closures: [{ id: 'C_FREEZE', airport: 'BLR', start: 360, end: 510 }],
      actions: [{ type: 'SWAP_SPARE', flightId: 'DS0603', spareTail: 'VT-DS17' }]
    });

    // Execution must succeed without mutating read-only objects
    expect(() => simulate(frozenNetwork, frozenScenario)).not.toThrow();
  });
});
