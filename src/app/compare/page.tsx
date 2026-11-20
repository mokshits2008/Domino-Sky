'use client';

import React, { useState, useMemo } from 'react';
import { TopBar } from '@/components/layout/TopBar';
import { loadFlightNetwork } from '@/engine/load';
import { simulate } from '@/engine/simulate';
import { diffResults } from '@/engine/analytics';
import { formatTime, formatDelay } from '@/lib/formatters';
import { ArrivalPolicy, Closure } from '@/engine/types';
import { GitCompare } from 'lucide-react';

const networkData = loadFlightNetwork();

export default function ComparePage() {
  // Scenario A State (default: BLR 06:00 to 08:30)
  const [airportA, setAirportA] = useState('BLR');
  const [startA, setStartA] = useState(360);
  const [endA, setEndA] = useState(510);
  const [policyA, setPolicyA] = useState<ArrivalPolicy>('AIRBORNE_HOLD');

  // Scenario B State (default: BOM 09:00 to 10:30)
  const [airportB, setAirportB] = useState('BOM');
  const [startB, setStartB] = useState(540);
  const [endB, setEndB] = useState(630);
  const [policyB, setPolicyB] = useState<ArrivalPolicy>('AIRBORNE_HOLD');

  // Compute Simulation Results
  const resA = useMemo(() => {
    const closuresA: Closure[] = [{ id: 'cA', airport: airportA, start: startA, end: endA }];
    return simulate(networkData, {
      closures: closuresA,
      config: { arrivalPolicy: policyA },
    });
  }, [airportA, startA, endA, policyA]);

  const resB = useMemo(() => {
    const closuresB: Closure[] = [{ id: 'cB', airport: airportB, start: startB, end: endB }];
    return simulate(networkData, {
      closures: closuresB,
      config: { arrivalPolicy: policyB },
    });
  }, [airportB, startB, endB, policyB]);

  // Compute Diff
  const diff = useMemo(() => {
    return diffResults(resA, resB);
  }, [resA, resB]);

  const tier1Airports = networkData.airports.map((a) => a.id);

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-canvas">
      <TopBar />

      <main className="flex-1 min-h-0 overflow-y-auto p-6 space-y-6">
        {/* Header */}
        <div className="pb-4 border-b border-border space-y-1">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-lg bg-surface border border-border">
              <GitCompare className="w-5 h-5 text-primary" />
            </div>
            <h1 className="text-lg font-bold text-ink font-sans tracking-tight">
              Compare Disruption Scenarios (A vs B)
            </h1>
          </div>
          <p className="text-xs text-ink-muted">
            Side-by-side comparative cascade analysis and flight-by-flight differential evaluation
          </p>
        </div>

        {/* Dual Scenario Configurator Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 select-none">
          {/* Scenario A Card */}
          <div className="p-4 rounded-card border border-border bg-surface shadow-card space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-border">
              <span className="font-mono font-bold text-xs uppercase px-2 py-0.5 rounded bg-primary text-white">
                Scenario A
              </span>
              <span className="text-[11px] font-mono text-ink-faint">
                Hash: {resA.scenarioFingerprint.slice(0, 8)}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <label className="text-[10px] font-mono uppercase text-ink-muted">Airport</label>
                <select
                  value={airportA}
                  onChange={(e) => setAirportA(e.target.value)}
                  className="w-full h-8 px-2 bg-surface-alt border border-border rounded-input text-xs font-mono text-ink outline-none"
                >
                  {tier1Airports.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-mono uppercase text-ink-muted">Window</label>
                <div className="flex items-center space-x-1">
                  <select
                    value={`${startA}-${endA}`}
                    onChange={(e) => {
                      const [s, end] = e.target.value.split('-').map(Number);
                      setStartA(s);
                      setEndA(end);
                    }}
                    className="w-full h-8 px-2 bg-surface-alt border border-border rounded-input text-xs font-mono text-ink outline-none"
                  >
                    <option value="360-510">06:00 to 08:30 (150m)</option>
                    <option value="540-630">09:00 to 10:30 (90m)</option>
                    <option value="720-840">12:00 to 14:00 (120m)</option>
                    <option value="960-1080">16:00 to 18:00 (120m)</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-mono uppercase text-ink-muted">Policy</label>
                <select
                  value={policyA}
                  onChange={(e) => setPolicyA(e.target.value as ArrivalPolicy)}
                  className="w-full h-8 px-2 bg-surface-alt border border-border rounded-input text-xs text-ink outline-none"
                >
                  <option value="AIRBORNE_HOLD">Airborne Hold</option>
                  <option value="GROUND_HOLD">Ground Hold</option>
                </select>
              </div>
            </div>

            {/* Quick summary numbers */}
            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border text-[11px] font-mono">
              <div>
                <span className="text-ink-faint">Delayed: </span>
                <span className="font-bold text-ink">{resA.metrics.delayedFlights}</span>
              </div>
              <div>
                <span className="text-ink-faint">Arr Delay: </span>
                <span className="font-bold text-ink">{resA.metrics.totalArrDelayMin}m</span>
              </div>
              <div>
                <span className="text-ink-faint">Stranded: </span>
                <span className="font-bold text-closure">{resA.metrics.strandedPaxTotal}</span>
              </div>
            </div>
          </div>

          {/* Scenario B Card */}
          <div className="p-4 rounded-card border border-border bg-surface shadow-card space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-border">
              <span className="font-mono font-bold text-xs uppercase px-2 py-0.5 rounded bg-closure text-white">
                Scenario B
              </span>
              <span className="text-[11px] font-mono text-ink-faint">
                Hash: {resB.scenarioFingerprint.slice(0, 8)}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <label className="text-[10px] font-mono uppercase text-ink-muted">Airport</label>
                <select
                  value={airportB}
                  onChange={(e) => setAirportB(e.target.value)}
                  className="w-full h-8 px-2 bg-surface-alt border border-border rounded-input text-xs font-mono text-ink outline-none"
                >
                  {tier1Airports.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-mono uppercase text-ink-muted">Window</label>
                <div className="flex items-center space-x-1">
                  <select
                    value={`${startB}-${endB}`}
                    onChange={(e) => {
                      const [s, end] = e.target.value.split('-').map(Number);
                      setStartB(s);
                      setEndB(end);
                    }}
                    className="w-full h-8 px-2 bg-surface-alt border border-border rounded-input text-xs font-mono text-ink outline-none"
                  >
                    <option value="540-630">09:00 to 10:30 (90m)</option>
                    <option value="360-510">06:00 to 08:30 (150m)</option>
                    <option value="720-840">12:00 to 14:00 (120m)</option>
                    <option value="960-1080">16:00 to 18:00 (120m)</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-mono uppercase text-ink-muted">Policy</label>
                <select
                  value={policyB}
                  onChange={(e) => setPolicyB(e.target.value as ArrivalPolicy)}
                  className="w-full h-8 px-2 bg-surface-alt border border-border rounded-input text-xs text-ink outline-none"
                >
                  <option value="AIRBORNE_HOLD">Airborne Hold</option>
                  <option value="GROUND_HOLD">Ground Hold</option>
                </select>
              </div>
            </div>

            {/* Quick summary numbers */}
            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border text-[11px] font-mono">
              <div>
                <span className="text-ink-faint">Delayed: </span>
                <span className="font-bold text-ink">{resB.metrics.delayedFlights}</span>
              </div>
              <div>
                <span className="text-ink-faint">Arr Delay: </span>
                <span className="font-bold text-ink">{resB.metrics.totalArrDelayMin}m</span>
              </div>
              <div>
                <span className="text-ink-faint">Stranded: </span>
                <span className="font-bold text-closure">{resB.metrics.strandedPaxTotal}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Comparative Deltas Strip (B vs A) */}
        <div className="rounded-card border border-border bg-surface shadow-card p-4 space-y-3">
          <div className="flex items-center justify-between text-xs font-semibold text-ink">
            <span>Differential Cascade Impact (Scenario B vs Scenario A)</span>
            <span className="text-[10px] font-mono text-ink-faint">
              Delta = (Scenario B) - (Scenario A)
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 text-xs select-none">
            <div className="p-3 rounded-lg border border-border bg-surface-alt">
              <span className="text-[10px] font-mono uppercase text-ink-faint">Delayed Flights</span>
              <div className="font-mono text-xl font-bold mt-1 text-ink">
                {diff.metricsDiff.delayedFlightsDelta >= 0 ? '+' : ''}
                {diff.metricsDiff.delayedFlightsDelta}
              </div>
            </div>

            <div className="p-3 rounded-lg border border-border bg-surface-alt">
              <span className="text-[10px] font-mono uppercase text-ink-faint">Total Arr Delay</span>
              <div className="font-mono text-xl font-bold mt-1 text-ink">
                {formatDelay(diff.metricsDiff.totalArrDelayMinDelta)}
              </div>
            </div>

            <div className="p-3 rounded-lg border border-border bg-surface-alt">
              <span className="text-[10px] font-mono uppercase text-ink-faint">Stranded Pax</span>
              <div
                className={`font-mono text-xl font-bold mt-1 ${
                  diff.metricsDiff.strandedPaxTotalDelta > 0 ? 'text-[#8C2F2A]' : 'text-ink'
                }`}
              >
                {diff.metricsDiff.strandedPaxTotalDelta >= 0 ? '+' : ''}
                {diff.metricsDiff.strandedPaxTotalDelta}
              </div>
            </div>

            <div className="p-3 rounded-lg border border-border bg-surface-alt">
              <span className="text-[10px] font-mono uppercase text-ink-faint">Crew Breaches</span>
              <div className="font-mono text-xl font-bold mt-1 text-ink">
                {diff.metricsDiff.crewBreachesDelta >= 0 ? '+' : ''}
                {diff.metricsDiff.crewBreachesDelta}
              </div>
            </div>

            <div className="p-3 rounded-lg border border-border bg-surface-alt">
              <span className="text-[10px] font-mono uppercase text-ink-faint">Cancelled Flights</span>
              <div className="font-mono text-xl font-bold mt-1 text-ink">
                {diff.metricsDiff.cancelledFlightsDelta >= 0 ? '+' : ''}
                {diff.metricsDiff.cancelledFlightsDelta}
              </div>
            </div>
          </div>
        </div>

        {/* Flight Diff Table */}
        <div className="rounded-card border border-border bg-surface shadow-card overflow-hidden">
          <div className="p-4 border-b border-border bg-surface-alt/40 flex items-center justify-between">
            <span className="font-bold text-xs text-ink uppercase font-mono tracking-wider">
              Diverging Flight Legs ({diff.flightDiffs.length} differences)
            </span>
            <span className="text-[11px] font-mono text-ink-muted">
              Flights with different arrival timings between Scenario A and B
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-surface-alt text-[10px] font-mono uppercase text-ink-muted border-b border-border">
                <tr>
                  <th className="py-2.5 px-3 font-semibold">Flight ID</th>
                  <th className="py-2.5 px-3 font-semibold">Scenario A Actual Arr</th>
                  <th className="py-2.5 px-3 font-semibold">Scenario B Actual Arr</th>
                  <th className="py-2.5 px-3 font-semibold">Delay Delta (B - A)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border font-sans">
                {diff.flightDiffs.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-ink-faint text-xs">
                      No flight-level timing differences between Scenario A and Scenario B.
                    </td>
                  </tr>
                ) : (
                  diff.flightDiffs.map((fd) => (
                    <tr key={fd.flightId} className="hover:bg-surface-alt/70 transition-colors">
                      <td className="py-2.5 px-3 font-mono font-bold text-ink">
                        {fd.flightId}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-ink">
                        {fd.actualArrA !== null ? formatTime(fd.actualArrA) : 'Cancelled'}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-ink">
                        {fd.actualArrB !== null ? formatTime(fd.actualArrB) : 'Cancelled'}
                      </td>
                      <td className="py-2.5 px-3 font-mono">
                        <span
                          className={
                            fd.arrDelayDiff > 0
                              ? 'text-[#8C2F2A] font-bold'
                              : fd.arrDelayDiff < 0
                              ? 'text-[#3F6B4E] font-bold'
                              : 'text-ink'
                          }
                        >
                          {formatDelay(fd.arrDelayDiff)}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
