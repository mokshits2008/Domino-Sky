import { describe, it, expect } from 'vitest';
import { parseTimeToMinutes, formatMinutesToTime, isWithinInterval } from '@/engine/time';

describe('Time utilities', () => {
  it('parses standard HH:MM strings into integer minutes', () => {
    expect(parseTimeToMinutes('00:00')).toBe(0);
    expect(parseTimeToMinutes('06:00')).toBe(360);
    expect(parseTimeToMinutes('08:30')).toBe(510);
    expect(parseTimeToMinutes('12:15')).toBe(735);
    expect(parseTimeToMinutes('23:59')).toBe(1439);
  });

  it('parses multi-day HH:MM+Nd strings correctly', () => {
    expect(parseTimeToMinutes('00:00+1d')).toBe(1440);
    expect(parseTimeToMinutes('01:30+1d')).toBe(1530);
    expect(parseTimeToMinutes('10:00+2d')).toBe(2 * 1440 + 600);
  });

  it('throws on invalid time strings', () => {
    expect(() => parseTimeToMinutes('invalid')).toThrow();
    expect(() => parseTimeToMinutes('25:00')).toThrow();
    expect(() => parseTimeToMinutes('12:60')).toThrow();
    expect(() => parseTimeToMinutes('12')).toThrow();
  });

  it('formats integer minutes to HH:MM format', () => {
    expect(formatMinutesToTime(0)).toBe('00:00');
    expect(formatMinutesToTime(360)).toBe('06:00');
    expect(formatMinutesToTime(510)).toBe('08:30');
    expect(formatMinutesToTime(1439)).toBe('23:59');
  });

  it('formats >= 1440 minutes with +Nd suffix', () => {
    expect(formatMinutesToTime(1440)).toBe('00:00+1d');
    expect(formatMinutesToTime(1530)).toBe('01:30+1d');
    expect(formatMinutesToTime(2880)).toBe('00:00+2d');
  });

  it('formats negative minutes cleanly', () => {
    expect(formatMinutesToTime(-60)).toBe('-01:00');
  });

  it('round-trips minutes accurately', () => {
    const minutesToTest = [0, 15, 360, 510, 1439, 1440, 1530, 2900];
    for (const m of minutesToTest) {
      const formatted = formatMinutesToTime(m);
      const parsed = parseTimeToMinutes(formatted);
      expect(parsed).toBe(m);
    }
  });

  it('evaluates interval [start, end) semantics (start inclusive, end exclusive)', () => {
    const start = 360; // 06:00
    const end = 510;   // 08:30

    expect(isWithinInterval(359, start, end)).toBe(false);
    expect(isWithinInterval(360, start, end)).toBe(true);  // start inclusive
    expect(isWithinInterval(400, start, end)).toBe(true);
    expect(isWithinInterval(509, start, end)).toBe(true);
    expect(isWithinInterval(510, start, end)).toBe(false); // end exclusive
    expect(isWithinInterval(511, start, end)).toBe(false);
  });
});
