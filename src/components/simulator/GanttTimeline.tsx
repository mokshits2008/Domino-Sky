'use client';

import React, { useRef, useMemo } from 'react';
import { useSimulatorStore } from '@/lib/store';
import {
  DEFAULT_GANTT_DIMENSIONS,
  generateHourlyGrid,
  computeFlightBarGeometry,
  computeClosureBandGeometry,
  FlightBarGeometry,
} from '@/lib/ganttGeometry';
import { getSeveritySvgFill, getSeverityTextColor } from '@/components/common/Patterns';
import { formatDelay } from '@/lib/formatters';
import { FlightResult } from '@/engine/types';

export function GanttTimeline() {
  const {
    network,
    simulationResult,
    closures,
    selectedFlightId,
    setSelectedFlightId,
  } = useSimulatorStore();

  const containerRef = useRef<HTMLDivElement>(null);
  const dim = DEFAULT_GANTT_DIMENSIONS;

  // Tail list: 16 active tails + 2 spare tails
  const tails = useMemo(() => {
    const list = Array.from(new Set(network.flights.map((f) => f.tail_id))).sort();
    network.spare_aircraft.forEach((sp) => {
      if (!list.includes(sp.tail_id)) {
        list.push(sp.tail_id);
      }
    });
    return list;
  }, [network]);

  const gridLines = useMemo(() => generateHourlyGrid(dim), [dim]);

  // Map flights by tail
  const flightsByTail = useMemo(() => {
    const map = new Map<string, FlightResult[]>();
    tails.forEach((t) => map.set(t, []));
    simulationResult.flights.forEach((f) => {
      const arr = map.get(f.tailId);
      if (arr) {
        arr.push(f);
      } else {
        map.set(f.tailId, [f]);
      }
    });
    return map;
  }, [tails, simulationResult.flights]);

  // Selected flight and cause chain set
  const selectedFlight = useMemo(() => {
    if (!selectedFlightId) return null;
    return simulationResult.flights.find((f) => f.flightId === selectedFlightId) ?? null;
  }, [selectedFlightId, simulationResult.flights]);

  const causeChainSet = useMemo(() => {
    if (!selectedFlight || !selectedFlight.causeChain) return new Set<string>();
    return new Set<string>(selectedFlight.causeChain);
  }, [selectedFlight]);

  // Pre-calculate bar geometries
  const allBarGeometries = useMemo(() => {
    const result: Array<{ geom: FlightBarGeometry; flight: FlightResult; rowIndex: number }> = [];
    tails.forEach((tailId, rowIndex) => {
      const flights = flightsByTail.get(tailId) ?? [];
      flights.forEach((f) => {
        const geom = computeFlightBarGeometry(f, rowIndex, dim);
        result.push({ geom, flight: f, rowIndex });
      });
    });
    return result;
  }, [tails, flightsByTail, dim]);

  // Compute SVG connectors for cause chain
  const causeChainArrows = useMemo(() => {
    if (!selectedFlight || !selectedFlight.causeChain || selectedFlight.causeChain.length <= 1) {
      return [];
    }

    const chain = selectedFlight.causeChain;
    const arrows: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];

    for (let i = 0; i < chain.length - 1; i++) {
      const fromId = chain[i];
      const toId = chain[i + 1];

      const fromItem = allBarGeometries.find((b) => b.flight.flightId === fromId);
      const toItem = allBarGeometries.find((b) => b.flight.flightId === toId);

      if (fromItem && toItem) {
        const x1 = fromItem.geom.actualX + fromItem.geom.actualWidth;
        const y1 = fromItem.geom.y + fromItem.geom.height / 2;
        const x2 = toItem.geom.actualX;
        const y2 = toItem.geom.y + toItem.geom.height / 2;
        arrows.push({ x1, y1, x2, y2 });
      }
    }
    return arrows;
  }, [selectedFlight, allBarGeometries]);

  const totalHeight = tails.length * dim.rowHeightPx;

  return (
    <div className="flex flex-col h-full bg-surface rounded-card border border-border shadow-card overflow-hidden">
      {/* Timeline Controls / Legend Bar */}
      <div className="h-10 px-4 bg-surface-alt/70 border-b border-border flex items-center justify-between text-xs text-ink-muted">
        <div className="flex items-center space-x-4">
          <span className="font-semibold text-ink text-xs">Aircraft Rotation Timeline</span>
          <span className="text-[11px] font-mono text-ink-faint">
            18 Tails (16 active + 2 spares) • 05:00 - 02:00+1d IST
          </span>
        </div>

        {/* Legend */}
        <div className="flex items-center space-x-3 text-[11px]">
          <div className="flex items-center space-x-1.5">
            <span className="w-3 h-2.5 rounded-sm bg-[#CFE3D4] border border-[#3F6B4E]/30"></span>
            <span>On time</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="w-3 h-2.5 rounded-sm bg-[#F5E6B3] border border-[#7A6420]/30"></span>
            <span>Minor (+1-14m)</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="w-3 h-2.5 rounded-sm bg-[#F6C9A6] border border-[#8A4F1F]/30"></span>
            <span>Mod (+15-59m)</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="w-3 h-2.5 rounded-sm bg-[#EBA5A0] border border-[#8C2F2A]/30"></span>
            <span>Severe (+60m+)</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="w-3 h-2.5 rounded-sm pattern-cancelled-hatch border border-[#5E5A52]/40"></span>
            <span>Cancelled</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="w-3 h-2.5 rounded-sm bg-closure-tint border border-closure"></span>
            <span>Closure</span>
          </div>
        </div>
      </div>

      {/* Main Gantt Body: Sticky Left Labels + Horizontal Scroll Canvas */}
      <div className="flex-1 flex min-h-0 overflow-hidden relative" ref={containerRef}>
        {/* Sticky Tail Labels Column */}
        <div className="w-28 min-w-28 max-w-28 bg-surface border-r border-border flex flex-col z-sticky shadow-[2px_0_5px_rgba(0,0,0,0.02)] select-none">
          {/* Header spacer */}
          <div className="h-8 border-b border-border bg-surface-alt flex items-center px-2 text-[10px] uppercase font-mono font-bold text-ink-muted">
            Tail ID
          </div>

          {/* Tail Rows */}
          <div className="flex-1 overflow-hidden">
            {tails.map((tailId) => {
              const isSpare = tailId === 'VT-DS17' || tailId === 'VT-DS18';
              return (
                <div
                  key={tailId}
                  style={{ height: `${dim.rowHeightPx}px` }}
                  className={`flex items-center justify-between px-2 border-b border-border text-xs font-mono ${
                    isSpare ? 'bg-spare/20 text-primary font-bold' : 'text-ink'
                  }`}
                >
                  <span className="truncate">{tailId}</span>
                  {isSpare && (
                    <span className="text-[9px] px-1 py-0.2 bg-primary/10 text-primary rounded font-sans">
                      SPARE
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Scrollable SVG Timeline Area */}
        <div className="flex-1 overflow-auto bg-canvas relative">
          <div style={{ width: `${dim.widthPx}px`, minWidth: `${dim.widthPx}px` }}>
            {/* Time Axis Header */}
            <div className="h-8 sticky top-0 bg-surface-alt border-b border-border flex items-center z-10 select-none">
              <svg width={dim.widthPx} height="32" className="overflow-visible">
                {gridLines.map((line) => (
                  <g key={`header-${line.minute}`}>
                    <line
                      x1={line.x}
                      y1="0"
                      x2={line.x}
                      y2="32"
                      stroke="#E6E0D6"
                      strokeWidth={line.isMajor ? 1.5 : 0.75}
                    />
                    <text
                      x={line.x + 4}
                      y="20"
                      fontSize="10"
                      fontFamily="var(--font-plex-mono)"
                      fill="#6B7280"
                      fontWeight={line.isMajor ? '600' : '400'}
                    >
                      {line.label}
                    </text>
                  </g>
                ))}
              </svg>
            </div>

            {/* SVG Flight Bars & Grid */}
            <div className="relative" style={{ height: `${totalHeight}px` }}>
              <svg
                width={dim.widthPx}
                height={totalHeight}
                className="absolute inset-0 overflow-visible"
              >
                {/* Background Grid Lines */}
                {gridLines.map((line) => (
                  <line
                    key={`grid-${line.minute}`}
                    x1={line.x}
                    y1="0"
                    x2={line.x}
                    y2={totalHeight}
                    stroke="#E6E0D6"
                    strokeWidth={line.isMajor ? 1 : 0.5}
                    strokeDasharray={line.isMajor ? undefined : '2 3'}
                    opacity={0.7}
                  />
                ))}

                {/* Horizontal row dividers */}
                {tails.map((_, i) => (
                  <line
                    key={`row-div-${i}`}
                    x1="0"
                    y1={(i + 1) * dim.rowHeightPx}
                    x2={dim.widthPx}
                    y2={(i + 1) * dim.rowHeightPx}
                    stroke="#E6E0D6"
                    strokeWidth="1"
                  />
                ))}

                {/* Vertical Closure Bands */}
                {closures.map((closure) => {
                  const band = computeClosureBandGeometry(closure, dim);
                  return (
                    <g key={`closure-${band.id}`}>
                      <rect
                        x={band.x}
                        y="0"
                        width={band.width}
                        height={totalHeight}
                        fill="#C9776B"
                        fillOpacity="0.12"
                      />
                      <line
                        x1={band.x}
                        y1="0"
                        x2={band.x}
                        y2={totalHeight}
                        stroke="#C9776B"
                        strokeWidth="1.5"
                        strokeDasharray="4 2"
                      />
                      <line
                        x1={band.x + band.width}
                        y1="0"
                        x2={band.x + band.width}
                        y2={totalHeight}
                        stroke="#C9776B"
                        strokeWidth="1.5"
                        strokeDasharray="4 2"
                      />
                    </g>
                  );
                })}

                {/* Flight Bars */}
                {allBarGeometries.map(({ geom, flight }) => {
                  const isSelected = flight.flightId === selectedFlightId;
                  const inCauseChain = causeChainSet.has(flight.flightId);
                  const isDimmed = selectedFlightId !== null && !isSelected && !inCauseChain;

                  const schedFill = '#E6E0D6';
                  const actualFill = getSeveritySvgFill(flight.severity);
                  const delayFill = getSeveritySvgFill(flight.severity, true);
                  const textColor = getSeverityTextColor(flight.severity);

                  return (
                    <g
                      key={`flight-g-${flight.flightId}`}
                      data-flight-id={flight.flightId}
                      onClick={() => setSelectedFlightId(flight.flightId)}
                      className="cursor-pointer transition-opacity duration-150"
                      opacity={isDimmed ? 0.28 : 1}
                    >
                      {/* Scheduled Ghost Outline (if delayed) */}
                      {geom.isDelayed && !flight.cancelled && (
                        <rect
                          x={geom.schedX}
                          y={geom.y}
                          width={geom.schedWidth}
                          height={geom.height}
                          rx="4"
                          fill="none"
                          pointerEvents="none"
                          stroke={schedFill}
                          strokeWidth="1.5"
                          strokeDasharray="3 2"
                        />
                      )}

                      {/* Actual Flight Main Bar */}
                      <rect
                        data-flight-bar={flight.flightId}
                        x={geom.actualX}
                        y={geom.y}
                        width={geom.actualWidth}
                        height={geom.height}
                        rx="4"
                        fill={actualFill}
                        stroke={
                          isSelected
                            ? '#2B2F3A'
                            : inCauseChain
                            ? '#4F7494'
                            : '#D5CEBF'
                        }
                        strokeWidth={isSelected ? 2.5 : inCauseChain ? 2 : 1}
                      />

                      {/* Delay Extension Striped Overlay */}
                      {geom.delayWidth > 0 && !flight.cancelled && (
                        <rect
                          x={geom.delayX}
                          y={geom.y}
                          width={geom.delayWidth}
                          height={geom.height}
                          rx="4"
                          fill={delayFill}
                          pointerEvents="none"
                          stroke="none"
                        />
                      )}

                      {/* Airborne Hold Wave Indicator */}
                      {geom.holdWidth > 0 && !flight.cancelled && (
                        <rect
                          x={geom.holdX}
                          y={geom.y}
                          width={geom.holdWidth}
                          height={geom.height}
                          rx="4"
                          fill="url(#svg-pattern-hold)"
                          pointerEvents="none"
                          stroke="none"
                        />
                      )}

                      {/* Flight Bar Label */}
                      {geom.actualWidth > 32 && (
                        <text
                          x={geom.actualX + 6}
                          y={geom.y + geom.height / 2 + 3.5}
                          fontSize="10"
                          fontFamily="var(--font-plex-mono)"
                          fontWeight="600"
                          fill={textColor}
                          pointerEvents="none"
                        >
                          {flight.flightId}
                          {geom.actualWidth > 64 && ` ${flight.origin}→${flight.destination}`}
                          {flight.arrDelay > 0 && geom.actualWidth > 110 && ` (${formatDelay(flight.arrDelay)})`}
                        </text>
                      )}
                    </g>
                  );
                })}

                {/* Cause Chain Connector Arrows */}
                {causeChainArrows.map((arrow, idx) => {
                  const midX = (arrow.x1 + arrow.x2) / 2;
                  return (
                    <g key={`arrow-${idx}`}>
                      <path
                        d={`M ${arrow.x1} ${arrow.y1} C ${midX} ${arrow.y1}, ${midX} ${arrow.y2}, ${arrow.x2} ${arrow.y2}`}
                        fill="none"
                        stroke="#4F7494"
                        strokeWidth="2.5"
                        strokeDasharray="4 2"
                        markerEnd="url(#arrowhead)"
                      />
                      <circle cx={arrow.x1} cy={arrow.y1} r="3" fill="#4F7494" />
                      <circle cx={arrow.x2} cy={arrow.y2} r="3" fill="#4F7494" />
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
