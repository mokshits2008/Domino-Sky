import { Minute } from './types';

/**
 * Parses a 24-hour time string "HH:MM" (optionally with "+Nd" suffix) to integer minutes since 00:00.
 * Examples:
 * "00:00" -> 0
 * "08:30" -> 510
 * "01:30+1d" -> 1590
 */
export function parseTimeToMinutes(timeStr: string): Minute {
  const trimmed = timeStr.trim();
  const dayMatch = trimmed.match(/^(\d{1,2}):(\d{2})(?:\+(\d+)d)?$/);
  if (!dayMatch) {
    throw new Error(`Invalid time format: "${timeStr}". Expected "HH:MM" or "HH:MM+Nd"`);
  }
  const hours = parseInt(dayMatch[1], 10);
  const minutes = parseInt(dayMatch[2], 10);
  const days = dayMatch[3] ? parseInt(dayMatch[3], 10) : 0;

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    throw new Error(`Time component out of bounds: "${timeStr}"`);
  }

  return days * 1440 + hours * 60 + minutes;
}

/**
 * Formats integer minutes since 00:00 as "HH:MM" (or "HH:MM+Nd" if >= 1440).
 * Examples:
 * 0 -> "00:00"
 * 510 -> "08:30"
 * 1440 -> "00:00+1d"
 * 1590 -> "02:30+1d"
 */
export function formatMinutesToTime(totalMinutes: Minute): string {
  if (!Number.isInteger(totalMinutes)) {
    throw new Error(`Minutes must be an integer, received: ${totalMinutes}`);
  }

  if (totalMinutes < 0) {
    const positiveStr = formatMinutesToTime(Math.abs(totalMinutes));
    return `-${positiveStr}`;
  }

  const days = Math.floor(totalMinutes / 1440);
  const remainingMinutes = totalMinutes % 1440;
  const hours = Math.floor(remainingMinutes / 60);
  const minutes = remainingMinutes % 60;

  const hh = hours.toString().padStart(2, '0');
  const mm = minutes.toString().padStart(2, '0');
  const daySuffix = days > 0 ? `+${days}d` : '';

  return `${hh}:${mm}${daySuffix}`;
}

/**
 * Tests whether a minute value falls within a closure interval [start, end).
 * Interval is start inclusive, end exclusive.
 */
export function isWithinInterval(time: Minute, start: Minute, end: Minute): boolean {
  return time >= start && time < end;
}
