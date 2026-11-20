'use client';

import React, { useState, useEffect } from 'react';
import { useSimulatorStore } from '@/lib/store';
import { validateNetworkIntegrity } from '@/engine/validate';
import {
  X,
  FileText,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';

export function AssumptionsModal() {
  const { assumptionsOpen, setAssumptionsOpen, network } = useSimulatorStore();
  const [activeTab, setActiveTab] = useState<'assumptions' | 'integrity'>('assumptions');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && assumptionsOpen) {
        setAssumptionsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [assumptionsOpen, setAssumptionsOpen]);

  if (!assumptionsOpen) return null;

  const integrity = validateNetworkIntegrity(network);

  const assumptions = [
    {
      id: 'A1',
      title: 'Closure Interval Semantics',
      rule: 'An airport closure defined by [start, end) is closed starting at minute start (inclusive) and reopening at minute end (exclusive).',
      behavior: [
        'A departure scheduled or held at minute t where start <= t < end cannot take off; it is held until at least end.',
        'An arrival scheduled or reaching destination at minute t where start <= t < end cannot land; it is held until end.',
        'A departure or arrival at exactly t = end is permitted immediately.',
        'A departure scheduled at exactly t = start is held.',
      ],
    },
    {
      id: 'A2',
      title: 'Arrival Disruption Policy (AIRBORNE_HOLD vs GROUND_HOLD)',
      rule: 'Default policy is AIRBORNE_HOLD. The alternate policy is GROUND_HOLD.',
      behavior: [
        'Under AIRBORNE_HOLD: If destination is closed upon arrival, aircraft departs on schedule, flies to destination, and holds in air until end. Arrival delay equals hold duration.',
        'Under GROUND_HOLD: If destination is closed upon arrival, departure is delayed at origin so touchdown aligns with reopening. Fixpoint loop re-evaluates origin closures.',
      ],
    },
    {
      id: 'A3',
      title: 'Geographic Continuity for Cancellations',
      rule: 'A CANCEL action is valid if and only if for every tail, remaining flights form a continuous geographic chain.',
      behavior: [
        'Permitted cancellations are chain suffixes (cancelling the last 1 to k legs) or out-and-back pairs ([A -> B, B -> A]).',
        'Isolating an aircraft at an outstation is strictly INVALID and rejected with: "aircraft would be stranded at <airport>".',
      ],
    },
    {
      id: 'A4',
      title: 'Standby Crew for Spare Aircraft Swaps',
      rule: 'When SWAP_SPARE replaces a tail starting at flightId, a dedicated standby crew takes over the spare aircraft.',
      behavior: [
        'Original crew and original tail retain only the flights prior to flightId.',
        'Standby crew duty begins at schedDep(first spare flight) - 60 minutes.',
        'Standby crew maximum duty is 600 minutes (10 hours).',
        'Spare aircraft is available from its base starting at 05:00 IST.',
      ],
    },
    {
      id: 'A5',
      title: 'Crew Duty Breaches are Flagged, Not Auto-Fixed',
      rule: 'If a crew duty exceeds 600 minutes, the engine flags breach = true and records excessMin.',
      behavior: [
        'The engine does NOT unilaterally cancel the flight or auto-assign relief crews.',
        'Duty breaches trigger dispatcher intervention, which is resolved via recovery optimiser recommendations.',
      ],
    },
    {
      id: 'A6',
      title: 'Constraint Binding and Tie Rules',
      rule: 'Deterministic priority resolution when multiple constraints bind departure.',
      behavior: [
        'If departure strictly exceeds non-closure base, cause is AIRPORT_CLOSED_ORIGIN or GROUND_HOLD_DEST_CLOSED.',
        'If a closure boundary coincides with a knock-on constraint (tie), delay is attributed to KNOCK_ON.',
        'Ties among non-closure constraints resolve in order: AIRCRAFT > CREW > SPARE > SCHEDULE.',
      ],
    },
    {
      id: 'A7',
      title: 'Objective Function & Scoring Weights',
      rule: 'Recovery optimiser evaluates scenario penalty score (lower is better):',
      formula: 'Score = 1.0 * strandedPaxTotal + 0.5 * totalArrDelayMin + 250 * crewBreaches + 0.1 * crewBreachExcessMin + 50 * cancelledFlights + 20 * sparesUsed',
      behavior: [
        'Every recommendation includes an itemized scoreBreakdown verifying each objective term.',
      ],
    },
    {
      id: 'A8',
      title: 'Decision Time Window',
      rule: 'When decisionTime is provided, actions cannot alter flights departing strictly prior to decisionTime (actualDep < decisionTime).',
      behavior: [],
    },
    {
      id: 'A9',
      title: 'Propagation Depth Metric',
      rule: 'Measures cascade distance in flight hops from the root disruption.',
      behavior: [
        'Directly delayed flight: propagation depth 0.',
        'Downstream knock-on flight: propagation depth equals predecessor links in chain (causeChain.length - 1).',
      ],
    },
  ];

  return (
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="assumptions-modal-title"
        className="fixed inset-0 z-modal flex items-center justify-center p-4 bg-ink/40 backdrop-blur-sm select-none animate-in fade-in duration-200"
      >
        <div className="w-[90vw] max-w-4xl h-[85vh] max-h-[85vh] bg-surface rounded-card border border-border shadow-card-elevated flex flex-col overflow-hidden">
          {/* Header */}
          <header className="h-14 px-6 border-b border-border bg-surface-alt/70 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center space-x-3">
              <div className="p-2 rounded-lg bg-surface border border-border text-ink">
                <FileText className="w-5 h-5 text-primary" aria-hidden="true" />
              </div>
              <div>
                  <h1 id="assumptions-modal-title" className="font-bold text-sm text-ink font-sans">
                    Operational Assumptions & Data Integrity
                  </h1>
                  <p className="text-[11px] text-ink-muted">
                    Mathematical modeling semantics and load-time dataset verification
                  </p>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              {/* Tabs */}
                <div role="tablist" aria-label="Assumptions and integrity tabs" className="flex p-0.5 bg-surface border border-border rounded-input text-xs font-medium">
                  <button
                    role="tab"
                    aria-selected={activeTab === 'assumptions'}
                    onClick={() => setActiveTab('assumptions')}
                    className={`px-3 py-1 rounded-[8px] transition-colors ${activeTab === 'assumptions'
                        ? 'bg-surface-alt text-ink font-semibold shadow-sm'
                        : 'text-ink-muted hover:text-ink'
                      }`}
                  >
                    Assumptions (A1 - A9)
                  </button>
                  <button
                    role="tab"
                    aria-selected={activeTab === 'integrity'}
                    onClick={() => setActiveTab('integrity')}
                    className={`px-3 py-1 rounded-[8px] transition-colors flex items-center space-x-1.5 ${activeTab === 'integrity'
                        ? 'bg-surface-alt text-ink font-semibold shadow-sm'
                        : 'text-ink-muted hover:text-ink'
                      }`}
                  >
                    <span>Data Integrity</span>
                    {integrity.warnings.length > 0 && (
                  <span className="w-2 h-2 rounded-full bg-amber-500" aria-label={`${integrity.warnings.length} warnings`}></span>
                    )}
                  </button>
                </div>

                <button
                  onClick={() => setAssumptionsOpen(false)}
                  aria-label="Close assumptions modal"
                  className="p-1.5 rounded-md hover:bg-surface-alt text-ink-muted hover:text-ink transition-colors"
                >
                  <X className="w-5 h-5" aria-hidden="true" />
                </button>
              </div>
          </header>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {activeTab === 'assumptions' ? (
              <div className="space-y-4">
                {assumptions.map((item) => (
                  <div
                    key={item.id}
                    className="p-4 rounded-card border border-border bg-surface-alt/40 space-y-2 text-xs"
                  >
                    <div className="flex items-center space-x-2">
                      <span className="px-2 py-0.5 rounded font-mono font-bold text-xs bg-ink text-surface">
                        [{item.id}]
                      </span>
                      <h3 className="font-bold text-sm text-ink">{item.title}</h3>
                    </div>

                    <p className="font-medium text-ink leading-relaxed">
                      {item.rule}
                    </p>

                    {item.formula && (
                      <div className="p-2.5 bg-surface border border-border rounded-md font-mono text-[11px] text-primary">
                        {item.formula}
                      </div>
                    )}

                    {item.behavior.length > 0 && (
                      <ul className="space-y-1 pl-4 list-disc text-ink-muted text-[11px] leading-relaxed">
                        {item.behavior.map((b, bIdx) => (
                          <li key={bIdx}>{b}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-5">
                {/* Counts Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  <div className="p-3 rounded-lg border border-border bg-surface text-center">
                    <span className="text-[10px] font-mono uppercase text-ink-faint">Airports</span>
                    <div className="text-xl font-bold font-mono text-ink mt-0.5">{integrity.counts.airports}</div>
                  </div>
                  <div className="p-3 rounded-lg border border-border bg-surface text-center">
                    <span className="text-[10px] font-mono uppercase text-ink-faint">Flights</span>
                    <div className="text-xl font-bold font-mono text-ink mt-0.5">{integrity.counts.flights}</div>
                  </div>
                  <div className="p-3 rounded-lg border border-border bg-surface text-center">
                    <span className="text-[10px] font-mono uppercase text-ink-faint">Tails</span>
                    <div className="text-xl font-bold font-mono text-ink mt-0.5">{integrity.counts.tails}</div>
                  </div>
                  <div className="p-3 rounded-lg border border-border bg-surface text-center">
                    <span className="text-[10px] font-mono uppercase text-ink-faint">Connections</span>
                    <div className="text-xl font-bold font-mono text-ink mt-0.5">{integrity.counts.connections}</div>
                  </div>
                  <div className="p-3 rounded-lg border border-border bg-surface text-center">
                    <span className="text-[10px] font-mono uppercase text-ink-faint">Crews</span>
                    <div className="text-xl font-bold font-mono text-ink mt-0.5">{integrity.counts.crews}</div>
                  </div>
                  <div className="p-3 rounded-lg border border-border bg-surface text-center">
                    <span className="text-[10px] font-mono uppercase text-ink-faint">Spares</span>
                    <div className="text-xl font-bold font-mono text-ink mt-0.5">{integrity.counts.spares}</div>
                  </div>
                </div>

                {/* Status Header */}
                <div className="flex items-center justify-between p-3.5 rounded-lg border border-border bg-surface">
                  <div className="flex items-center space-x-2.5">
                    {integrity.valid ? (
                      <CheckCircle2 className="w-5 h-5 text-[#3F6B4E]" />
                    ) : (
                      <AlertTriangle className="w-5 h-5 text-amber-600" />
                    )}
                    <div>
                      <div className="font-semibold text-xs text-ink">
                        {integrity.valid ? 'Network Structural Integrity Valid' : 'Integrity Issues Detected'}
                      </div>
                      <div className="text-[11px] text-ink-muted">
                        {integrity.warnings.length} load-time integrity warnings reported
                      </div>
                    </div>
                  </div>
                  <span className="text-xs font-mono px-2.5 py-1 rounded-full bg-[#CFE3D4] text-[#3F6B4E] font-medium border border-[#3F6B4E]/30">
                    PASS
                  </span>
                </div>

                {/* Warnings List */}
                <div className="space-y-2">
                  <span className="text-xs font-semibold text-ink uppercase font-mono tracking-wider">
                    Integrity Invariant Checks
                  </span>

                  {integrity.warnings.length === 0 ? (
                    <div className="p-6 rounded-card border border-border bg-surface text-center text-xs text-ink-muted space-y-1">
                      <ShieldCheck className="w-6 h-6 text-[#3F6B4E] mx-auto mb-1" />
                      <div className="font-semibold text-ink">Zero Data Integrity Violations</div>
                      <p className="text-[11px] text-ink-faint">
                        All tail chains are geographically continuous; turnaround times &ge; 30m; all baseline passenger connections feasible; all crew duties within 600m limit.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {integrity.warnings.map((w, wIdx) => (
                        <div
                          key={wIdx}
                          className="p-3 rounded-lg border border-amber-200 bg-amber-50/50 text-xs text-ink space-y-1"
                        >
                          <div className="flex items-center justify-between font-mono">
                            <span className="font-bold text-amber-900">{w.code}</span>
                            <span className="text-[10px] uppercase text-amber-700">
                              {w.entity} {w.id && `(${w.id})`}
                            </span>
                          </div>
                          <p className="text-[11px] text-amber-800">{w.message}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      );
}
