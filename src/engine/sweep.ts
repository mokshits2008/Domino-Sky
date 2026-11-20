import { FlightNetworkData, Minute } from './types';
import { simulate } from './simulate';
import { formatMinutesToTime } from './time';

export interface VulnerabilitySweepOptions {
  durations?: Minute[];
  stepMin?: Minute;
  windowStart?: Minute;
  windowEnd?: Minute;
}

export interface VulnerabilityCell {
  airport: string;
  start: Minute;
  startFormatted: string;
  duration: Minute;
  end: Minute;
  endFormatted: string;
  strandedPax: number;
  delayedFlights: number;
  totalDelay: number;
  breaches: number;
}

export interface VulnerabilityRanking {
  rank: number;
  airport: string;
  start: Minute;
  startFormatted: string;
  duration: Minute;
  endFormatted: string;
  damageScore: number;
  strandedPax: number;
  delayedFlights: number;
  totalDelay: number;
  breaches: number;
}

export interface VulnerabilitySweepResult {
  options: {
    durations: Minute[];
    stepMin: Minute;
    windowStart: Minute;
    windowEnd: Minute;
  };
  totalScenariosEvaluated: number;
  elapsedMs: number;
  heatmap: VulnerabilityCell[];
  mostDamagingClosures: VulnerabilityRanking[];
}

export function runVulnerabilitySweep(
  network: FlightNetworkData,
  userOptions?: VulnerabilitySweepOptions
): VulnerabilitySweepResult {
  const durations = userOptions?.durations ?? [60, 90, 120];
  const stepMin = userOptions?.stepMin ?? 30;
  const windowStart = userOptions?.windowStart ?? 300; // 05:00
  const windowEnd = userOptions?.windowEnd ?? 1200;    // 20:00

  const startTime = Date.now ? Date.now() : 0; // Pure fallback for Node/browser
  const heatmap: VulnerabilityCell[] = [];

  for (const airport of network.airports) {
    const aid = airport.id;
    for (const duration of durations) {
      for (let start = windowStart; start <= windowEnd; start += stepMin) {
        const end = start + duration;
        const closure = {
          id: `SWEEP_${aid}_${start}_${duration}`,
          airport: aid,
          start,
          end
        };

        const res = simulate(network, { closures: [closure] });
        const m = res.metrics;

        heatmap.push({
          airport: aid,
          start,
          startFormatted: formatMinutesToTime(start),
          duration,
          end,
          endFormatted: formatMinutesToTime(end),
          strandedPax: m.strandedPaxTotal,
          delayedFlights: m.delayedFlights,
          totalDelay: m.totalArrDelayMin,
          breaches: m.crewBreaches
        });
      }
    }
  }

  // Calculate damage score and rank top damaging closures
  const scored = heatmap.map((c) => {
    const damageScore =
      1.0 * c.strandedPax +
      0.5 * c.totalDelay +
      250 * c.breaches +
      5 * c.delayedFlights;
    return { ...c, damageScore };
  });

  scored.sort((a, b) => {
    if (b.damageScore !== a.damageScore) {
      return b.damageScore - a.damageScore;
    }
    if (b.strandedPax !== a.strandedPax) {
      return b.strandedPax - a.strandedPax;
    }
    if (b.totalDelay !== a.totalDelay) {
      return b.totalDelay - a.totalDelay;
    }
    return a.airport.localeCompare(b.airport);
  });

  const mostDamagingClosures: VulnerabilityRanking[] = scored.slice(0, 20).map((item, idx) => ({
    rank: idx + 1,
    airport: item.airport,
    start: item.start,
    startFormatted: item.startFormatted,
    duration: item.duration,
    endFormatted: item.endFormatted,
    damageScore: Math.round(item.damageScore * 10) / 10,
    strandedPax: item.strandedPax,
    delayedFlights: item.delayedFlights,
    totalDelay: item.totalDelay,
    breaches: item.breaches
  }));

  const endTime = Date.now ? Date.now() : 0;

  return {
    options: {
      durations,
      stepMin,
      windowStart,
      windowEnd
    },
    totalScenariosEvaluated: heatmap.length,
    elapsedMs: endTime - startTime,
    heatmap,
    mostDamagingClosures
  };
}
