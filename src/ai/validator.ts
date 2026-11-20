import { FactsCatalog } from './facts';

export interface ValidationReport {
  passed: boolean;
  violations: string[];
  numericTokensFound: string[];
}

/**
 * Scans rendered text and rejects any numeric token not present in the facts catalog.
 * Strips known flight IDs, tails, airport codes, and HH:MM times before scanning.
 */
export function validateRenderedText(
  text: string,
  catalog: FactsCatalog
): ValidationReport {
  const violations: string[] = [];
  const numericTokensFound: string[] = [];

  let stripped = text;

  // 1. Strip known flight IDs (e.g. DS0601)
  for (const fid of catalog.knownFlightIds) {
    stripped = stripped.replaceAll(new RegExp(`\\b${fid}\\b`, 'g'), ' ');
  }

  // 2. Strip known tail IDs (e.g. VT-DS06)
  for (const tid of catalog.knownTailIds) {
    stripped = stripped.replaceAll(new RegExp(`\\b${tid}\\b`, 'g'), ' ');
  }

  // 3. Strip known airport codes (e.g. BLR, BOM)
  for (const code of catalog.knownAirports) {
    stripped = stripped.replaceAll(new RegExp(`\\b${code}\\b`, 'g'), ' ');
  }

  // 4. Strip HH:MM times (e.g. 08:30, 08:30+1d)
  stripped = stripped.replaceAll(/\b\d{1,2}:\d{2}(?:\+\d+d)?\b/g, ' ');

  // 5. Scan for all remaining numeric tokens
  const numberRegex = /\b\d+(?:\.\d+)?\b/g;
  let match: RegExpExecArray | null;

  while ((match = numberRegex.exec(stripped)) !== null) {
    const token = match[0];
    numericTokensFound.push(token);

    const intVal = parseInt(token, 10).toString();
    const isAllowed = catalog.allowedNumbers.has(token) || catalog.allowedNumbers.has(intVal);

    if (!isAllowed) {
      violations.push(`Unauthorized numeric token: "${token}" at position ${match.index}`);
    }
  }

  return {
    passed: violations.length === 0,
    violations,
    numericTokensFound
  };
}
