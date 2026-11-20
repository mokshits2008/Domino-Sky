import { Action, Scenario } from './types';

/**
 * Produces a canonical string representation of a scenario for deterministic hashing.
 */
export function canonicalizeScenario(scenario: Scenario): string {
  const normalizedClosures = [...scenario.closures].map((c) => ({
    airport: c.airport,
    start: c.start,
    end: c.end,
    id: c.id
  })).sort((a, b) => {
    if (a.airport !== b.airport) return a.airport.localeCompare(b.airport);
    if (a.start !== b.start) return a.start - b.start;
    if (a.end !== b.end) return a.end - b.end;
    return a.id.localeCompare(b.id);
  });

  const normalizedActions = scenario.actions ? [...scenario.actions].map((a): Action => {
    if (a.type === 'CANCEL') {
      return {
        type: 'CANCEL',
        flightIds: [...a.flightIds].sort()
      };
    }
    return {
      type: 'SWAP_SPARE',
      flightId: a.flightId,
      spareTail: a.spareTail
    };
  }).sort((a, b) => {
    if (a.type !== b.type) return a.type.localeCompare(b.type);
    if (a.type === 'CANCEL' && b.type === 'CANCEL') {
      return a.flightIds.join(',').localeCompare(b.flightIds.join(','));
    }
    if (a.type === 'SWAP_SPARE' && b.type === 'SWAP_SPARE') {
      return `${a.flightId}:${a.spareTail}`.localeCompare(`${b.flightId}:${b.spareTail}`);
    }
    return 0;
  }) : [];

  const canonicalObj = {
    closures: normalizedClosures,
    actions: normalizedActions,
    decisionTime: scenario.decisionTime ?? null,
    config: scenario.config ?? {}
  };

  return JSON.stringify(canonicalObj);
}

/**
 * Pure TypeScript 64-bit FNV-1a hash formatted as a 16-character hex string.
 * Completely deterministic and portable across Node and browser without crypto dependencies.
 */
export function hashScenario(scenario: Scenario): string {
  const str = canonicalizeScenario(scenario);
  let h1 = 0x811c9dc5;
  let h2 = 0x811c9dc5 ^ 0x5a5a5a5a;

  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 0x01000193);
    h2 = Math.imul(h2 ^ (ch * 31), 0x01000193);
  }

  const p1 = (h1 >>> 0).toString(16).padStart(8, '0');
  const p2 = (h2 >>> 0).toString(16).padStart(8, '0');
  return `${p1}${p2}`;
}
