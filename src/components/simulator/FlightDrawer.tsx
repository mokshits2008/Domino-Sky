'use client';

import React from 'react';
import { useSimulatorStore } from '@/lib/store';
import { formatTime, formatDelay, getCauseLabel, getSeverityLabel } from '@/lib/formatters';
import {
  X,
  Plane,
  Clock,
  GitCommit,
  Quote,
  Users,
  UserCheck,
} from 'lucide-react';

export function FlightDrawer() {
  const {
    drawerOpen,
    setDrawerOpen,
    selectedFlightId,
    setSelectedFlightId,
    simulationResult,
  } = useSimulatorStore();

  const flight = simulationResult.flights.find((f) => f.flightId === selectedFlightId);

  if (!drawerOpen || !flight) {
    return null;
  }

  // Find incoming and outgoing connections for this flight
  const incomingConnections = simulationResult.connections.filter(
    (c) => c.toFlight === flight.flightId
  );
  const outgoingConnections = simulationResult.connections.filter(
    (c) => c.fromFlight === flight.flightId
  );

  // Find assigned crew
  const crew = simulationResult.crews.find((c) => c.crewId === flight.crewId);

  return (
    <>
      {/* Mobile/Tablet Backdrop (below 1280px) */}
      <div
        onClick={() => setDrawerOpen(false)}
        className="xl:hidden fixed inset-0 bg-ink/20 backdrop-blur-[1px] z-drawer"
      />

      {/* Drawer Panel */}
        <aside
          role="region"
          aria-label={`Flight details for ${flight.flightId}`}
          className="fixed xl:static top-0 right-0 bottom-0 w-[380px] min-w-[380px] max-w-[380px] bg-surface border-l border-border h-full flex flex-col justify-between overflow-y-auto z-drawer select-none shadow-card-elevated xl:shadow-none animate-in slide-in-from-right duration-200"
        >
          {/* Drawer Header */}
          <div className="p-4 border-b border-border bg-surface-alt/40 flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <div className="p-2 rounded-lg bg-primary-tint/60 text-primary">
                <Plane className="w-4 h-4" aria-hidden="true" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <span className="font-mono font-bold text-sm text-ink">
                    {flight.flightId}
                  </span>
                  <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-surface border border-border text-ink-muted">
                    {flight.origin} → {flight.destination}
                  </span>
                </div>
                <div className="text-[11px] font-mono text-ink-faint mt-0.5">
                  Tail: {flight.tailId} • Crew: {flight.crewId}
                </div>
              </div>
            </div>

            <button
              onClick={() => setDrawerOpen(false)}
              aria-label="Close flight inspection panel"
              className="p-1.5 rounded-md hover:bg-surface-alt text-ink-muted hover:text-ink transition-colors"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>

          {/* Content Body */}
          <div className="p-4 space-y-5 flex-1 overflow-y-auto">
            {/* Status & Severity Pill */}
            <div className="flex items-center justify-between p-3 rounded-lg bg-surface-alt border border-border">
              <div className="space-y-0.5">
                <span className="text-[10px] font-mono uppercase text-ink-faint">Status</span>
                <div className="font-mono font-bold text-xs text-ink">
                  {flight.status} ({getSeverityLabel(flight.severity)})
                </div>
              </div>
              <div className="text-right space-y-0.5">
                <span className="text-[10px] font-mono uppercase text-ink-faint">Arr Delay</span>
                <div
                  className={`font-mono font-bold text-xs ${flight.arrDelay > 0 ? 'text-[#8C2F2A]' : 'text-[#3F6B4E]'
                    }`}
                >
                  {formatDelay(flight.arrDelay)}
                </div>
              </div>
            </div>

            {/* Sched vs Actual Time Comparison */}
            <div className="space-y-2">
              <div className="flex items-center space-x-1.5 text-xs font-semibold text-ink">
                <Clock className="w-3.5 h-3.5 text-ink-faint" />
                <span>Schedule vs Actual Timings</span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2.5 rounded-lg border border-border bg-surface">
                  <div className="text-[10px] font-mono uppercase text-ink-faint">Departure</div>
                  <div className="font-mono mt-1 text-ink">
                    Sched: <span className="font-semibold">{formatTime(flight.schedDep)}</span>
                  </div>
                  <div className="font-mono text-ink">
                    Actual:{' '}
                    <span
                      className={
                        flight.depDelay > 0 ? 'font-bold text-[#8C2F2A]' : 'font-semibold text-[#3F6B4E]'
                      }
                    >
                      {flight.actualDep !== null ? formatTime(flight.actualDep) : 'Cancelled'}
                    </span>
                  </div>
                  {flight.depDelay > 0 && (
                    <div className="text-[10px] font-mono text-[#8C2F2A] mt-0.5">
                      Delay: {formatDelay(flight.depDelay)}
                    </div>
                  )}
                </div>

                <div className="p-2.5 rounded-lg border border-border bg-surface">
                  <div className="text-[10px] font-mono uppercase text-ink-faint">Arrival</div>
                  <div className="font-mono mt-1 text-ink">
                    Sched: <span className="font-semibold">{formatTime(flight.schedArr)}</span>
                  </div>
                  <div className="font-mono text-ink">
                    Actual:{' '}
                    <span
                      className={
                        flight.arrDelay > 0 ? 'font-bold text-[#8C2F2A]' : 'font-semibold text-[#3F6B4E]'
                      }
                    >
                      {flight.actualArr !== null ? formatTime(flight.actualArr) : 'Cancelled'}
                    </span>
                  </div>
                  {flight.arrDelay > 0 && (
                    <div className="text-[10px] font-mono text-[#8C2F2A] mt-0.5">
                      Delay: {formatDelay(flight.arrDelay)}
                    </div>
                  )}
                  {flight.arrivalHoldMin > 0 && (
                    <div className="text-[10px] font-mono text-amber-700 mt-0.5">
                      Airborne hold: {flight.arrivalHoldMin}m
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Deterministic Explanation */}
            <div className="space-y-1.5">
              <span className="text-xs font-semibold text-ink flex items-center space-x-1.5">
                <Quote className="w-3.5 h-3.5 text-primary" />
                <span>Operational Root Cause</span>
              </span>
              <div className="p-3 bg-surface-alt border-l-2 border-primary rounded-r-lg text-xs text-ink leading-relaxed">
                {flight.explanation}
              </div>
              <div className="text-[10px] font-mono text-ink-muted">
                Primary Cause: <span className="font-bold text-ink">{getCauseLabel(flight.primaryCause?.type)}</span>
              </div>
            </div>

            {/* Cause Chain Stepper */}
            {flight.causeChain && flight.causeChain.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-ink">
                  <span className="flex items-center space-x-1.5">
                    <GitCommit className="w-3.5 h-3.5 text-primary" />
                    <span>Cascade Propagation Chain</span>
                  </span>
                  <span className="text-[10px] font-mono text-ink-faint">
                    {flight.causeChain.length} steps
                  </span>
                </div>

                <div className="space-y-2 border-l-2 border-border ml-3 pl-3">
                  {flight.causeChain.map((chainId, idx) => {
                    const chainFlight = simulationResult.flights.find((f) => f.flightId === chainId);
                    const isCurrent = chainId === flight.flightId;
                    const isRoot = idx === 0;

                    return (
                      <div
                        key={chainId}
                        onClick={() => setSelectedFlightId(chainId)}
                        className={`p-2 rounded-lg border text-xs cursor-pointer transition-colors ${isCurrent
                            ? 'border-primary bg-primary-tint/30 font-semibold'
                            : 'border-border bg-surface hover:bg-surface-alt'
                          }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono font-bold text-ink">{chainId}</span>
                          {isRoot && (
                            <span className="text-[9px] font-mono uppercase px-1.5 py-0.2 bg-closure text-white rounded">
                              Root Disruption
                            </span>
                          )}
                          {isCurrent && !isRoot && (
                            <span className="text-[9px] font-mono uppercase px-1.5 py-0.2 bg-primary text-white rounded">
                              Current
                            </span>
                          )}
                        </div>
                        {chainFlight && (
                          <div className="text-[11px] text-ink-muted mt-0.5 font-mono flex items-center space-x-1">
                            <span>
                              {chainFlight.origin} → {chainFlight.destination}
                            </span>
                            <span>•</span>
                            <span>{formatDelay(chainFlight.arrDelay)}</span>
                            {chainFlight.slackAbsorbedMin > 0 && (
                              <span className="text-[#3F6B4E]">
                                (absorbed {chainFlight.slackAbsorbedMin}m)
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Passenger Connections */}
            {(incomingConnections.length > 0 || outgoingConnections.length > 0) && (
              <div className="space-y-2">
                <span className="text-xs font-semibold text-ink flex items-center space-x-1.5">
                  <Users className="w-3.5 h-3.5 text-ink-faint" />
                  <span>Passenger Connections ({incomingConnections.length + outgoingConnections.length})</span>
                </span>

                <div className="space-y-1.5 text-xs">
                  {outgoingConnections.map((conn) => (
                    <div
                      key={conn.connectionId}
                      className="p-2 rounded-lg bg-surface border border-border flex items-center justify-between"
                    >
                      <div>
                        <div className="font-mono text-[11px] text-ink">
                          Transfers to: <span className="font-bold">{conn.toFlight}</span> ({conn.passengers} pax)
                        </div>
                        <div className="text-[10px] font-mono text-ink-muted">
                          Gap: {conn.gapMin !== null ? `${conn.gapMin}m` : '—'} (min {conn.minConnect}m)
                        </div>
                      </div>
                      <span
                        className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-medium ${conn.status === 'CONNECTED'
                            ? 'bg-[#CFE3D4] text-[#3F6B4E]'
                            : 'bg-[#EBA5A0] text-[#8C2F2A]'
                          }`}
                      >
                        {conn.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Crew Status */}
            {crew && (
              <div className="space-y-2">
                <span className="text-xs font-semibold text-ink flex items-center space-x-1.5">
                  <UserCheck className="w-3.5 h-3.5 text-ink-faint" />
                  <span>Assigned Crew ({crew.crewId})</span>
                </span>

                <div
                  className={`p-2.5 rounded-lg border text-xs space-y-1 ${crew.breach ? 'bg-[#FAF0EE] border-closure/40' : 'bg-surface border-border'
                    }`}
                >
                  <div className="flex items-center justify-between font-mono">
                    <span className="text-ink">Duty: {formatTime(crew.dutyStart)} → {formatTime(crew.dutyEnd ?? 0)}</span>
                    <span
                      className={`font-bold ${crew.breach ? 'text-[#8C2F2A]' : 'text-[#3F6B4E]'
                        }`}
                    >
                      {crew.breach ? 'DUTY BREACH' : 'LEGAL'}
                    </span>
                  </div>
                  <div className="text-[11px] font-mono text-ink-muted">
                    Total: {crew.dutyMin}m / Max {crew.maxDutyMin}m
                    {crew.breach ? ` (+${crew.excessMin}m exceeded)` : ` (${crew.slackToLimitMin}m slack)`}
                  </div>
                </div>
              </div>
            )}
          </div>
        </aside>
      </>
      );
}
