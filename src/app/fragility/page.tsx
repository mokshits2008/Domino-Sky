'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { TopBar } from '@/components/layout/TopBar';
import { VulnerabilityCell, VulnerabilitySweepResult } from '@/engine/sweep';
import { runVulnerabilitySweep } from '@/engine/sweep';
import { loadFlightNetwork } from '@/engine/load';
import { formatDelay } from '@/lib/formatters';
import {
  Activity,
  Flame,
} from 'lucide-react';

const networkData = loadFlightNetwork();

export default function FragilityPage() {
  const router = useRouter();

  const [sweepResult, setSweepResult] = useState<VulnerabilitySweepResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDuration, setSelectedDuration] = useState<number>(90);
  const [selectedMetric, setSelectedMetric] = useState<'strandedPax' | 'totalDelay' | 'delayedFlights' | 'breaches'>('strandedPax');

  useEffect(() => {
    let isMounted = true;
    async function fetchSweep() {
      try {
        const res = await fetch('/api/vulnerability', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            durations: [60, 90, 120],
          }),
        });

        if (res.ok) {
          const data: VulnerabilitySweepResult = await res.json();
          if (isMounted) {
            setSweepResult(data);
            setLoading(false);
            return;
          }
        }
      } catch {
        // Fallback to pure client-side sweep
      }

      // Fast fallback using local engine pure function
      const fallback = runVulnerabilitySweep(networkData, { durations: [60, 90, 120] });
      if (isMounted) {
        setSweepResult(fallback);
        setLoading(false);
      }
    }

    fetchSweep();

    return () => {
      isMounted = false;
    };
  }, []);

  const airports = useMemo(() => {
    return networkData.airports.map((a) => a.id);
  }, []);

  // Time slots: 05:00 (300) to 20:00 (1200) every 30m = 31 slots
  const timeSlots = useMemo(() => {
    const slots: Array<{ minute: number; label: string }> = [];
    for (let m = 300; m <= 1200; m += 30) {
      const hh = Math.floor(m / 60).toString().padStart(2, '0');
      const mm = (m % 60).toString().padStart(2, '0');
      slots.push({ minute: m, label: `${hh}:${mm}` });
    }
    return slots;
  }, []);

  // Filter cells by selected duration
  const cellsMap = useMemo(() => {
    if (!sweepResult) return new Map<string, VulnerabilityCell>();
    const map = new Map<string, VulnerabilityCell>();
    sweepResult.heatmap
      .filter((c) => c.duration === selectedDuration)
      .forEach((c) => {
        const key = `${c.airport}_${c.start}`;
        map.set(key, c);
      });
    return map;
  }, [sweepResult, selectedDuration]);

  // Compute min and max for the metric
  const { minVal, maxVal } = useMemo(() => {
    const min = 0;
    let max = 1;
    cellsMap.forEach((c) => {
      const v = c[selectedMetric];
      if (v > max) max = v;
    });
    return { minVal: min, maxVal: max };
  }, [cellsMap, selectedMetric]);

  // Color interpolation: Sage (#A9CDB4) -> Pale Amber (#F5E6B3) -> Clay (#C9776B)
  const getCellColor = (val: number) => {
    if (val === 0) return '#FAF7F2';
    const ratio = Math.min(1, Math.max(0, (val - minVal) / (maxVal - minVal || 1)));

    if (ratio < 0.3) {
      return '#CFE3D4'; // Light sage
    } else if (ratio < 0.6) {
      return '#F5E6B3'; // Amber
    } else if (ratio < 0.85) {
      return '#F6C9A6'; // Moderate orange
    } else {
      return '#C9776B'; // Deep clay
    }
  };

  const getCellTextColor = (val: number) => {
    const ratio = Math.min(1, Math.max(0, (val - minVal) / (maxVal - minVal || 1)));
    if (ratio >= 0.85) return '#FFFFFF';
    return '#2B2F3A';
  };

  const handleCellClick = (cell: VulnerabilityCell) => {
    const closureParam = `${cell.airport}:${cell.startFormatted}-${cell.endFormatted}`;
    router.push(`/?closures=${encodeURIComponent(closureParam)}`);
  };

  const metricLabels = {
    strandedPax: 'Stranded Passengers',
    totalDelay: 'Total Arrival Delay (min)',
    delayedFlights: 'Delayed Flights Count',
    breaches: 'Crew Duty Breaches',
  };

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-canvas">
      <TopBar />

      <main className="flex-1 min-h-0 overflow-y-auto p-6 space-y-6">
        {/* Page Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-border">
          <div className="space-y-1">
            <div className="flex items-center space-x-2.5">
              <div className="p-2 rounded-lg bg-surface border border-border">
                <Activity className="w-5 h-5 text-primary" />
              </div>
              <h1 className="text-lg font-bold text-ink font-sans tracking-tight">
                Network Fragility & Disruption Heatmap
              </h1>
            </div>
            <p className="text-xs text-ink-muted">
              Exhaustive sweep of 1,488 single-airport disruption scenarios across 16 airports and 31 time windows
            </p>
          </div>

          {/* Controls: Duration & Metric Selectors */}
          <div className="flex flex-wrap items-center gap-3 select-none">
            {/* Duration segmented control */}
            <div className="flex items-center space-x-1 p-0.5 bg-surface border border-border rounded-input text-xs">
              <span className="px-2 text-[10px] font-mono text-ink-faint">Duration:</span>
              {[60, 90, 120].map((dur) => (
                <button
                  key={dur}
                  onClick={() => setSelectedDuration(dur)}
                  className={`px-2.5 py-1 rounded-[8px] font-mono transition-colors ${
                    selectedDuration === dur
                      ? 'bg-surface-alt text-ink font-bold shadow-sm'
                      : 'text-ink-muted hover:text-ink'
                  }`}
                >
                  {dur}m
                </button>
              ))}
            </div>

            {/* Metric selector */}
            <div className="flex items-center space-x-1 p-0.5 bg-surface border border-border rounded-input text-xs">
              {(['strandedPax', 'totalDelay', 'delayedFlights', 'breaches'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setSelectedMetric(m)}
                  className={`px-3 py-1 rounded-[8px] transition-colors ${
                    selectedMetric === m
                      ? 'bg-surface-alt text-ink font-bold shadow-sm'
                      : 'text-ink-muted hover:text-ink'
                  }`}
                >
                  {m === 'strandedPax' ? 'Stranded Pax' : m === 'totalDelay' ? 'Total Delay' : m === 'delayedFlights' ? 'Delayed Flights' : 'Crew Breaches'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Heatmap Grid Container */}
        {loading ? (
          <div className="h-96 flex flex-col items-center justify-center space-y-3 bg-surface rounded-card border border-border">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
            <span className="text-xs font-mono text-ink-muted">
              Running full 1,488 scenario vulnerability sweep…
            </span>
          </div>
        ) : (
          <div className="rounded-card border border-border bg-surface shadow-card p-4 space-y-3 overflow-hidden">
            <div className="flex items-center justify-between text-xs text-ink-muted">
              <span className="font-semibold text-ink">
                Airport vs Closure Window (Showing: {metricLabels[selectedMetric]})
              </span>
              <div className="flex items-center space-x-3 text-[11px]">
                <span className="text-ink-faint">Impact:</span>
                <div className="flex items-center space-x-1">
                  <span className="w-3 h-3 rounded-sm bg-[#CFE3D4]"></span>
                  <span>Low</span>
                </div>
                <div className="flex items-center space-x-1">
                  <span className="w-3 h-3 rounded-sm bg-[#F5E6B3]"></span>
                  <span>Moderate</span>
                </div>
                <div className="flex items-center space-x-1">
                  <span className="w-3 h-3 rounded-sm bg-[#C9776B]"></span>
                  <span>High (Clay)</span>
                </div>
              </div>
            </div>

            {/* Scrollable Matrix */}
            <div className="overflow-x-auto pb-2">
              <div className="min-w-[1000px]">
                {/* Header row with time slots */}
                <div className="grid grid-cols-[80px_repeat(31,minmax(28px,1fr))] gap-1 pb-1 border-b border-border text-[9px] font-mono text-ink-faint text-center select-none">
                  <div className="text-left font-bold text-ink-muted pl-1">Airport</div>
                  {timeSlots.map((ts, idx) => (
                    <div key={ts.minute} className="truncate" title={ts.label}>
                      {idx % 2 === 0 ? ts.label : '·'}
                    </div>
                  ))}
                </div>

                {/* Rows for each airport */}
                <div className="divide-y divide-border/60">
                  {airports.map((airport) => (
                    <div
                      key={airport}
                      className="grid grid-cols-[80px_repeat(31,minmax(28px,1fr))] gap-1 py-1 items-center"
                    >
                      <div className="font-mono font-bold text-xs text-ink pl-1">
                        {airport}
                      </div>

                      {timeSlots.map((ts) => {
                        const cell = cellsMap.get(`${airport}_${ts.minute}`);
                        const val = cell ? cell[selectedMetric] : 0;
                        const bg = getCellColor(val);
                        const text = getCellTextColor(val);

                        return (
                          <div
                            key={ts.minute}
                            onClick={() => cell && handleCellClick(cell)}
                            title={
                              cell
                                ? `${cell.airport} closed ${cell.startFormatted} to ${cell.endFormatted} (${cell.duration}m)\n• Stranded Pax: ${cell.strandedPax}\n• Total Delay: ${cell.totalDelay}m\n• Delayed Flights: ${cell.delayedFlights}\n• Breaches: ${cell.breaches}\n(Click to simulate)`
                                : ''
                            }
                            style={{ backgroundColor: bg, color: text }}
                            className="h-7 rounded flex items-center justify-center font-mono text-[10px] cursor-pointer hover:ring-2 hover:ring-primary transition-all select-none border border-black/5"
                          >
                            {val > 0 ? val : ''}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Top 10 Damaging Closures Table */}
        {sweepResult && sweepResult.mostDamagingClosures && (
          <div className="rounded-card border border-border bg-surface shadow-card overflow-hidden">
            <div className="p-4 border-b border-border bg-surface-alt/40 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Flame className="w-4 h-4 text-closure" />
                <h2 className="font-bold text-xs text-ink uppercase font-mono tracking-wider">
                  Top 10 Most Damaging Disruption Windows (Exhaustively Ranked)
                </h2>
              </div>
              <span className="text-[11px] font-mono text-ink-muted">
                {sweepResult.totalScenariosEvaluated} scenarios evaluated in {sweepResult.elapsedMs}ms
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-surface-alt text-[10px] font-mono uppercase text-ink-muted border-b border-border">
                  <tr>
                    <th className="py-2.5 px-3 font-semibold">Rank</th>
                    <th className="py-2.5 px-3 font-semibold">Airport</th>
                    <th className="py-2.5 px-3 font-semibold">Closure Window</th>
                    <th className="py-2.5 px-3 font-semibold">Duration</th>
                    <th className="py-2.5 px-3 font-semibold">Damage Score</th>
                    <th className="py-2.5 px-3 font-semibold">Stranded Pax</th>
                    <th className="py-2.5 px-3 font-semibold">Total Delay</th>
                    <th className="py-2.5 px-3 font-semibold">Breaches</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border font-sans">
                  {sweepResult.mostDamagingClosures.slice(0, 10).map((rank) => (
                    <tr key={rank.rank} className="hover:bg-surface-alt/70 transition-colors">
                      <td className="py-2.5 px-3 font-mono font-bold text-ink">
                        #{rank.rank}
                      </td>
                      <td className="py-2.5 px-3 font-mono font-bold text-closure">
                        {rank.airport}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-ink">
                        {rank.startFormatted} to {rank.endFormatted}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-ink-muted">
                        {rank.duration}m
                      </td>
                      <td className="py-2.5 px-3 font-mono font-bold text-ink">
                        {Math.round(rank.damageScore)}
                      </td>
                      <td className="py-2.5 px-3 font-mono">
                        <span className="font-bold text-[#8C2F2A] px-1.5 py-0.5 bg-[#FAF0EE] rounded border border-closure/30">
                          {rank.strandedPax} pax
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-ink">
                        {formatDelay(rank.totalDelay)}
                      </td>
                      <td className="py-2.5 px-3 font-mono">
                        {rank.breaches > 0 ? (
                          <span className="font-bold text-[#8C2F2A]">
                            {rank.breaches} breaches
                          </span>
                        ) : (
                          <span className="text-[#3F6B4E]">0</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <button
                          onClick={() => {
                            const p = `${rank.airport}:${rank.startFormatted}-${rank.endFormatted}`;
                            router.push(`/?closures=${encodeURIComponent(p)}`);
                          }}
                          className="px-2.5 py-1 rounded-md text-xs font-mono font-semibold bg-primary text-white hover:bg-primary-hover transition-colors shadow-sm"
                        >
                          Simulate
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
