import { describe, it, expect } from 'vitest';
import { loadFlightNetwork } from '@/engine/load';
import { simulate } from '@/engine/simulate';
import { parseTimeToMinutes } from '@/engine/time';

describe('Simulation Engine Unit Tests', () => {
  const network = loadFlightNetwork();

  it('handles overlapping closures at the same airport', () => {
    // Two overlapping closures at BLR: 06:00-07:30 and 07:00-08:30
    const c1 = { id: 'C1', airport: 'BLR', start: 360, end: 450 };
    const c2 = { id: 'C2', airport: 'BLR', start: 420, end: 510 };

    const result = simulate(network, { closures: [c1, c2] });
    const f01 = result.flights.find((f) => f.flightId === 'DS0601')!;

    // Both closures combine: departure must wait until 08:30 (510)
    expect(f01.actualDep).toBe(510);
    expect(f01.depDelay).toBe(150);
  });

  it('handles adjacent back-to-back closures at the same airport', () => {
    // 06:00-07:00 and 07:00-08:30
    const c1 = { id: 'C1', airport: 'BLR', start: 360, end: 420 };
    const c2 = { id: 'C2', airport: 'BLR', start: 420, end: 510 };

    const result = simulate(network, { closures: [c1, c2] });
    const f01 = result.flights.find((f) => f.flightId === 'DS0601')!;
    expect(f01.actualDep).toBe(510);
  });

  it('evaluates GROUND_HOLD arrival policy correctly', () => {
    // Under BOM closed 09:00-10:30 with GROUND_HOLD:
    // DS0402 (GOI->BOM, schedDep 09:20, arr 10:25) will be held on the ground at GOI
    // until it arrives at or after 10:30!
    // Shift is 10:30 - 10:25 = 5 min, so dep is 09:25, arr is 10:30.
    const start = parseTimeToMinutes('09:00');
    const end = parseTimeToMinutes('10:30');

    const result = simulate(network, {
      closures: [{ id: 'C_BOM', airport: 'BOM', start, end }],
      config: { arrivalPolicy: 'GROUND_HOLD' }
    });

    const f0402 = result.flights.find((f) => f.flightId === 'DS0402')!;
    expect(f0402.actualDep).toBe(parseTimeToMinutes('09:25'));
    expect(f0402.actualArr).toBe(parseTimeToMinutes('10:30'));
    expect(f0402.depDelay).toBe(5);
    expect(f0402.arrDelay).toBe(5);
    expect(f0402.arrivalHoldMin).toBe(0);
    expect(f0402.primaryCause.type).toBe('GROUND_HOLD_DEST_CLOSED');
  });

  it('respects equality boundary: departure exactly at closure.start is held', () => {
    // DS0601 departs at 06:00. Closure start at 06:00, end 06:30.
    const start = parseTimeToMinutes('06:00');
    const end = parseTimeToMinutes('06:30');

    const result = simulate(network, {
      closures: [{ id: 'C_TEST', airport: 'BLR', start, end }]
    });

    const f01 = result.flights.find((f) => f.flightId === 'DS0601')!;
    expect(f01.actualDep).toBe(end);
    expect(f01.depDelay).toBe(30);
  });

  it('respects equality boundary: arrival exactly at closure.end is NOT held', () => {
    // DS0601 arrives at 07:00 at COK.
    // Destination closure at COK ending exactly at 07:00 (e.g. 06:00 to 07:00).
    const start = parseTimeToMinutes('06:00');
    const end = parseTimeToMinutes('07:00');

    const result = simulate(network, {
      closures: [{ id: 'C_COK', airport: 'COK', start, end }]
    });

    const f01 = result.flights.find((f) => f.flightId === 'DS0601')!;
    expect(f01.actualArr).toBe(end);
    expect(f01.arrDelay).toBe(0);
    expect(f01.arrivalHoldMin).toBe(0);
  });

  it('respects equality boundary: crew dutyMin exactly 600 is legal (no breach)', () => {
    // Baseline crews all have duty <= 600, check that duty == 600 has breach == false
    const baseline = simulate(network, { closures: [] });
    for (const cr of baseline.crews) {
      if (cr.dutyMin === 600) {
        expect(cr.breach).toBe(false);
        expect(cr.excessMin).toBe(0);
      }
    }
  });
});
