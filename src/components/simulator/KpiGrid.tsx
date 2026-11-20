'use client';

import React from 'react';
import { useSimulatorStore } from '@/lib/store';
import { formatDelay } from '@/lib/formatters';
import { calculateScore } from '@/engine/score';
import {
  Clock,
  Plane,
  Users,
  AlertOctagon,
  XCircle,
  TrendingUp,
  TrendingDown,
  Gauge,
} from 'lucide-react';

export function KpiGrid() {
  const { simulationResult, baselineResult } = useSimulatorStore();

  const cur = simulationResult.metrics;
  const base = baselineResult.metrics;

  const delayedDelta = cur.delayedFlights - base.delayedFlights;
  const delayMinDelta = cur.totalArrDelayMin - base.totalArrDelayMin;
  const strandedDelta = cur.strandedPaxVsBaseline ?? (cur.strandedPaxTotal - base.strandedPaxTotal);
  const breachDelta = cur.crewBreaches - base.crewBreaches;
  const cancelledDelta = cur.cancelledFlights - base.cancelledFlights;
  const curScore = calculateScore(cur).score;
  const baseScore = calculateScore(base).score;
  const scoreDelta = curScore - baseScore;

  const kpis = [
    {
      id: 'delayed-flights',
      title: 'Delayed Flights',
      value: `${cur.delayedFlights}`,
      subvalue: `/ ${simulationResult.flights.length}`,
      delta: delayedDelta,
      deltaLabel: `${delayedDelta >= 0 ? '+' : ''}${delayedDelta} vs baseline`,
      isBadTrend: delayedDelta > 0,
      icon: Plane,
      accent: 'border-border',
      bg: 'bg-surface',
    },
    {
      id: 'arr-delay',
      title: 'Total Arrival Delay',
      value: `${cur.totalArrDelayMin}`,
      subvalue: 'min',
      delta: delayMinDelta,
      deltaLabel: `${formatDelay(delayMinDelta)} vs baseline`,
      isBadTrend: delayMinDelta > 0,
      icon: Clock,
      accent: 'border-border',
      bg: 'bg-surface',
    },
    {
      id: 'stranded-pax',
      title: 'Stranded Passengers',
      value: `${cur.strandedPaxTotal}`,
      subvalue: 'pax',
      delta: strandedDelta,
      deltaLabel: `${strandedDelta >= 0 ? '+' : ''}${strandedDelta} vs baseline`,
      isBadTrend: strandedDelta > 0,
      icon: Users,
      accent: 'border-closure/40',
      bg: cur.strandedPaxTotal > 0 ? 'bg-[#FAF0EE]' : 'bg-surface', // subtle rose tint
      textColor: cur.strandedPaxTotal > 0 ? 'text-[#8C2F2A]' : 'text-ink',
    },
    {
      id: 'crew-breaches',
      title: 'Crew Duty Breaches',
      value: `${cur.crewBreaches}`,
      subvalue: 'crews',
      delta: breachDelta,
      deltaLabel: `${breachDelta >= 0 ? '+' : ''}${breachDelta} vs baseline`,
      isBadTrend: breachDelta > 0,
      icon: AlertOctagon,
      accent: 'border-border',
      bg: 'bg-surface',
    },
    {
      id: 'cancelled-flights',
      title: 'Cancelled Flights',
      value: `${cur.cancelledFlights}`,
      subvalue: 'legs',
      delta: cancelledDelta,
      deltaLabel: `${cancelledDelta >= 0 ? '+' : ''}${cancelledDelta} vs baseline`,
      isBadTrend: cancelledDelta > 0,
      icon: XCircle,
      accent: 'border-border',
      bg: 'bg-surface',
    },
    {
      id: 'penalty-score',
      title: 'Penalty Score',
      value: `${Math.round(curScore)}`,
      subvalue: 'pts',
      delta: scoreDelta,
      deltaLabel: `${scoreDelta >= 0 ? '+' : ''}${Math.round(scoreDelta)} vs baseline`,
      isBadTrend: scoreDelta > 0,
      icon: Gauge,
      accent: 'border-border',
      bg: 'bg-surface',
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3 select-none min-w-0">
      {kpis.map((kpi) => {
        const Icon = kpi.icon;
        return (
          <div
            key={kpi.id}
            className={`p-3.5 rounded-card border ${kpi.accent} ${kpi.bg} shadow-card flex flex-col justify-between transition-all`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-ink-muted tracking-tight truncate">
                {kpi.title}
              </span>
              <Icon className="w-3.5 h-3.5 text-ink-faint flex-shrink-0" />
            </div>

            <div className="my-1.5 flex items-baseline space-x-1.5">
              <span
                className={`font-mono text-2xl font-bold tracking-tight ${
                  kpi.textColor ?? 'text-ink'
                }`}
              >
                {kpi.value}
              </span>
              <span className="font-mono text-xs text-ink-muted">
                {kpi.subvalue}
              </span>
            </div>

            <div className="flex items-center space-x-1 text-[10px] font-mono">
              {kpi.isBadTrend ? (
                <TrendingUp className="w-3 h-3 text-[#8C2F2A]" />
              ) : (
                <TrendingDown className="w-3 h-3 text-[#3F6B4E]" />
              )}
              <span
                className={
                  kpi.isBadTrend ? 'text-[#8C2F2A]' : 'text-[#3F6B4E]'
                }
              >
                {kpi.deltaLabel}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
