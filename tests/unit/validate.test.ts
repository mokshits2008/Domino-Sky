import { describe, it, expect } from 'vitest';
import { loadFlightNetwork } from '@/engine/load';
import { validateNetworkIntegrity } from '@/engine/validate';

describe('Network data integrity validation', () => {
  it('validates the unmodified baseline flight network with zero warnings', () => {
    const network = loadFlightNetwork();
    const report = validateNetworkIntegrity(network);

    expect(report.valid).toBe(true);
    expect(report.warnings).toHaveLength(0);

    // Verify exact data counts from specification
    expect(report.counts.airports).toBe(16);
    expect(report.counts.flights).toBe(70);
    expect(report.counts.tails).toBe(16);
    expect(report.counts.connections).toBe(21);
    expect(report.counts.crews).toBe(16);
    expect(report.counts.spares).toBe(2);
  });

  it('detects unknown origin airport on a flight', () => {
    const network = loadFlightNetwork();
    network.flights[0].origin = 'XYZ';
    const report = validateNetworkIntegrity(network);
    expect(report.valid).toBe(false);
    expect(report.warnings.some((w) => w.code === 'UNKNOWN_ORIGIN_AIRPORT')).toBe(true);
  });

  it('detects block time calculation mismatch', () => {
    const network = loadFlightNetwork();
    network.flights[0].block_minutes = 999;
    const report = validateNetworkIntegrity(network);
    expect(report.valid).toBe(false);
    expect(report.warnings.some((w) => w.code === 'BLOCK_TIME_MISMATCH')).toBe(true);
  });

  it('detects geographic discontinuity in aircraft tail chain', () => {
    const network = loadFlightNetwork();
    // Leg 1 arrives at JAI, force leg 2 origin to BOM
    const leg2 = network.flights.find((f) => f.tail_id === 'VT-DS01' && f.leg_order === 2);
    if (leg2) {
      leg2.origin = 'BOM';
    }
    const report = validateNetworkIntegrity(network);
    expect(report.valid).toBe(false);
    expect(report.warnings.some((w) => w.code === 'GEOGRAPHIC_DISCONTINUITY')).toBe(true);
  });

  it('detects turnaround below 30 minutes', () => {
    const network = loadFlightNetwork();
    // Modify DS0102 dep to make turnaround 10 mins
    const leg2 = network.flights.find((f) => f.flight_id === 'DS0102');
    if (leg2) {
      leg2.dep = '09:00'; // arr of leg 1 is 08:50, so gap is 10 min
      leg2.block_minutes = 50;
      leg2.arr = '09:50';
      leg2.turnaround_before_min = 10;
    }
    const report = validateNetworkIntegrity(network);
    expect(report.valid).toBe(false);
    expect(report.warnings.some((w) => w.code === 'TURNAROUND_BELOW_MINIMUM')).toBe(true);
  });

  it('detects crew chain mismatch', () => {
    const network = loadFlightNetwork();
    network.crews[0].flight_ids = ['DS0101']; // Missing remaining legs
    const report = validateNetworkIntegrity(network);
    expect(report.valid).toBe(false);
    expect(report.warnings.some((w) => w.code === 'CREW_CHAIN_MISMATCH')).toBe(true);
  });

  it('detects infeasible baseline connection', () => {
    const network = loadFlightNetwork();
    network.connections[0].min_connect_minutes = 999;
    const report = validateNetworkIntegrity(network);
    expect(report.valid).toBe(false);
    expect(report.warnings.some((w) => w.code === 'BASELINE_CONNECTION_INFEASIBLE')).toBe(true);
  });
});
