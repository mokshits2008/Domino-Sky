import { loadFlightNetwork } from '../src/engine/load';
import { simulate } from '../src/engine/simulate';
import { parseTimeToMinutes, formatMinutesToTime } from '../src/engine/time';
import { Action, Closure, Scenario } from '../src/engine/types';

function parseArgs(): Scenario {
  const args = process.argv.slice(2);
  const closures: Closure[] = [];
  const actions: Action[] = [];
  let arrivalPolicy: 'AIRBORNE_HOLD' | 'GROUND_HOLD' = 'AIRBORNE_HOLD';

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--closure' && i + 1 < args.length) {
      const parts = args[++i].split(',');
      if (parts.length === 3) {
        const [airport, startStr, endStr] = parts;
        closures.push({
          id: `CLI_${airport}_${startStr}`,
          airport: airport.trim(),
          start: parseTimeToMinutes(startStr.trim()),
          end: parseTimeToMinutes(endStr.trim())
        });
      }
    } else if (arg.startsWith('--closure=')) {
      const parts = arg.substring('--closure='.length).split(',');
      if (parts.length === 3) {
        const [airport, startStr, endStr] = parts;
        closures.push({
          id: `CLI_${airport}_${startStr}`,
          airport: airport.trim(),
          start: parseTimeToMinutes(startStr.trim()),
          end: parseTimeToMinutes(endStr.trim())
        });
      }
    } else if (arg === '--policy' && i + 1 < args.length) {
      arrivalPolicy = args[++i].trim() as 'AIRBORNE_HOLD' | 'GROUND_HOLD';
    } else if (arg === '--cancel' && i + 1 < args.length) {
      const flightIds = args[++i].split(',').map((id) => id.trim());
      actions.push({ type: 'CANCEL', flightIds });
    } else if (arg === '--swapSpare' && i + 1 < args.length) {
      const [flightId, spareTail] = args[++i].split(',').map((s) => s.trim());
      actions.push({ type: 'SWAP_SPARE', flightId, spareTail });
    }
  }

  return {
    closures,
    actions,
    config: { arrivalPolicy }
  };
}

function runCLI() {
  const network = loadFlightNetwork();
  const scenario = parseArgs();

  console.log('===============================================================');
  console.log('              DOMINO SKY — CASCADE SIMULATOR CLI               ');
  console.log('===============================================================');

  if (scenario.closures.length === 0) {
    console.log('Running Baseline Scenario (no closures).');
    console.log('Tip: Pass --closure <airport>,<start>,<end> (e.g. BLR,06:00,08:30)\n');
  } else {
    console.log('Active Closures:');
    for (const c of scenario.closures) {
      console.log(`  * ${c.airport}: ${formatMinutesToTime(c.start)} -> ${formatMinutesToTime(c.end)} (inclusive-exclusive [${c.start}, ${c.end}))`);
    }
    console.log();
  }

  if (scenario.actions && scenario.actions.length > 0) {
    console.log('Active Recovery Actions:');
    for (const a of scenario.actions) {
      if (a.type === 'CANCEL') {
        console.log(`  * CANCEL: ${a.flightIds.join(', ')}`);
      } else {
        console.log(`  * SWAP_SPARE: Flight ${a.flightId} -> Spare ${a.spareTail}`);
      }
    }
    console.log();
  }

  const result = simulate(network, scenario);
  const m = result.metrics;

  console.log('---------------------------------------------------------------');
  console.log('                       SIMULATION METRICS                      ');
  console.log('---------------------------------------------------------------');
  console.log(`Total Flights:          ${m.totalFlights}`);
  console.log(`Delayed Flights:        ${m.delayedFlights}`);
  console.log(`Cancelled Flights:      ${m.cancelledFlights}`);
  console.log(`Total Dep Delay:        ${m.totalDepDelayMin} min`);
  console.log(`Total Arr Delay:        ${m.totalArrDelayMin} min`);
  console.log(`Max Arr Delay:          ${m.maxArrDelayMin} min`);
  console.log(`Pax Delay Minutes:      ${m.paxDelayMinutes}`);
  console.log(`Missed Connections:     ${m.missedConnections} (${m.missedConnectionPax} pax)`);
  console.log(`Cancelled Pax:          ${m.cancelledPax} pax`);
  console.log(`Total Stranded Pax:     ${m.strandedPaxTotal} pax`);
  console.log(`Crew Duty Breaches:     ${m.crewBreaches} (${m.crewBreachExcessMin} excess min)`);
  console.log(`Propagation Depth Max:  ${m.propagationDepthMax}`);
  console.log(`Scenario Fingerprint:   ${result.scenarioFingerprint}`);
  console.log('---------------------------------------------------------------\n');

  // Delayed / Cancelled Flights Breakdown
  const impactedFlights = result.flights.filter((f) => f.cancelled || f.arrDelay > 0);
  if (impactedFlights.length > 0) {
    console.log('IMPACTED FLIGHTS & CAUSE CHAINS:');
    for (const f of impactedFlights) {
      if (f.cancelled) {
        console.log(`  [CANCELLED] ${f.flightId} (${f.tailId}) ${f.origin}->${f.destination}`);
        continue;
      }
      const depStr = `${formatMinutesToTime(f.actualDep!)} (delay: +${f.depDelay}m)`;
      const arrStr = `${formatMinutesToTime(f.actualArr!)} (delay: +${f.arrDelay}m)`;
      const cause = f.primaryCause.type;
      const chain = f.causeChain.join(' <- ');

      console.log(`  [DELAYED] ${f.flightId} (${f.tailId}) ${f.origin}->${f.destination} | Dep: ${depStr} | Arr: ${arrStr}`);
      console.log(`    Primary Cause: ${cause} (+${f.primaryCause.minutes}m)`);
      if (chain) console.log(`    Cause Chain:   ${chain}`);
      if (f.slackAbsorbedMin > 0) console.log(`    Slack Absorbed: ${f.slackAbsorbedMin}m`);
      console.log(`    Explanation:   ${f.explanation}`);
    }
    console.log();
  }

  // Missed Connections Breakdown
  const missedConns = result.connections.filter((c) => c.status === 'MISSED');
  if (missedConns.length > 0) {
    console.log('MISSED CONNECTIONS:');
    for (const c of missedConns) {
      console.log(`  * ${c.connectionId} at ${c.airport}: ${c.fromFlight} -> ${c.toFlight} (${c.passengers} pax) [Gap: ${c.gapMin ?? 'N/A'}m < Min: ${c.minConnect}m, Reason: ${c.reason}]`);
    }
    console.log();
  }

  // Crew Breaches Breakdown
  const breachingCrews = result.crews.filter((cr) => cr.breach);
  if (breachingCrews.length > 0) {
    console.log('CREW DUTY BREACHES:');
    for (const cr of breachingCrews) {
      console.log(`  * ${cr.crewId} (${cr.tailId}): Duty ${cr.dutyMin}m > Max ${cr.maxDutyMin}m (Excess: +${cr.excessMin}m)`);
    }
    console.log();
  }
}

runCLI();
