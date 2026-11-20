import { describe, it, expect } from 'vitest';
import { loadFlightNetwork } from '@/engine/load';
import { simulate } from '@/engine/simulate';
import { validateActions, ActionValidationError } from '@/engine/actions';
import { parseTimeToMinutes } from '@/engine/time';

describe('Adversarial & Edge Case Scenarios (Critic Mode)', () => {
  const network = loadFlightNetwork();

  it('AD-1: Adjacent closures [360, 420) and [420, 510) at BLR', () => {
    const result = simulate(network, {
      closures: [
        { id: 'C_AD1_A', airport: 'BLR', start: 360, end: 420 },
        { id: 'C_AD1_B', airport: 'BLR', start: 420, end: 510 }
      ]
    });
    const f01 = result.flights.find((f) => f.flightId === 'DS0601')!;
    expect(f01.actualDep).toBe(510);
    expect(f01.depDelay).toBe(150);
  });

  it('AD-2: Midnight edge closure ending at 24:00 (1440m)', () => {
    const result = simulate(network, {
      closures: [{ id: 'C_MIDNIGHT', airport: 'DEL', start: 1300, end: 1440 }]
    });
    expect(result.metrics).toBeDefined();
    for (const f of result.flights) {
      if (!f.cancelled && f.origin === 'DEL') {
        if (f.actualDep! >= 1300 && f.actualDep! < 1440) {
          expect.unreachable('Flight should not depart inside midnight closure window');
        }
      }
    }
  });

  it('AD-3: Dual-ended closures on both origin and destination of a single flight', () => {
    // Flight DS0201: DEL -> BOM, dep 06:00 (360), arr 08:10 (490)
    // Origin DEL closed 06:00-06:30 (360-390)
    // Destination BOM closed 08:00-08:45 (480-525)
    const result = simulate(network, {
      closures: [
        { id: 'C_DEL', airport: 'DEL', start: 360, end: 390 },
        { id: 'C_BOM', airport: 'BOM', start: 480, end: 525 }
      ],
      config: { arrivalPolicy: 'AIRBORNE_HOLD' }
    });

    const f = result.flights.find((fl) => fl.flightId === 'DS0201')!;
    // Dep held at DEL until 06:30 (390). Flight block is 130m.
    // Natural arr = 390 + 130 = 520.
    // 520 is in BOM closure [480, 525).
    // Airborne hold until 525!
    expect(f.actualDep).toBe(390);
    expect(f.depDelay).toBe(30);
    expect(f.actualArr).toBe(525);
    expect(f.arrDelay).toBe(35); // schedArr 490 -> 525 is 35m delay
    expect(f.arrivalHoldMin).toBe(5); // 525 - 520 = 5m airborne hold
  });

  it('AD-4: Closing every mega-hub simultaneously (DEL, BOM, BLR, HYD)', () => {
    const start = parseTimeToMinutes('06:00');
    const end = parseTimeToMinutes('09:00');

    const result = simulate(network, {
      closures: [
        { id: 'C_DEL', airport: 'DEL', start, end },
        { id: 'C_BOM', airport: 'BOM', start, end },
        { id: 'C_BLR', airport: 'BLR', start, end },
        { id: 'C_HYD', airport: 'HYD', start, end }
      ]
    });

    expect(result.metrics.delayedFlights).toBeGreaterThan(15);
    expect(result.metrics.totalArrDelayMin).toBeGreaterThan(1000);
    expect(result.metrics.crewBreaches).toBeGreaterThan(0);
    // Even under massive collapse, invariants hold:
    expect(result.metrics.strandedPaxTotal).toBe(
      result.metrics.cancelledPax + result.metrics.missedConnectionPax
    );
  });

  it('AD-5: Empty actions list operates identically to pure closure scenario', () => {
    const c = [{ id: 'C_TEST', airport: 'BLR', start: 360, end: 510 }];
    const resWithoutActions = simulate(network, { closures: c });
    const resWithEmptyActions = simulate(network, { closures: c, actions: [] });

    expect(JSON.stringify(resWithoutActions)).toBe(JSON.stringify(resWithEmptyActions));
  });

  it('AD-6: Cancel everything on a tail (all legs of VT-DS01)', () => {
    const ds01Flights = network.flights
      .filter((f) => f.tail_id === 'VT-DS01')
      .map((f) => f.flight_id);

    const val = validateActions(network, {
      closures: [],
      actions: [{ type: 'CANCEL', flightIds: ds01Flights }]
    });
    expect(val.valid).toBe(true);

    const res = simulate(network, {
      closures: [],
      actions: [{ type: 'CANCEL', flightIds: ds01Flights }]
    });

    expect(res.metrics.cancelledFlights).toBe(ds01Flights.length);
    const cr01 = res.crews.find((cr) => cr.crewId === 'CR01')!;
    expect(cr01.dutyEnd).toBeNull();
    expect(cr01.dutyMin).toBe(0);
    expect(cr01.breach).toBe(false);
  });

  it('AD-7: Duplicate flightId in CANCEL action is rejected', () => {
    const val = validateActions(network, {
      closures: [],
      actions: [{ type: 'CANCEL', flightIds: ['DS0105', 'DS0105'] }]
    });
    expect(val.valid).toBe(false);
    expect(val.reasons.some((r) => r.includes('cancelled multiple times'))).toBe(true);

    expect(() =>
      simulate(network, {
        closures: [],
        actions: [{ type: 'CANCEL', flightIds: ['DS0105', 'DS0105'] }]
      })
    ).toThrow(ActionValidationError);
  });

  it('AD-8: Duplicate spare usage across multiple actions is rejected', () => {
    const val = validateActions(network, {
      closures: [],
      actions: [
        { type: 'SWAP_SPARE', flightId: 'DS0603', spareTail: 'VT-DS17' },
        { type: 'SWAP_SPARE', flightId: 'DS0604', spareTail: 'VT-DS17' }
      ]
    });
    expect(val.valid).toBe(false);
    expect(val.reasons.some((r) => r.includes('already used in another action'))).toBe(true);
  });

  it('AD-9: Unknown flight ID and unknown spare tail in actions are rejected', () => {
    const val1 = validateActions(network, {
      closures: [],
      actions: [{ type: 'CANCEL', flightIds: ['NONEXISTENT_FLIGHT'] }]
    });
    expect(val1.valid).toBe(false);
    expect(val1.reasons.some((r) => r.includes('Unknown flightId'))).toBe(true);

    const val2 = validateActions(network, {
      closures: [],
      actions: [{ type: 'SWAP_SPARE', flightId: 'DS0603', spareTail: 'VT-UNKNOWN' }]
    });
    expect(val2.valid).toBe(false);
    expect(val2.reasons.some((r) => r.includes('Unknown spareTail'))).toBe(true);
  });

  it('AD-10: Overlapping closures specified in reverse chronological order', () => {
    // Reverse order: [420, 510) then [360, 450)
    const result = simulate(network, {
      closures: [
        { id: 'C_LATE', airport: 'BLR', start: 420, end: 510 },
        { id: 'C_EARLY', airport: 'BLR', start: 360, end: 450 }
      ]
    });
    const f01 = result.flights.find((f) => f.flightId === 'DS0601')!;
    expect(f01.actualDep).toBe(510);
    expect(f01.depDelay).toBe(150);
  });
});
