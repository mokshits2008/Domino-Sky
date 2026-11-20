import { describe, it, expect } from 'vitest';
import { loadFlightNetwork } from '@/engine/load';
import { simulate, simulateBaseline } from '@/engine/simulate';
import { parseTimeToMinutes } from '@/engine/time';

describe('Golden Scenarios (G0 - G3)', () => {
  const network = loadFlightNetwork();

  it('G0: Baseline (no closures) - zero delay, zero missed connections, zero breaches', () => {
    const result = simulateBaseline(network);

    expect(result.metrics.delayedFlights).toBe(0);
    expect(result.metrics.cancelledFlights).toBe(0);
    expect(result.metrics.totalDepDelayMin).toBe(0);
    expect(result.metrics.totalArrDelayMin).toBe(0);
    expect(result.metrics.maxArrDelayMin).toBe(0);
    expect(result.metrics.paxDelayMinutes).toBe(0);
    expect(result.metrics.missedConnections).toBe(0);
    expect(result.metrics.missedConnectionPax).toBe(0);
    expect(result.metrics.strandedPaxTotal).toBe(0);
    expect(result.metrics.strandedPaxVsBaseline).toBe(0);
    expect(result.metrics.crewBreaches).toBe(0);
    expect(result.metrics.crewBreachExcessMin).toBe(0);

    // Every flight actual == scheduled, status ON_TIME, cause ON_TIME
    for (const f of result.flights) {
      expect(f.actualDep).toBe(f.schedDep);
      expect(f.actualArr).toBe(f.schedArr);
      expect(f.depDelay).toBe(0);
      expect(f.arrDelay).toBe(0);
      expect(f.status).toBe('ON_TIME');
      expect(f.severity).toBe('NONE');
      expect(f.primaryCause.type).toBe('ON_TIME');
      expect(f.rootCause).toBeNull();
      expect(f.causeChain).toHaveLength(0);
      expect(f.slackAbsorbedMin).toBe(0);
    }

    // Every connection CONNECTED
    for (const c of result.connections) {
      expect(c.status).toBe('CONNECTED');
      expect(c.strandedPax).toBe(0);
      expect(c.gapMin).toBeGreaterThanOrEqual(c.minConnect);
    }

    // Every crew duty <= maxDutyMin
    for (const cr of result.crews) {
      expect(cr.breach).toBe(false);
      expect(cr.dutyMin).toBeLessThanOrEqual(cr.maxDutyMin);
      expect(cr.excessMin).toBe(0);
    }
  });

  it('G1: BLR closed 06:00-08:30', () => {
    const start = parseTimeToMinutes('06:00'); // 360
    const end = parseTimeToMinutes('08:30');   // 510

    const result = simulate(network, {
      closures: [{ id: 'C_BLR', airport: 'BLR', start, end }]
    });

    // Exactly 5 delayed flights, all on VT-DS06
    expect(result.metrics.delayedFlights).toBe(5);
    expect(result.metrics.cancelledFlights).toBe(0);
    expect(result.metrics.totalDepDelayMin).toBe(620);
    expect(result.metrics.totalArrDelayMin).toBe(620);

    const ds06Flights = result.flights.filter((f) => f.tailId === 'VT-DS06');
    expect(ds06Flights).toHaveLength(5);

    const fMap = new Map(result.flights.map((f) => [f.flightId, f]));

    // DS0601 08:30/09:30, depDelay 150
    const f01 = fMap.get('DS0601')!;
    expect(f01.actualDep).toBe(parseTimeToMinutes('08:30'));
    expect(f01.actualArr).toBe(parseTimeToMinutes('09:30'));
    expect(f01.depDelay).toBe(150);
    expect(f01.arrDelay).toBe(150);
    expect(f01.primaryCause.type).toBe('AIRPORT_CLOSED_ORIGIN');
    expect(f01.primaryCause.closureId).toBe('C_BLR');
    expect(f01.rootCause).toEqual({ closureId: 'C_BLR', airport: 'BLR', flightId: 'DS0601' });
    expect(f01.causeChain).toEqual(['DS0601']);

    // DS0602 10:00/11:00, depDelay 145
    const f02 = fMap.get('DS0602')!;
    expect(f02.actualDep).toBe(parseTimeToMinutes('10:00'));
    expect(f02.actualArr).toBe(parseTimeToMinutes('11:00'));
    expect(f02.depDelay).toBe(145);
    expect(f02.arrDelay).toBe(145);
    expect(f02.primaryCause.type).toBe('KNOCK_ON_AIRCRAFT');
    expect(f02.primaryCause.sourceFlightId).toBe('DS0601');
    expect(f02.rootCause).toEqual({ closureId: 'C_BLR', airport: 'BLR', flightId: 'DS0601' });
    expect(f02.causeChain).toEqual(['DS0602', 'DS0601']);
    expect(f02.slackAbsorbedMin).toBe(5);

    // DS0603 11:30/12:25, depDelay 110, slack absorbed 35
    const f03 = fMap.get('DS0603')!;
    expect(f03.actualDep).toBe(parseTimeToMinutes('11:30'));
    expect(f03.actualArr).toBe(parseTimeToMinutes('12:25'));
    expect(f03.depDelay).toBe(110);
    expect(f03.arrDelay).toBe(110);
    expect(f03.primaryCause.type).toBe('KNOCK_ON_AIRCRAFT');
    expect(f03.primaryCause.sourceFlightId).toBe('DS0602');
    expect(f03.rootCause).toEqual({ closureId: 'C_BLR', airport: 'BLR', flightId: 'DS0601' });
    expect(f03.causeChain).toEqual(['DS0603', 'DS0602', 'DS0601']);
    expect(f03.slackAbsorbedMin).toBe(35);

    // DS0604 12:55/13:50, depDelay 110
    const f04 = fMap.get('DS0604')!;
    expect(f04.actualDep).toBe(parseTimeToMinutes('12:55'));
    expect(f04.actualArr).toBe(parseTimeToMinutes('13:50'));
    expect(f04.depDelay).toBe(110);
    expect(f04.arrDelay).toBe(110);
    expect(f04.primaryCause.type).toBe('KNOCK_ON_AIRCRAFT');
    expect(f04.primaryCause.sourceFlightId).toBe('DS0603');
    expect(f04.rootCause).toEqual({ closureId: 'C_BLR', airport: 'BLR', flightId: 'DS0601' });
    expect(f04.causeChain).toEqual(['DS0604', 'DS0603', 'DS0602', 'DS0601']);
    expect(f04.slackAbsorbedMin).toBe(0);

    // DS0605 14:20/15:35, depDelay 105
    const f05 = fMap.get('DS0605')!;
    expect(f05.actualDep).toBe(parseTimeToMinutes('14:20'));
    expect(f05.actualArr).toBe(parseTimeToMinutes('15:35'));
    expect(f05.depDelay).toBe(105);
    expect(f05.arrDelay).toBe(105);
    expect(f05.primaryCause.type).toBe('KNOCK_ON_AIRCRAFT');
    expect(f05.primaryCause.sourceFlightId).toBe('DS0604');
    expect(f05.rootCause).toEqual({ closureId: 'C_BLR', airport: 'BLR', flightId: 'DS0601' });
    expect(f05.causeChain).toEqual(['DS0605', 'DS0604', 'DS0603', 'DS0602', 'DS0601']);
    expect(f05.slackAbsorbedMin).toBe(5);

    // All other flights delayed == 0
    const otherFlights = result.flights.filter((f) => f.tailId !== 'VT-DS06');
    for (const f of otherFlights) {
      expect(f.arrDelay).toBe(0);
      expect(f.depDelay).toBe(0);
    }

    // Connections: Missed CX06 (42), CX07 (25), CX08 (41) -> 108 pax
    const cMap = new Map(result.connections.map((c) => [c.connectionId, c]));
    expect(cMap.get('CX06')!.status).toBe('MISSED');
    expect(cMap.get('CX06')!.strandedPax).toBe(42);

    expect(cMap.get('CX07')!.status).toBe('MISSED');
    expect(cMap.get('CX07')!.strandedPax).toBe(25);

    expect(cMap.get('CX08')!.status).toBe('MISSED');
    expect(cMap.get('CX08')!.strandedPax).toBe(41);

    expect(result.metrics.missedConnections).toBe(3);
    expect(result.metrics.missedConnectionPax).toBe(108);
    expect(result.metrics.strandedPaxTotal).toBe(108);
    expect(result.metrics.strandedPaxVsBaseline).toBe(108);

    // Crew CR06 dutyMin 620 -> breach, excess 20. All others fine.
    const crMap = new Map(result.crews.map((cr) => [cr.crewId, cr]));
    const cr06 = crMap.get('CR06')!;
    expect(cr06.breach).toBe(true);
    expect(cr06.dutyMin).toBe(620);
    expect(cr06.excessMin).toBe(20);
    expect(cr06.slackToLimitMin).toBe(0);

    expect(result.metrics.crewBreaches).toBe(1);
    expect(result.metrics.crewBreachExcessMin).toBe(20);

    for (const [id, cr] of crMap.entries()) {
      if (id !== 'CR06') {
        expect(cr.breach).toBe(false);
      }
    }
  });

  it('G3: BOM closed 09:00-10:30', () => {
    const start = parseTimeToMinutes('09:00'); // 540
    const end = parseTimeToMinutes('10:30');   // 630

    const result = simulate(network, {
      closures: [{ id: 'C_BOM', airport: 'BOM', start, end }]
    });

    const fMap = new Map(result.flights.map((f) => [f.flightId, f]));

    // DS0202 10:30/11:10
    expect(fMap.get('DS0202')!.actualDep).toBe(parseTimeToMinutes('10:30'));
    expect(fMap.get('DS0202')!.actualArr).toBe(parseTimeToMinutes('11:10'));
    expect(fMap.get('DS0202')!.depDelay).toBe(70);
    expect(fMap.get('DS0202')!.arrDelay).toBe(70);

    // DS0203 11:40/12:20
    expect(fMap.get('DS0203')!.actualDep).toBe(parseTimeToMinutes('11:40'));
    expect(fMap.get('DS0203')!.actualArr).toBe(parseTimeToMinutes('12:20'));
    expect(fMap.get('DS0203')!.depDelay).toBe(25);
    expect(fMap.get('DS0203')!.arrDelay).toBe(25);

    // DS0204 12:50/13:55
    expect(fMap.get('DS0204')!.actualDep).toBe(parseTimeToMinutes('12:50'));
    expect(fMap.get('DS0204')!.actualArr).toBe(parseTimeToMinutes('13:55'));
    expect(fMap.get('DS0204')!.depDelay).toBe(20);
    expect(fMap.get('DS0204')!.arrDelay).toBe(20);

    // DS0702 10:30/11:55
    expect(fMap.get('DS0702')!.actualDep).toBe(parseTimeToMinutes('10:30'));
    expect(fMap.get('DS0702')!.actualArr).toBe(parseTimeToMinutes('11:55'));
    expect(fMap.get('DS0702')!.depDelay).toBe(80);
    expect(fMap.get('DS0702')!.arrDelay).toBe(80);

    // DS0703 12:25/13:35
    expect(fMap.get('DS0703')!.actualDep).toBe(parseTimeToMinutes('12:25'));
    expect(fMap.get('DS0703')!.actualArr).toBe(parseTimeToMinutes('13:35'));
    expect(fMap.get('DS0703')!.depDelay).toBe(40);
    expect(fMap.get('DS0703')!.arrDelay).toBe(40);

    // DS0704 14:05/15:15
    expect(fMap.get('DS0704')!.actualDep).toBe(parseTimeToMinutes('14:05'));
    expect(fMap.get('DS0704')!.actualArr).toBe(parseTimeToMinutes('15:15'));
    expect(fMap.get('DS0704')!.depDelay).toBe(40);
    expect(fMap.get('DS0704')!.arrDelay).toBe(40);

    // DS0402 dep 09:20 arr 10:30 (arrival held, arrDelay 5, cause AIRPORT_CLOSED_DEST_HOLD)
    const f0402 = fMap.get('DS0402')!;
    expect(f0402.actualDep).toBe(parseTimeToMinutes('09:20'));
    expect(f0402.actualArr).toBe(parseTimeToMinutes('10:30'));
    expect(f0402.depDelay).toBe(0);
    expect(f0402.arrDelay).toBe(5);
    expect(f0402.arrivalHoldMin).toBe(5);
    expect(f0402.primaryCause.type).toBe('AIRPORT_CLOSED_DEST_HOLD');

    // DS0403 stays on time
    const f0403 = fMap.get('DS0403')!;
    expect(f0403.actualDep).toBe(f0403.schedDep);
    expect(f0403.actualArr).toBe(f0403.schedArr);
    expect(f0403.depDelay).toBe(0);
    expect(f0403.arrDelay).toBe(0);
    expect(f0403.status).toBe('ON_TIME');

    // Metrics verification
    expect(result.metrics.delayedFlights).toBe(7);
    expect(result.metrics.totalDepDelayMin).toBe(275);
    expect(result.metrics.totalArrDelayMin).toBe(280);
    expect(result.metrics.strandedPaxTotal).toBe(0);
    expect(result.metrics.crewBreaches).toBe(0);

    // CX17 connection (gap is exactly 45 == minConnect -> CONNECTED)
    const cMap = new Map(result.connections.map((c) => [c.connectionId, c]));
    const cx17 = cMap.get('CX17')!;
    expect(cx17.gapMin).toBe(45);
    expect(cx17.minConnect).toBe(45);
    expect(cx17.status).toBe('CONNECTED');
    expect(cx17.strandedPax).toBe(0);
  });

  it('G2: G1 + SWAP_SPARE{flightId:DS0603, spareTail:VT-DS17}', () => {
    const start = parseTimeToMinutes('06:00');
    const end = parseTimeToMinutes('08:30');

    const result = simulate(network, {
      closures: [{ id: 'C_BLR', airport: 'BLR', start, end }],
      actions: [{ type: 'SWAP_SPARE', flightId: 'DS0603', spareTail: 'VT-DS17' }]
    });

    // DS0603-05 run on time on VT-DS17 with a standby crew
    const fMap = new Map(result.flights.map((f) => [f.flightId, f]));

    const f03 = fMap.get('DS0603')!;
    expect(f03.tailId).toBe('VT-DS17');
    expect(f03.arrDelay).toBe(0);
    expect(f03.depDelay).toBe(0);
    expect(f03.status).toBe('ON_TIME');

    const f04 = fMap.get('DS0604')!;
    expect(f04.tailId).toBe('VT-DS17');
    expect(f04.arrDelay).toBe(0);
    expect(f04.depDelay).toBe(0);

    const f05 = fMap.get('DS0605')!;
    expect(f05.tailId).toBe('VT-DS17');
    expect(f05.arrDelay).toBe(0);
    expect(f05.depDelay).toBe(0);

    // Only DS0601 (150) and DS0602 (145) remain late
    const f01 = fMap.get('DS0601')!;
    expect(f01.tailId).toBe('VT-DS06');
    expect(f01.depDelay).toBe(150);
    expect(f01.arrDelay).toBe(150);

    const f02 = fMap.get('DS0602')!;
    expect(f02.tailId).toBe('VT-DS06');
    expect(f02.depDelay).toBe(145);
    expect(f02.arrDelay).toBe(145);

    expect(result.metrics.delayedFlights).toBe(2);
    expect(result.metrics.totalArrDelayMin).toBe(295);
    expect(result.metrics.totalDepDelayMin).toBe(295);

    // strandedPaxTotal 0, crewBreaches 0
    expect(result.metrics.strandedPaxTotal).toBe(0);
    expect(result.metrics.missedConnections).toBe(0);
    expect(result.metrics.crewBreaches).toBe(0);

    // CR06 dutyMin 345
    const cr06 = result.crews.find((cr) => cr.crewId === 'CR06')!;
    expect(cr06.dutyMin).toBe(345);
    expect(cr06.breach).toBe(false);

    // Standby crew for spare
    const standbyCr = result.crews.find((cr) => cr.standby && cr.tailId === 'VT-DS17');
    expect(standbyCr).toBeDefined();
    expect(standbyCr!.breach).toBe(false);
  });

  it('G4: Action validity checks', async () => {
    const { validateActions } = await import('@/engine/actions');

    // CANCEL [DS0102] invalid (aircraft stranded at JAI)
    const val1 = validateActions(network, {
      closures: [],
      actions: [{ type: 'CANCEL', flightIds: ['DS0102'] }]
    });
    expect(val1.valid).toBe(false);
    expect(val1.reasons.some((r) => r.includes('aircraft would be stranded at JAI'))).toBe(true);

    // CANCEL [DS0103, DS0104] valid (out-and-back)
    const val2 = validateActions(network, {
      closures: [],
      actions: [{ type: 'CANCEL', flightIds: ['DS0103', 'DS0104'] }]
    });
    expect(val2.valid).toBe(true);
    expect(val2.reasons).toHaveLength(0);

    // CANCEL [DS0105] valid (suffix)
    const val3 = validateActions(network, {
      closures: [],
      actions: [{ type: 'CANCEL', flightIds: ['DS0105'] }]
    });
    expect(val3.valid).toBe(true);
    expect(val3.reasons).toHaveLength(0);

    // SWAP_SPARE VT-DS17 (base BLR) on a flight not originating at BLR (DS0101 at DEL) is invalid
    const val4 = validateActions(network, {
      closures: [],
      actions: [{ type: 'SWAP_SPARE', flightId: 'DS0101', spareTail: 'VT-DS17' }]
    });
    expect(val4.valid).toBe(false);
    expect(val4.reasons.some((r) => r.includes('does not match flight DS0101 origin'))).toBe(true);
  });

  it('G5: Number-safety test - reject literal wrong numbers, retry, fallback, fact grounding', async () => {
    const { runDispatchPipeline } = await import('@/ai/dispatch');
    const { MockLLMProvider } = await import('@/ai/providers/mock');
    const { buildFactsCatalog } = await import('@/ai/facts');
    const { recommendRecoveryPlans } = await import('@/engine/candidates');
    const { validateRenderedText } = await import('@/ai/validator');

    const start = parseTimeToMinutes('06:00');
    const end = parseTimeToMinutes('08:30');
    const scenario = { closures: [{ id: 'C_BLR', airport: 'BLR', start, end }] };

    // 1. Mock LLM that writes a literal wrong number ("37 passengers")
    const badMock = new MockLLMProvider('always_hallucinate');
    const badResult = await runDispatchPipeline(network, scenario, {
      customProvider: badMock
    });

    expect(badResult.validation.retries).toBe(1);
    expect(badResult.validation.usedFallback).toBe(true);
    expect(badResult.validation.violations.length).toBeGreaterThan(0);

    // 2. Mock LLM with correct placeholders passes
    const goodMock = new MockLLMProvider('correct');
    const goodResult = await runDispatchPipeline(network, scenario, {
      customProvider: goodMock
    });

    expect(goodResult.validation.retries).toBe(0);
    expect(goodResult.validation.usedFallback).toBe(false);
    expect(goodResult.validation.passed).toBe(true);

    // 3. Every number in final text must appear in FACTS
    const { disruptedResult, rankedPlans } = recommendRecoveryPlans(network, scenario);
    const factsCatalog = buildFactsCatalog(network, disruptedResult, rankedPlans);
    const textValidation = validateRenderedText(goodResult.narrative, factsCatalog);
    expect(textValidation.passed).toBe(true);
  });
});
