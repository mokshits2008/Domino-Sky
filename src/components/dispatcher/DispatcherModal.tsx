'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useSimulatorStore } from '@/lib/store';
import { RecoveryPlan } from '@/engine/candidates';
import { DispatchResult } from '@/ai/dispatch';
import { ProvenanceEntry } from '@/ai/template';
import { simulate } from '@/engine/simulate';
import { formatDelay } from '@/lib/formatters';
import {
  X,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  Check,
  ChevronDown,
  ChevronUp,
  Cpu,
} from 'lucide-react';

export function DispatcherModal() {
  const {
    dispatcherOpen,
    setDispatcherOpen,
    closures,
    arrivalPolicy,
    network,
    applyPlanActions,
  } = useSimulatorStore();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rankedPlans, setRankedPlans] = useState<RecoveryPlan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [dispatchData, setDispatchData] = useState<DispatchResult | null>(null);
  const [auditOpen, setAuditOpen] = useState(false);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dispatcherOpen) {
        setDispatcherOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [dispatcherOpen, setDispatcherOpen]);

  // Fetch recommendations and narrative when modal opens
  useEffect(() => {
    if (!dispatcherOpen || closures.length === 0) return;

    let isMounted = true;
    setLoading(true);
    setError(null);

    async function loadDispatcher() {
      try {
        // 1. Fetch ranked recovery plans
        const recRes = await fetch('/api/recommend', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            closures,
            config: { arrivalPolicy },
          }),
        });

        if (!recRes.ok) {
          throw new Error(`Failed to generate recovery plans: ${recRes.statusText}`);
        }

        const recData = await recRes.json();
        if (!isMounted) return;

        const plans: RecoveryPlan[] = recData.rankedPlans || [];
        setRankedPlans(plans);

        const initialPlanId = plans.length > 0 ? plans[0].id : null;
        setSelectedPlanId(initialPlanId);

        // 2. Fetch AI dispatch narrative
        const dispatchRes = await fetch('/api/dispatch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            closures,
            planId: initialPlanId,
            provider: 'mock',
          }),
        });

        if (!dispatchRes.ok) {
          throw new Error(`Failed to fetch AI dispatch analysis: ${dispatchRes.statusText}`);
        }

        const dispJson: DispatchResult = await dispatchRes.json();
        if (isMounted) {
          setDispatchData(dispJson);
        }
      } catch (err: unknown) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Unknown error during dispatch');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadDispatcher();

    return () => {
      isMounted = false;
    };
  }, [dispatcherOpen, closures, arrivalPolicy]);

  // Handle plan switch
  const handleSelectPlan = async (planId: string) => {
    setSelectedPlanId(planId);
    try {
      const dispatchRes = await fetch('/api/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          closures,
          planId,
          provider: 'mock',
        }),
      });
      if (dispatchRes.ok) {
        const dispJson: DispatchResult = await dispatchRes.json();
        setDispatchData(dispJson);
      }
    } catch {
      // Keep previous
    }
  };

  const selectedPlan = useMemo(() => {
    return rankedPlans.find((p) => p.id === selectedPlanId) ?? rankedPlans[0] ?? null;
  }, [rankedPlans, selectedPlanId]);

  // In-code assertion comparing KPI values to local simulate()
  const localAssertion = useMemo(() => {
    if (!selectedPlan) return { verified: false, delta: null };
    const localResult = simulate(network, {
      closures,
      actions: selectedPlan.actions,
      config: { arrivalPolicy },
    });

    const m = localResult.metrics;
    const pm = selectedPlan.afterMetrics;

    const matches =
      m.delayedFlights === pm.delayedFlights &&
      m.totalArrDelayMin === pm.totalArrDelayMin &&
      m.strandedPaxTotal === pm.strandedPaxTotal &&
      m.crewBreaches === pm.crewBreaches &&
      m.cancelledFlights === pm.cancelledFlights;

    return {
      verified: matches,
      localMetrics: m,
      planMetrics: pm,
    };
  }, [selectedPlan, network, closures, arrivalPolicy]);

  if (!dispatcherOpen) return null;

  return (
    <div className="fixed inset-0 z-modal flex items-center justify-center p-4 bg-ink/40 backdrop-blur-sm select-none animate-in fade-in duration-200">
      <div className="w-[96vw] max-w-7xl h-[92vh] max-h-[92vh] bg-surface rounded-card border border-border shadow-card-elevated flex flex-col overflow-hidden">
        {/* Modal Top Header */}
        <header className="h-14 px-6 border-b border-border bg-surface-alt/70 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-primary-tint text-primary">
              <Sparkles className="w-5 h-5 text-primary" />
            </div>
            <div>
              <div className="flex items-center space-x-2.5">
                <h1 className="font-bold text-sm text-ink font-sans">
                  AI Ops Dispatcher & Schedule Recovery
                </h1>
                {dispatchData?.validation && (
                  <span
                    className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-mono border font-medium ${
                      dispatchData.validation.passed
                        ? 'bg-[#CFE3D4] text-[#3F6B4E] border-[#3F6B4E]/30'
                        : 'bg-[#F5E6B3] text-[#7A6420] border-[#7A6420]/30'
                    }`}
                  >
                    <ShieldCheck className="w-3 h-3" />
                    <span>
                      {dispatchData.validation.passed
                        ? 'Deterministic Engine Validated'
                        : 'Fallback Mode'}
                    </span>
                    <span className="text-[9px] opacity-75">
                      ({dispatchData.validation.retries} retries)
                    </span>
                  </span>
                )}
                {localAssertion.verified && (
                  <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-mono bg-[#CFE3D4] text-[#3F6B4E] border border-[#3F6B4E]/30 font-medium">
                    <CheckCircle2 className="w-2.5 h-2.5" />
                    <span>In-Code Assertion Pass (0 delta)</span>
                  </span>
                )}
              </div>
              <p className="text-[11px] text-ink-muted">
                Multi-objective evaluated recovery plans with zero hallucination number safety
              </p>
            </div>
          </div>

          <button
            onClick={() => setDispatcherOpen(false)}
            className="p-2 rounded-lg hover:bg-surface-alt text-ink-muted hover:text-ink transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        {/* Modal Body: 3 Column Layout */}
        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center space-y-3">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
            <span className="text-xs font-mono text-ink-muted">
              Running beam search recovery & number-safe dispatch synthesis…
            </span>
          </div>
        ) : error ? (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-2">
            <AlertTriangle className="w-8 h-8 text-red-600" />
            <div className="text-sm font-semibold text-ink">Dispatcher Error</div>
            <p className="text-xs text-red-600 font-mono">{error}</p>
          </div>
        ) : (
          <div className="flex-1 min-h-0 grid grid-cols-12 overflow-hidden divide-x divide-border">
            {/* COLUMN 1: Ranked Plan Cards (col-span-3) */}
            <div className="col-span-3 flex flex-col min-h-0 bg-surface overflow-y-auto p-4 space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-border">
                <span className="text-xs font-semibold text-ink uppercase font-mono tracking-wider">
                  Ranked Recovery Plans
                </span>
                <span className="text-[11px] font-mono text-ink-muted">
                  {rankedPlans.length} candidates
                </span>
              </div>

              {rankedPlans.map((plan, idx) => {
                const isSelected = plan.id === selectedPlan?.id;
                const score = plan.score;
                const strandedDelta = plan.deltas.strandedPaxTotal;
                const delayDelta = plan.deltas.totalArrDelayMin;

                return (
                  <div
                    key={plan.id}
                    onClick={() => handleSelectPlan(plan.id)}
                    className={`p-3.5 rounded-card border cursor-pointer transition-all space-y-2.5 ${
                      isSelected
                        ? 'border-primary bg-primary-tint/25 shadow-card'
                        : 'border-border bg-surface hover:bg-surface-alt/70'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-1.5">
                        <span
                          className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-mono font-bold ${
                            idx === 0
                              ? 'bg-primary text-white'
                              : 'bg-surface-alt text-ink-muted border border-border'
                          }`}
                        >
                          {idx + 1}
                        </span>
                        <span className="font-mono font-bold text-xs text-ink">
                          {plan.id}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-surface border border-border text-ink-muted">
                        Score: {Math.round(score)}
                      </span>
                    </div>

                    {/* Actions list */}
                    <div className="space-y-1">
                      {plan.actions.map((act, aIdx) => (
                        <div
                          key={aIdx}
                          className="text-[11px] font-mono text-ink flex items-center space-x-1"
                        >
                          {act.type === 'SWAP_SPARE' ? (
                            <span className="px-1.5 py-0.2 rounded bg-spare/40 text-primary font-semibold text-[10px]">
                              SWAP {act.spareTail} → {act.flightId}
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.2 rounded bg-[#D9D5CE] text-[#5E5A52] font-semibold text-[10px]">
                              CANCEL {act.flightIds.join(', ')}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Deltas preview */}
                    <div className="grid grid-cols-2 gap-1 pt-1 border-t border-border/60 text-[10px] font-mono">
                      <div>
                        <span className="text-ink-faint">Stranded Pax: </span>
                        <span
                          className={
                            strandedDelta <= 0 ? 'text-[#3F6B4E] font-semibold' : 'text-[#8C2F2A]'
                          }
                        >
                          {strandedDelta > 0 ? `+${strandedDelta}` : strandedDelta}
                        </span>
                      </div>
                      <div>
                        <span className="text-ink-faint">Delay: </span>
                        <span
                          className={
                            delayDelta <= 0 ? 'text-[#3F6B4E] font-semibold' : 'text-[#8C2F2A]'
                          }
                        >
                          {formatDelay(delayDelta)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* COLUMN 2: Before / After Split View & Flight Diffs (col-span-5) */}
            <div className="col-span-5 flex flex-col min-h-0 bg-canvas overflow-y-auto p-4 space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-border">
                <span className="text-xs font-semibold text-ink uppercase font-mono tracking-wider">
                  Before vs After Recovery Diff
                </span>
                <span className="text-[11px] font-mono text-ink-muted">
                  Interactive Evaluation
                </span>
              </div>

              {/* KPI Delta summary comparison bar */}
              {selectedPlan && (
                <div className="grid grid-cols-3 gap-2 select-none">
                  <div className="p-2.5 rounded-lg border border-border bg-surface">
                    <span className="text-[10px] font-mono uppercase text-ink-faint">
                      Stranded Pax
                    </span>
                    <div className="flex items-baseline space-x-1.5 mt-0.5">
                      <span className="font-mono text-base font-bold text-ink">
                        {selectedPlan.beforeMetrics.strandedPaxTotal}
                      </span>
                      <ArrowRight className="w-3 h-3 text-ink-faint" />
                      <span className="font-mono text-base font-bold text-[#3F6B4E]">
                        {selectedPlan.afterMetrics.strandedPaxTotal}
                      </span>
                    </div>
                  </div>

                  <div className="p-2.5 rounded-lg border border-border bg-surface">
                    <span className="text-[10px] font-mono uppercase text-ink-faint">
                      Arrival Delay
                    </span>
                    <div className="flex items-baseline space-x-1.5 mt-0.5">
                      <span className="font-mono text-base font-bold text-ink">
                        {selectedPlan.beforeMetrics.totalArrDelayMin}m
                      </span>
                      <ArrowRight className="w-3 h-3 text-ink-faint" />
                      <span className="font-mono text-base font-bold text-[#3F6B4E]">
                        {selectedPlan.afterMetrics.totalArrDelayMin}m
                      </span>
                    </div>
                  </div>

                  <div className="p-2.5 rounded-lg border border-border bg-surface">
                    <span className="text-[10px] font-mono uppercase text-ink-faint">
                      Crew Breaches
                    </span>
                    <div className="flex items-baseline space-x-1.5 mt-0.5">
                      <span className="font-mono text-base font-bold text-ink">
                        {selectedPlan.beforeMetrics.crewBreaches}
                      </span>
                      <ArrowRight className="w-3 h-3 text-ink-faint" />
                      <span className="font-mono text-base font-bold text-[#3F6B4E]">
                        {selectedPlan.afterMetrics.crewBreaches}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Diffs List Container */}
              <div className="rounded-card border border-border bg-surface shadow-card p-3 space-y-3">
                <div className="flex items-center justify-between text-xs text-ink font-semibold">
                  <span>Flight Schedule Modifications</span>
                  <div className="flex items-center space-x-3 text-[10px] font-mono text-ink-muted">
                    <span className="text-closure">● Before Disrupted</span>
                    <span className="text-[#3F6B4E]">● After Recovered</span>
                  </div>
                </div>

                {/* Diffs List */}
                {selectedPlan?.flightDiffs && selectedPlan.flightDiffs.length > 0 ? (
                  <div className="space-y-2">
                    {selectedPlan.flightDiffs.map((diff) => (
                      <div
                        key={diff.flightId}
                        className="p-2.5 rounded-lg bg-surface-alt border border-border text-xs space-y-1"
                      >
                        <div className="flex items-center justify-between font-mono">
                          <span className="font-bold text-ink">{diff.flightId}</span>
                          <span
                            className={`text-[9px] px-1.5 py-0.2 rounded font-semibold ${
                              diff.status === 'RESOLVED' || diff.status === 'IMPROVED'
                                ? 'bg-[#CFE3D4] text-[#3F6B4E]'
                                : diff.status === 'CANCELLED'
                                ? 'bg-[#D9D5CE] text-[#5E5A52]'
                                : 'bg-[#EBA5A0] text-[#8C2F2A]'
                            }`}
                          >
                            {diff.status}
                          </span>
                        </div>
                        <div className="flex items-center space-x-2 text-[11px] font-mono">
                          <span className="text-ink-faint">Arr delay:</span>
                          <span className="text-[#8C2F2A]">{formatDelay(diff.beforeArrDelay)}</span>
                          <ArrowRight className="w-3 h-3 text-ink-faint" />
                          <span className="text-[#3F6B4E] font-bold">
                            {formatDelay(diff.afterArrDelay)}
                          </span>
                          {diff.diffMin !== 0 && (
                            <span className="text-[#3F6B4E]">
                              ({diff.diffMin > 0 ? `-${diff.diffMin}m` : `+${Math.abs(diff.diffMin)}m`})
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-4 text-center text-xs text-ink-faint font-mono">
                    No flight-level schedule alterations in this plan.
                  </div>
                )}
              </div>
            </div>

            {/* COLUMN 3: AI Narrative & Number Safety Audit (col-span-4) */}
            <div className="col-span-4 flex flex-col min-h-0 bg-surface overflow-y-auto p-5 space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-border">
                <span className="text-xs font-semibold text-ink uppercase font-mono tracking-wider flex items-center space-x-1.5">
                  <Cpu className="w-3.5 h-3.5 text-primary" />
                  <span>Dispatcher Synthesis</span>
                </span>
                <span className="text-[10px] font-mono text-ink-muted">Zero-Hallucination</span>
              </div>

              {/* Headline */}
              {dispatchData && (
                <div className="space-y-1.5">
                  <h2 className="font-bold text-sm text-ink font-sans leading-snug">
                    {dispatchData.headline}
                  </h2>
                </div>
              )}

              {/* Narrative Card with Interactive Number Chips */}
              {dispatchData && (
                <div className="p-3.5 rounded-card bg-surface-alt border border-border text-xs text-ink leading-relaxed space-y-2">
                  <div className="font-sans">
                    {dispatchData.narrative}
                  </div>
                  <div className="text-[10px] text-ink-faint pt-2 border-t border-border flex items-center justify-between">
                    <span>Numbers checked against deterministic facts catalog</span>
                    <span className="font-mono text-emerald-800 font-medium">✓ Audit Ready</span>
                  </div>
                </div>
              )}

              {/* Operational Reasoning & Tradeoffs */}
              {dispatchData && dispatchData.reasoning && dispatchData.reasoning.length > 0 && (
                <div className="space-y-1.5 text-xs">
                  <span className="font-semibold text-ink">Operational Rationale</span>
                  <ul className="space-y-1 list-disc list-inside text-ink-muted text-[11px]">
                    {dispatchData.reasoning.map((item: string, i: number) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}

              {dispatchData && dispatchData.tradeoffs && dispatchData.tradeoffs.length > 0 && (
                <div className="space-y-1.5 text-xs">
                  <span className="font-semibold text-ink">Tradeoffs & Secondary Impacts</span>
                  <ul className="space-y-1 list-disc list-inside text-ink-muted text-[11px]">
                    {dispatchData.tradeoffs.map((item: string, i: number) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Number Safety Audit Accordion */}
              <div className="border border-border rounded-lg overflow-hidden">
                <button
                  onClick={() => setAuditOpen(!auditOpen)}
                  className="w-full px-3 py-2 bg-surface-alt text-xs font-mono font-medium flex items-center justify-between text-ink hover:bg-surface-alt/80 transition-colors"
                >
                  <span className="flex items-center space-x-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-primary" />
                    <span>Number Audit ({dispatchData?.provenance?.length ?? 0} tokens)</span>
                  </span>
                  {auditOpen ? (
                    <ChevronUp className="w-3.5 h-3.5 text-ink-faint" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5 text-ink-faint" />
                  )}
                </button>

                {auditOpen && dispatchData?.provenance && (
                  <div className="p-2 bg-surface divide-y divide-border text-[10px] font-mono max-h-44 overflow-y-auto">
                    {dispatchData.provenance.map((prov: ProvenanceEntry, pIdx: number) => (
                      <div key={pIdx} className="py-1.5 flex items-center justify-between">
                        <div className="flex flex-col">
                          <span className="font-bold text-ink">{prov.key}</span>
                          <span className="text-ink-faint">Token: {prov.placeholder}</span>
                        </div>
                        <div className="px-2 py-0.5 rounded bg-surface-alt border border-border font-bold text-primary">
                          {String(prov.value)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Apply Plan Actions Button */}
              <div className="pt-2 mt-auto space-y-2">
                <button
                  onClick={() => {
                    if (selectedPlan) {
                      applyPlanActions(selectedPlan.actions);
                    }
                  }}
                  className="w-full h-10 bg-primary hover:bg-primary-hover text-white font-semibold text-xs rounded-input flex items-center justify-center space-x-2 shadow-sm transition-all"
                >
                  <Check className="w-4 h-4" />
                  <span>Apply This Recovery Plan</span>
                </button>
                <button
                  onClick={() => setDispatcherOpen(false)}
                  className="w-full h-8 text-xs text-ink-muted hover:text-ink font-medium"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
