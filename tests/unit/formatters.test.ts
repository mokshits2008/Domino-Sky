import { describe, it, expect } from 'vitest';
import {
  formatTime,
  formatDelay,
  formatDuration,
  formatClosureWindow,
  getCauseLabel,
  getAirportTier,
  getAirportTierLabel,
} from '../../src/lib/formatters';

describe('Formatters Unit Tests', () => {
  describe('formatTime', () => {
    it('formats single digit and double digit hours/minutes', () => {
      expect(formatTime(0)).toBe('00:00');
      expect(formatTime(330)).toBe('05:30');
      expect(formatTime(510)).toBe('08:30');
      expect(formatTime(1439)).toBe('23:59');
    });

    it('formats >= 1440 with +1d or +Nd suffix', () => {
      expect(formatTime(1440)).toBe('00:00 +1d');
      expect(formatTime(1590)).toBe('02:30 +1d');
      expect(formatTime(2880)).toBe('00:00 +2d');
    });

    it('handles negative or invalid numbers safely', () => {
      expect(formatTime(-60)).toBe('-01:00');
      expect(formatTime(NaN)).toBe('--:--');
    });
  });

  describe('formatDelay', () => {
    it('formats 0 delay', () => {
      expect(formatDelay(0)).toBe('0m');
    });

    it('formats minutes under 60', () => {
      expect(formatDelay(45)).toBe('+45m');
      expect(formatDelay(12)).toBe('+12m');
    });

    it('formats exact hours', () => {
      expect(formatDelay(60)).toBe('+1h');
      expect(formatDelay(120)).toBe('+2h');
    });

    it('formats mixed hours and minutes', () => {
      expect(formatDelay(150)).toBe('+2h 30m');
      expect(formatDelay(75)).toBe('+1h 15m');
    });
  });

  describe('formatDuration', () => {
    it('formats zero or negative', () => {
      expect(formatDuration(0)).toBe('0m');
      expect(formatDuration(-10)).toBe('0m');
    });

    it('formats minutes and hours', () => {
      expect(formatDuration(45)).toBe('45m');
      expect(formatDuration(90)).toBe('1h 30m');
      expect(formatDuration(120)).toBe('2h');
      expect(formatDuration(180)).toBe('3h');
    });
  });

  describe('formatClosureWindow', () => {
    it('formats interval [start, end)', () => {
      expect(formatClosureWindow(360, 510)).toBe('06:00 to 08:30');
      expect(formatClosureWindow(540, 630)).toBe('09:00 to 10:30');
    });
  });

  describe('getCauseLabel', () => {
    it('returns proper strings for cause types', () => {
      expect(getCauseLabel('AIRPORT_CLOSED_ORIGIN')).toBe('Airport closed');
      expect(getCauseLabel('AIRPORT_CLOSED_DEST_HOLD')).toBe('Held on arrival');
      expect(getCauseLabel('GROUND_HOLD_DEST_CLOSED')).toBe('Held on ground');
      expect(getCauseLabel('KNOCK_ON_AIRCRAFT')).toBe('Late aircraft');
      expect(getCauseLabel('KNOCK_ON_CREW')).toBe('Late crew');
      expect(getCauseLabel('SPARE_NOT_READY')).toBe('Spare not ready');
      expect(getCauseLabel('CANCELLED')).toBe('Cancelled');
      expect(getCauseLabel('ON_TIME')).toBe('On time');
    });
  });

  describe('getAirportTier and getAirportTierLabel', () => {
    it('maps string names and numeric strings accurately', () => {
      expect(getAirportTier('mega_hub')).toBe(1);
      expect(getAirportTier('1')).toBe(1);
      expect(getAirportTier('regional_hub')).toBe(2);
      expect(getAirportTier('2')).toBe(2);
      expect(getAirportTier('spoke')).toBe(3);
      expect(getAirportTier('3')).toBe(3);
    });

    it('returns formatted label', () => {
      expect(getAirportTierLabel('mega_hub')).toBe('Tier 1 — Mega Hub');
      expect(getAirportTierLabel('regional_hub')).toBe('Tier 2 — Regional Hub');
      expect(getAirportTierLabel('spoke')).toBe('Tier 3 — Spoke Airport');
    });
  });
});
