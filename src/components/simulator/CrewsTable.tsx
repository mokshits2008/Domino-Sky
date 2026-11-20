'use client';

import React, { useState, useMemo } from 'react';
import { useSimulatorStore } from '@/lib/store';
import { formatTime, formatDuration } from '@/lib/formatters';
import { AlertOctagon, ShieldCheck, UserCheck } from 'lucide-react';

export function CrewsTable() {
  const { network, simulationResult, setSelectedFlightId } = useSimulatorStore();
  const [filter, setFilter] = useState<'ALL' | 'BREACH' | 'LEGAL'>('ALL');

  const filteredCrews = useMemo(() => {
    let list = [...simulationResult.crews];
    if (filter === 'BREACH') {
      list = list.filter((c) => c.breach);
    } else if (filter === 'LEGAL') {
      list = list.filter((c) => !c.breach);
    }
    return list;
  }, [simulationResult.crews, filter]);

  return (
    <div className="flex flex-col h-full bg-surface rounded-card border border-border shadow-card overflow-hidden">
      {/* Table Toolbar */}
      <div className="p-3 bg-surface border-b border-border flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <UserCheck className="w-4 h-4 text-ink-faint" />
          <span className="font-semibold text-xs text-ink">Flight Crew Rotations (16 crews)</span>
        </div>

        {/* Filter buttons */}
        <div className="flex items-center space-x-1">
          {(['ALL', 'BREACH', 'LEGAL'] as const).map((mode) => (
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
              <th className="py-2.5 px-3 font-semibold">Crew ID</th>
              <th className="py-2.5 px-3 font-semibold">Tail</th>
              <th className="py-2.5 px-3 font-semibold">Base</th>
              <th className="py-2.5 px-3 font-semibold">Duty Start</th>
              <th className="py-2.5 px-3 font-semibold">Duty End</th>
              <th className="py-2.5 px-3 font-semibold">Total Duty / Max</th>
              <th className="py-2.5 px-3 font-semibold">Slack to Limit</th>
              <th className="py-2.5 px-3 font-semibold">Legal Status</th>
              <th className="py-2.5 px-3 font-semibold">Chain Legs</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border font-sans">
            {filteredCrews.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-8 text-center text-ink-faint text-xs">
                  No crews matching filter.
                </td>
              </tr>
            ) : (
              filteredCrews.map((crew) => {
                const crewMeta = network.crews.find((c) => c.crew_id === crew.crewId);
                const baseCity = crewMeta?.base ?? '—';
                const assignedFlightIds = crewMeta?.flight_ids ?? [];

                return (
                  <tr
                    key={crew.crewId}
                    className={`transition-colors ${
                      crew.breach ? 'bg-[#FAF0EE]/60 hover:bg-[#FAF0EE]' : 'hover:bg-surface-alt/70'
                    }`}
                  >
                    <td className="py-2.5 px-3 font-mono font-bold text-ink">
                      {crew.crewId}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-ink-muted">
                      {crew.tailId}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-ink">
                      {baseCity}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-ink-muted">
                      {formatTime(crew.dutyStart)}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-ink">
                      {crew.dutyEnd !== null ? formatTime(crew.dutyEnd) : '—'}
                    </td>
                    <td className="py-2.5 px-3 font-mono">
                      <span className={crew.breach ? 'text-[#8C2F2A] font-bold' : 'text-ink'}>
                        {formatDuration(crew.dutyMin)} / {formatDuration(crew.maxDutyMin)}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-mono">
                      {crew.breach ? (
                        <span className="font-bold text-[#8C2F2A]">
                          +{crew.excessMin}m EXCEEDED
                        </span>
                      ) : (
                        <span className="text-[#3F6B4E]">
                          {crew.slackToLimitMin}m remaining
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-mono border font-medium ${
                          crew.breach
                            ? 'bg-[#EBA5A0] text-[#8C2F2A] border-[#8C2F2A]/30'
                            : 'bg-[#CFE3D4] text-[#3F6B4E] border-[#3F6B4E]/30'
                        }`}
                      >
                        {crew.breach ? (
                          <>
                            <AlertOctagon className="w-2.5 h-2.5" />
                            <span>BREACH</span>
                          </>
                        ) : (
                          <>
                            <ShieldCheck className="w-2.5 h-2.5" />
                            <span>LEGAL</span>
                          </>
                        )}
                      </span>
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="flex flex-wrap gap-1">
                        {assignedFlightIds.map((fid: string) => (
                          <button
                            key={fid}
                            onClick={() => setSelectedFlightId(fid)}
                            className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-surface-alt hover:bg-primary-tint hover:text-primary transition-colors text-ink-muted"
                          >
                            {fid}
                          </button>
                        ))}
                      </div>
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
