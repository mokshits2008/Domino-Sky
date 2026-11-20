import { describe, it, expect } from 'vitest';
import { useSimulatorStore } from '../../src/lib/store';

describe('URL Scenario Round-Trip', () => {
  it('serializes and deserializes scenario accurately', () => {
    const store = useSimulatorStore.getState();
    store.resetAll();

    // Add BLR 06:00 to 08:30 (360 to 510)
    store.addClosure('BLR', 360, 510);
    store.setArrivalPolicy('GROUND_HOLD');

    const qs = store.serializeToQueryString();
    expect(qs).toContain('closures=BLR%3A06%3A00-08%3A30');
    expect(qs).toContain('policy=GROUND_HOLD');

    // Reset store
    store.resetAll();
    expect(store.closures.length).toBe(0);

    // Deserialise back
    store.loadFromQueryString(qs);
    const restored = useSimulatorStore.getState();
    expect(restored.closures.length).toBe(1);
    expect(restored.closures[0].airport).toBe('BLR');
    expect(restored.closures[0].start).toBe(360);
    expect(restored.closures[0].end).toBe(510);
    expect(restored.arrivalPolicy).toBe('GROUND_HOLD');
    expect(restored.simulationResult.metrics.delayedFlights).toBe(5);
  });
});
