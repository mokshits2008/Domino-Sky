import { FlightResult, Closure } from '@/engine/types';

export interface GanttDimensions {
  viewStartMin: number; // e.g. 300 (05:00)
  viewEndMin: number;   // e.g. 1560 (02:00 +1d)
  widthPx: number;      // total width of the SVG timeline area
  rowHeightPx: number;  // height of each row, e.g. 40px
  headerHeightPx: number; // height of time axis header, e.g. 32px
}

export const DEFAULT_GANTT_DIMENSIONS: GanttDimensions = {
  viewStartMin: 300,  // 05:00
  viewEndMin: 1560,  // 02:00 +1d
  widthPx: 1260,     // 1 px per minute across 1260 minutes
  rowHeightPx: 44,
  headerHeightPx: 36,
};

/**
 * Converts a minute timestamp to horizontal pixel offset within the timeline.
 */
export function minuteToX(minute: number, dim: GanttDimensions = DEFAULT_GANTT_DIMENSIONS): number {
  const totalMinutes = dim.viewEndMin - dim.viewStartMin;
  if (totalMinutes <= 0) return 0;
  const ratio = (minute - dim.viewStartMin) / totalMinutes;
  return Math.round(ratio * dim.widthPx * 10) / 10;
}

/**
 * Converts a horizontal pixel offset back to a minute timestamp.
 */
export function xToMinute(x: number, dim: GanttDimensions = DEFAULT_GANTT_DIMENSIONS): number {
  if (dim.widthPx <= 0) return dim.viewStartMin;
  const ratio = x / dim.widthPx;
  const minute = dim.viewStartMin + ratio * (dim.viewEndMin - dim.viewStartMin);
  return Math.round(minute);
}

export interface FlightBarGeometry {
  flightId: string;
  tailId: string;
  schedX: number;
  schedWidth: number;
  actualX: number;
  actualWidth: number;
  delayX: number;
  delayWidth: number;
  holdX: number;
  holdWidth: number;
  y: number;
  height: number;
  isDelayed: boolean;
  isCancelled: boolean;
}

/**
 * Computes SVG bar coordinates and dimensions for a flight.
 */
export function computeFlightBarGeometry(
  flight: FlightResult,
  rowIndex: number,
  dim: GanttDimensions = DEFAULT_GANTT_DIMENSIONS
): FlightBarGeometry {
  const schedX = minuteToX(flight.schedDep, dim);
  const schedEndX = minuteToX(flight.schedArr, dim);
  const schedWidth = Math.max(2, schedEndX - schedX);

  const actualDepMin = flight.actualDep ?? flight.schedDep;
  const actualArrMin = flight.actualArr ?? flight.schedArr;

  const actualX = minuteToX(actualDepMin, dim);
  const actualEndX = minuteToX(actualArrMin, dim);
  const actualWidth = Math.max(2, actualEndX - actualX);

  // Delay extension bar (from schedArr to actualArr) if arrival is delayed
  let delayX = 0;
  let delayWidth = 0;
  if (flight.actualArr !== null && flight.actualArr > flight.schedArr && !flight.cancelled) {
    delayX = Math.max(schedEndX, actualX);
    delayWidth = Math.max(0, actualEndX - delayX);
  }

  // Arrival hold bar if there was an airborne hold
  let holdX = 0;
  let holdWidth = 0;
  if (flight.actualArr !== null && flight.arrivalHoldMin > 0 && !flight.cancelled) {
    const holdStartMin = flight.actualArr - flight.arrivalHoldMin;
    holdX = minuteToX(holdStartMin, dim);
    holdWidth = Math.max(2, actualEndX - holdX);
  }

  const barHeight = Math.round(dim.rowHeightPx * 0.58);
  const y = rowIndex * dim.rowHeightPx + Math.round((dim.rowHeightPx - barHeight) / 2);

  return {
    flightId: flight.flightId,
    tailId: flight.tailId,
    schedX,
    schedWidth,
    actualX,
    actualWidth,
    delayX,
    delayWidth,
    holdX,
    holdWidth,
    y,
    height: barHeight,
    isDelayed: flight.arrDelay > 0,
    isCancelled: flight.cancelled,
  };
}

export interface ClosureBandGeometry {
  id: string;
  airport: string;
  x: number;
  width: number;
}

/**
 * Computes SVG vertical band coordinates for a closure interval.
 */
export function computeClosureBandGeometry(
  closure: Closure,
  dim: GanttDimensions = DEFAULT_GANTT_DIMENSIONS
): ClosureBandGeometry {
  const startX = minuteToX(closure.start, dim);
  const endX = minuteToX(closure.end, dim);
  return {
    id: closure.id,
    airport: closure.airport,
    x: Math.max(0, startX),
    width: Math.max(2, endX - startX),
  };
}

/**
 * Generates hourly grid lines for the timeline.
 */
export function generateHourlyGrid(dim: GanttDimensions = DEFAULT_GANTT_DIMENSIONS): Array<{ minute: number; x: number; label: string; isMajor: boolean }> {
  const lines: Array<{ minute: number; x: number; label: string; isMajor: boolean }> = [];
  const startHour = Math.floor(dim.viewStartMin / 60);
  const endHour = Math.ceil(dim.viewEndMin / 60);

  for (let h = startHour; h <= endHour; h++) {
    const minute = h * 60;
    if (minute >= dim.viewStartMin && minute <= dim.viewEndMin) {
      const x = minuteToX(minute, dim);
      const hoursInDay = h % 24;
      const dayOffset = Math.floor(h / 24);
      const label = `${hoursInDay.toString().padStart(2, '0')}:00${dayOffset > 0 ? ' +1d' : ''}`;
      lines.push({
        minute,
        x,
        label,
        isMajor: h % 3 === 0,
      });
    }
  }
  return lines;
}
