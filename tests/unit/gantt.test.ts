import { describe, it, expect } from 'vitest';
import {
  minuteToX,
  xToMinute,
  computeFlightBarGeometry,
  computeClosureBandGeometry,
  generateHourlyGrid,
  DEFAULT_GANTT_DIMENSIONS,
} from '../../src/lib/ganttGeometry';
import { FlightResult } from '../../src/engine/types';

describe('Gantt Geometry Unit Tests', () => {
  it('maps minutes to X coordinates accurately', () => {
    // 300 (05:00) is start -> x = 0
    expect(minuteToX(300, DEFAULT_GANTT_DIMENSIONS)).toBe(0);
    // 1560 (02:00 +1d) is end -> x = 1260
    expect(minuteToX(1560, DEFAULT_GANTT_DIMENSIONS)).toBe(1260);
    // Midpoint: (300 + 1560) / 2 = 930 -> x = 630
    expect(minuteToX(930, DEFAULT_GANTT_DIMENSIONS)).toBe(630);
  });

  it('inverts X coordinates back to minutes', () => {
    expect(xToMinute(0, DEFAULT_GANTT_DIMENSIONS)).toBe(300);
    expect(xToMinute(1260, DEFAULT_GANTT_DIMENSIONS)).toBe(1560);
    expect(xToMinute(630, DEFAULT_GANTT_DIMENSIONS)).toBe(930);
  });

  it('computes flight bar coordinates correctly', () => {
    const flight: FlightResult = {
      flightId: 'DS0601',
      tailId: 'VT-DS06',
      originalTailId: 'VT-DS06',
      crewId: 'CR06',
      origin: 'BLR',
      destination: 'DEL',
      schedDep: 360, // 06:00 (x = 60)
      schedArr: 510, // 08:30 (x = 210)
      actualDep: 510, // 08:30 (x = 210)
      actualArr: 660, // 11:00 (x = 360)
      depDelay: 150,
      arrDelay: 150,
      arrivalHoldMin: 0,
      cancelled: false,
      status: 'DELAYED',
      severity: 'SEVERE',
      primaryCause: { type: 'AIRPORT_CLOSED_ORIGIN', minutes: 150 },
      rootCause: { closureId: 'c1', airport: 'BLR', flightId: 'DS0601' },
      causeChain: ['DS0601'],
      slackAbsorbedMin: 0,
      explanation: 'Departure delayed 150m because origin airport BLR closed.',
    };

    const geom = computeFlightBarGeometry(flight, 2, DEFAULT_GANTT_DIMENSIONS);
    expect(geom.flightId).toBe('DS0601');
    expect(geom.schedX).toBe(60);
    expect(geom.schedWidth).toBe(150);
    expect(geom.actualX).toBe(210);
    expect(geom.actualWidth).toBe(150);
    expect(geom.delayX).toBe(210);
    expect(geom.delayWidth).toBe(150);
    expect(geom.isDelayed).toBe(true);
    expect(geom.isCancelled).toBe(false);
  });

  it('computes closure band coordinates correctly', () => {
    const band = computeClosureBandGeometry(
      { id: 'c1', airport: 'BLR', start: 360, end: 510 },
      DEFAULT_GANTT_DIMENSIONS
    );
    expect(band.x).toBe(60);
    expect(band.width).toBe(150);
    expect(band.airport).toBe('BLR');
  });

  it('generates hourly grid lines across the timeline', () => {
    const grid = generateHourlyGrid(DEFAULT_GANTT_DIMENSIONS);
    expect(grid.length).toBeGreaterThan(15);
    expect(grid[0].label).toBe('05:00');
    expect(grid.find((g) => g.label === '06:00')?.x).toBe(60);
    expect(grid.find((g) => g.label === '00:00 +1d')?.x).toBe(1140);
  });
});
