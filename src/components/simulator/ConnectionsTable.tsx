'use client';

import React, { useState, useMemo } from 'react';
import { useSimulatorStore } from '@/lib/store';
import { Users, CheckCircle2, AlertCircle } from 'lucide-react';

export function ConnectionsTable() {
  const { simulationResult, setSelectedFlightId } = useSimulatorStore();
  const [filter, setFilter] = useState<'ALL' | 'CONNECTED' | 'MISSED'>('ALL');

  const filteredConnections = useMemo(() => {
    let list = [...simulationResult.connections];
    if (filter === 'CONNECTED') {
      list = list.filter((c) => c.status === 'CONNECTED');
    } else if (filter === 'MISSED') {
      list = list.filter((c) => c.status === 'MISSED' || c.status === 'TO_CANCELLED');
    }
    return list;
  }, [simulationResult.connections, filter]);

  return (
    <div className="flex flex-col h-full bg-surface rounded-card border border-border shadow-card overflow-hidden">
      {/* Table Toolbar */}
      <div className="p-3 bg-surface border-b border-border flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Users className="w-4 h-4 text-ink-faint" />
          <span className="font-semibold text-xs text-ink">Passenger Connections (21 pairs)</span>
        </div>

        {/* Filter buttons */}
        <div className="flex items-center space-x-1">
          {(['ALL', 'CONNECTED', 'MISSED'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setFilter(mode)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-mono border transition-colors ${
                filter === mode
                  ? 'bg-ink text-surface border-ink font-semibold'
                  : 'bg-surface-alt text-ink-muted border-border hover:text-ink'
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      {/* Table Body */}
      <div className="flex-1 overflow-auto min-h-0">
        <table className="w-full text-left text-xs border-collapse">
          <thead className="sticky top-0 bg-surface-alt border-b border-border text-[11px] font-mono uppercase text-ink-muted select-none z-10">
            <tr>
              <th className="py-2.5 px-3 font-semibold">ID</th>
              <th className="py-2.5 px-3 font-semibold">Hub</th>
              <th className="py-2.5 px-3 font-semibold">Inbound Leg</th>
              <th className="py-2.5 px-3 font-semibold">Outbound Leg</th>
              <th className="py-2.5 px-3 font-semibold">Pax</th>
              <th className="py-2.5 px-3 font-semibold">Actual Gap</th>
              <th className="py-2.5 px-3 font-semibold">Status</th>
              <th className="py-2.5 px-3 font-semibold">Stranded Pax</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border font-sans">
            {filteredConnections.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-8 text-center text-ink-faint text-xs">
                  No connections matching filter.
                </td>
              </tr>
            ) : (
              filteredConnections.map((conn) => {
                const isMissed = conn.status === 'MISSED' || conn.status === 'TO_CANCELLED';
                return (
                  <tr key={conn.connectionId} className="hover:bg-surface-alt/70 transition-colors">
                    <td className="py-2.5 px-3 font-mono font-bold text-ink">
                      {conn.connectionId}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-ink-muted">
                      {conn.airport}
                    </td>
                    <td className="py-2.5 px-3 font-mono">
                      <button
                        onClick={() => setSelectedFlightId(conn.fromFlight)}
                        className="text-primary hover:underline font-semibold"
                      >
                        {conn.fromFlight}
                      </button>
                    </td>
                    <td className="py-2.5 px-3 font-mono">
                      <button
                        onClick={() => setSelectedFlightId(conn.toFlight)}
                        className="text-primary hover:underline font-semibold"
                      >
                        {conn.toFlight}
                      </button>
                    </td>
                    <td className="py-2.5 px-3 font-mono text-ink">
                      {conn.passengers}
                    </td>
                    <td className="py-2.5 px-3 font-mono">
                      {conn.gapMin !== null ? (
                        <span
                          className={
                            conn.gapMin < conn.minConnect
                              ? 'text-[#8C2F2A] font-bold'
                              : 'text-ink'
                          }
                        >
                          {conn.gapMin}m (min {conn.minConnect}m)
                        </span>
                      ) : (
                        <span className="text-ink-faint">—</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-mono border font-medium ${
                          isMissed
                            ? 'bg-[#EBA5A0] text-[#8C2F2A] border-[#8C2F2A]/30'
                            : 'bg-[#CFE3D4] text-[#3F6B4E] border-[#3F6B4E]/30'
                        }`}
                      >
                        {isMissed ? (
                          <>
                            <AlertCircle className="w-2.5 h-2.5" />
                            <span>{conn.status}</span>
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="w-2.5 h-2.5" />
                            <span>CONNECTED</span>
                          </>
                        )}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-mono">
                      {conn.strandedPax > 0 ? (
                        <span className="font-bold text-[#8C2F2A] px-1.5 py-0.5 bg-[#FAF0EE] rounded border border-closure/30">
                          +{conn.strandedPax} pax
                        </span>
                      ) : (
                        <span className="text-[#3F6B4E]">0</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
