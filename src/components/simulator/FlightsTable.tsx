'use client';

import React, { useState, useMemo } from 'react';
import { useSimulatorStore } from '@/lib/store';
import { formatTime, formatDelay, getCauseLabel } from '@/lib/formatters';
import { Search, ArrowUpDown } from 'lucide-react';

export function FlightsTable() {
  const { simulationResult, selectedFlightId, setSelectedFlightId } = useSimulatorStore();

  const [searchTerm, setSearchTerm] = useState('');
  const [severityFilter, setSeverityFilter] = useState<string>('ALL');
  const [sortField, setSortField] = useState<'schedDep' | 'arrDelay' | 'flightId'>('schedDep');
  const [sortAsc, setSortAsc] = useState(true);

  const filteredFlights = useMemo(() => {
    let list = [...simulationResult.flights];

    if (severityFilter !== 'ALL') {
      list = list.filter((f) => f.severity === severityFilter);
    }

    if (searchTerm.trim()) {
      const term = searchTerm.trim().toLowerCase();
      list = list.filter(
        (f) =>
          f.flightId.toLowerCase().includes(term) ||
          f.tailId.toLowerCase().includes(term) ||
          f.crewId.toLowerCase().includes(term) ||
          f.origin.toLowerCase().includes(term) ||
          f.destination.toLowerCase().includes(term)
      );
    }

    list.sort((a, b) => {
      let cmp = 0;
      if (sortField === 'schedDep') cmp = a.schedDep - b.schedDep;
      else if (sortField === 'arrDelay') cmp = a.arrDelay - b.arrDelay;
      else if (sortField === 'flightId') cmp = a.flightId.localeCompare(b.flightId);
      return sortAsc ? cmp : -cmp;
    });

    return list;
  }, [simulationResult.flights, severityFilter, searchTerm, sortField, sortAsc]);

  const toggleSort = (field: 'schedDep' | 'arrDelay' | 'flightId') => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  const getSeverityBadgeClass = (severity: string) => {
    switch (severity) {
      case 'NONE':
        return 'bg-[#CFE3D4] text-[#3F6B4E] border-[#3F6B4E]/30';
      case 'MINOR':
        return 'bg-[#F5E6B3] text-[#7A6420] border-[#7A6420]/30';
      case 'MODERATE':
        return 'bg-[#F6C9A6] text-[#8A4F1F] border-[#8A4F1F]/30';
      case 'SEVERE':
        return 'bg-[#EBA5A0] text-[#8C2F2A] border-[#8C2F2A]/30';
      case 'CANCELLED':
        return 'bg-[#D9D5CE] text-[#5E5A52] border-[#5E5A52]/40 pattern-cancelled-hatch';
      default:
        return 'bg-surface text-ink border-border';
    }
  };

  return (
    <div className="flex flex-col h-full bg-surface rounded-card border border-border shadow-card overflow-hidden">
      {/* Table Toolbar */}
      <div className="p-3 bg-surface border-b border-border flex flex-wrap items-center justify-between gap-3">
        {/* Search */}
        <div className="relative w-64">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-ink-faint" />
          <input
            type="text"
            placeholder="Search flight, tail, airport, crew…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full h-8 pl-8 pr-3 text-xs bg-surface-alt border border-border rounded-input text-ink focus:border-primary outline-none"
          />
        </div>

        {/* Severity filter chips */}
        <div className="flex items-center space-x-1">
          {['ALL', 'NONE', 'MINOR', 'MODERATE', 'SEVERE', 'CANCELLED'].map((sev) => (
            <button
              key={sev}
              onClick={() => setSeverityFilter(sev)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-mono border transition-colors ${
                severityFilter === sev
                  ? 'bg-ink text-surface border-ink font-semibold'
                  : 'bg-surface-alt text-ink-muted border-border hover:text-ink'
              }`}
            >
              {sev === 'ALL' ? 'All (70)' : sev}
            </button>
          ))}
        </div>
      </div>

      {/* Table Body (Scrollable) */}
      <div className="flex-1 overflow-auto min-h-0">
        <table className="w-full text-left text-xs border-collapse">
          <thead className="sticky top-0 bg-surface-alt border-b border-border text-[11px] font-mono uppercase text-ink-muted select-none z-10">
            <tr>
              <th
                onClick={() => toggleSort('flightId')}
                className="py-2.5 px-3 font-semibold cursor-pointer hover:text-ink"
              >
                <div className="flex items-center space-x-1">
                  <span>Flight</span>
                  <ArrowUpDown className="w-3 h-3 text-ink-faint" />
                </div>
              </th>
              <th className="py-2.5 px-3 font-semibold">Tail</th>
              <th className="py-2.5 px-3 font-semibold">Route</th>
              <th
                onClick={() => toggleSort('schedDep')}
                className="py-2.5 px-3 font-semibold cursor-pointer hover:text-ink"
              >
                <div className="flex items-center space-x-1">
                  <span>Sched Dep - Arr</span>
                  <ArrowUpDown className="w-3 h-3 text-ink-faint" />
                </div>
              </th>
              <th className="py-2.5 px-3 font-semibold">Actual Dep - Arr</th>
              <th
                onClick={() => toggleSort('arrDelay')}
                className="py-2.5 px-3 font-semibold cursor-pointer hover:text-ink"
              >
                <div className="flex items-center space-x-1">
                  <span>Arr Delay</span>
                  <ArrowUpDown className="w-3 h-3 text-ink-faint" />
                </div>
              </th>
              <th className="py-2.5 px-3 font-semibold">Status</th>
              <th className="py-2.5 px-3 font-semibold">Primary Cause</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border font-sans">
            {filteredFlights.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-8 text-center text-ink-faint text-xs">
                  No flights matching filter criteria.
                </td>
              </tr>
            ) : (
              filteredFlights.map((flight) => {
                const isSelected = flight.flightId === selectedFlightId;
                return (
                  <tr
                    key={flight.flightId}
                    onClick={() => setSelectedFlightId(flight.flightId)}
                    className={`cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-primary-tint/50 font-medium'
                        : 'hover:bg-surface-alt/70'
                    }`}
                  >
                    <td className="py-2.5 px-3 font-mono font-bold text-ink">
                      {flight.flightId}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-ink-muted">
                      {flight.tailId}
                      {flight.tailId !== flight.originalTailId && (
                        <span className="ml-1 text-[9px] px-1 py-0.2 bg-spare/40 text-primary rounded">
                          SWAP
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-ink">
                      {flight.origin} → {flight.destination}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-ink-muted">
                      {formatTime(flight.schedDep)} - {formatTime(flight.schedArr)}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-ink">
                      {flight.cancelled ? (
                        <span className="text-ink-faint line-through">Cancelled</span>
                      ) : (
                        `${formatTime(flight.actualDep!)} - ${formatTime(flight.actualArr!)}`
                      )}
                    </td>
                    <td className="py-2.5 px-3 font-mono">
                      {flight.cancelled ? (
                        <span className="text-ink-faint">—</span>
                      ) : (
                        <span
                          className={
                            flight.arrDelay > 0
                              ? 'font-bold text-[#8C2F2A]'
                              : 'text-[#3F6B4E]'
                          }
                        >
                          {formatDelay(flight.arrDelay)}
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-mono border font-medium ${getSeverityBadgeClass(
                          flight.severity
                        )}`}
                      >
                        {flight.severity}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-ink-muted text-xs truncate max-w-xs" title={flight.explanation}>
                      {getCauseLabel(flight.primaryCause?.type)}
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
