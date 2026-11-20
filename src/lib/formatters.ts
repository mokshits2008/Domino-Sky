import { CauseType } from '@/engine/types';

/**
 * Format integer minutes since 00:00 IST into "HH:MM" (or "HH:MM +1d" if >= 1440).
 * Handles negative or overflow minutes safely.
 */
export function formatTime(totalMinutes: number): string {
  if (!Number.isFinite(totalMinutes)) return '--:--';
  const rounded = Math.round(totalMinutes);
  if (rounded < 0) {
    return `-${formatTime(Math.abs(rounded))}`;
  }
  const days = Math.floor(rounded / 1440);
  const rem = rounded % 1440;
  const hours = Math.floor(rem / 60);
  const mins = rem % 60;
  const hh = hours.toString().padStart(2, '0');
  const mm = mins.toString().padStart(2, '0');
  const suffix = days > 0 ? ` +${days}d` : '';
  return `${hh}:${mm}${suffix}`;
}

/**
 * Format delay minutes as "+45m", "+2h 30m", "+2h", or "0m".
 */
export function formatDelay(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes === 0) return '0m';
  const sign = minutes > 0 ? '+' : '-';
  const abs = Math.abs(Math.round(minutes));
  const hours = Math.floor(abs / 60);
  const mins = abs % 60;

  if (hours === 0) {
    return `${sign}${mins}m`;
  }
  if (mins === 0) {
    return `${sign}${hours}h`;
  }
  return `${sign}${hours}h ${mins}m`;
}

/**
 * Format duration minutes as "45m", "2h", or "2h 30m".
 */
export function formatDuration(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return '0m';
  const rounded = Math.round(minutes);
  const hours = Math.floor(rounded / 60);
  const mins = rounded % 60;

  if (hours === 0) {
    return `${mins}m`;
  }
  if (mins === 0) {
    return `${hours}h`;
  }
  return `${hours}h ${mins}m`;
}

/**
 * Formats a closure interval [start, end) as "HH:MM to HH:MM".
 */
export function formatClosureWindow(start: number, end: number): string {
  return `${formatTime(start)} to ${formatTime(end)}`;
}

/**
 * Standard human-readable labels for root cause types.
 */
export const CAUSE_LABELS: Record<CauseType, string> = {
  AIRPORT_CLOSED_ORIGIN: 'Airport closed',
  AIRPORT_CLOSED_DEST_HOLD: 'Held on arrival',
  GROUND_HOLD_DEST_CLOSED: 'Held on ground',
  KNOCK_ON_AIRCRAFT: 'Late aircraft',
  KNOCK_ON_CREW: 'Late crew',
  SPARE_NOT_READY: 'Spare not ready',
  CANCELLED: 'Cancelled',
  ON_TIME: 'On time',
};

export function getCauseLabel(causeType?: CauseType | string): string {
  if (!causeType) return 'On time';
  return (CAUSE_LABELS as Record<string, string>)[causeType] || causeType;
}

/**
 * Severity chip display labels.
 */
export const SEVERITY_LABELS: Record<string, string> = {
  NONE: 'On time',
  MINOR: 'Minor (+1-14m)',
  MODERATE: 'Moderate (+15-59m)',
  SEVERE: 'Severe (+60m+)',
  CANCELLED: 'Cancelled',
};

export function getSeverityLabel(severity: string): string {
  return SEVERITY_LABELS[severity] || severity;
}

/**
 * Returns canonical integer tier (1, 2, 3) for an airport regardless of dataset representation.
 */
export function getAirportTier(tier: string): 1 | 2 | 3 {
  const t = String(tier).toLowerCase();
  if (t === '1' || t === 'mega_hub' || t === 'tier 1' || t === 'tier1') return 1;
  if (t === '2' || t === 'regional_hub' || t === 'tier 2' || t === 'tier2') return 2;
  return 3;
}

/**
 * Formats airport tier label for UI display.
 */
export function getAirportTierLabel(tier: string): string {
  const num = getAirportTier(tier);
  if (num === 1) return 'Tier 1 — Mega Hub';
  if (num === 2) return 'Tier 2 — Regional Hub';
  return 'Tier 3 — Spoke Airport';
}
