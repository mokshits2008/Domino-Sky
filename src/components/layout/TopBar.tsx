'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSimulatorStore } from '@/lib/store';
import { validateNetworkIntegrity } from '@/engine/validate';
import {
  Share2,
  Download,
  AlertTriangle,
  Check,
  ChevronDown,
  Layers,
  Activity,
  GitCompare,
} from 'lucide-react';

export function TopBar() {
  const pathname = usePathname();
  const {
    simulationResult,
    network,
    setAssumptionsOpen,
    serializeToQueryString,
  } = useSimulatorStore();

  const [copied, setCopied] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  const warningsCount = validateNetworkIntegrity(network).warnings.length;
  const fingerprint = simulationResult.scenarioFingerprint;

  const handleShare = async () => {
    if (typeof window === 'undefined') return;
    const qs = serializeToQueryString();
    const url = `${window.location.origin}${window.location.pathname}${qs ? `?${qs}` : ''}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      // Fallback
    }
  };

  const exportJSON = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(simulationResult, null, 2));
    const dlAnchor = document.createElement('a');
    dlAnchor.setAttribute('href', dataStr);
    dlAnchor.setAttribute('download', `domino-sky-simulation-${fingerprint.slice(0, 8)}.json`);
    dlAnchor.click();
    setExportOpen(false);
  };

  const exportCSV = () => {
    const headers = [
      'flight_id',
      'tail_id',
      'original_tail_id',
      'crew_id',
      'origin',
      'destination',
      'sched_dep',
      'sched_arr',
      'actual_dep',
      'actual_arr',
      'dep_delay_min',
      'arr_delay_min',
      'arrival_hold_min',
      'cancelled',
      'status',
      'severity',
      'primary_cause',
    ];

    const rows = simulationResult.flights.map((f) => [
      f.flightId,
      f.tailId,
      f.originalTailId,
      f.crewId,
      f.origin,
      f.destination,
      f.schedDep,
      f.schedArr,
      f.actualDep ?? '',
      f.actualArr ?? '',
      f.depDelay,
      f.arrDelay,
      f.arrivalHoldMin,
      f.cancelled ? 'true' : 'false',
      f.status,
      f.severity,
      `"${f.primaryCause?.type ?? 'ON_TIME'}"`,
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');

    const dlAnchor = document.createElement('a');
    dlAnchor.setAttribute('href', encodeURI(csvContent));
    dlAnchor.setAttribute('download', `domino-sky-flights-${fingerprint.slice(0, 8)}.csv`);
    dlAnchor.click();
    setExportOpen(false);
  };

  return (
    <header className="h-14 bg-surface border-b border-border px-4 flex items-center justify-between select-none z-sticky">
      {/* Brand & Navigation */}
      <div className="flex items-center space-x-6">
        <Link href="/" className="flex items-center space-x-2.5 group">
          <div className="w-7 h-7 bg-ink text-surface rounded-md flex flex-col justify-between p-1 shadow-sm transition-transform group-hover:scale-105">
            <div className="flex justify-between items-center px-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-surface"></span>
              <span className="w-1.5 h-1.5 rounded-full bg-surface"></span>
            </div>
            <div className="h-px bg-surface opacity-30 mx-0.5"></div>
            <div className="flex justify-between items-center px-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-surface"></span>
              <span className="w-1.5 h-1.5 rounded-full bg-surface"></span>
            </div>
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-sm tracking-tight text-ink font-sans leading-none">
              DOMINO SKY
            </span>
            <span className="text-[10px] uppercase font-mono tracking-wider text-ink-muted leading-none mt-0.5">
              Disruption Simulator
            </span>
          </div>
        </Link>

        {/* Global Nav tabs */}
        <nav className="flex items-center space-x-1 pl-4 border-l border-border">
          <Link
            href="/"
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              pathname === '/'
                ? 'bg-surface-alt text-ink font-semibold'
                : 'text-ink-muted hover:text-ink hover:bg-surface-alt/50'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Simulator</span>
          </Link>
          <Link
            href="/fragility"
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              pathname === '/fragility'
                ? 'bg-surface-alt text-ink font-semibold'
                : 'text-ink-muted hover:text-ink hover:bg-surface-alt/50'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Fragility Heatmap</span>
          </Link>
          <Link
            href="/compare"
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              pathname === '/compare'
                ? 'bg-surface-alt text-ink font-semibold'
                : 'text-ink-muted hover:text-ink hover:bg-surface-alt/50'
            }`}
          >
            <GitCompare className="w-3.5 h-3.5" />
            <span>Compare</span>
          </Link>
        </nav>
      </div>

      {/* Action Tools & Badges */}
      <div className="flex items-center space-x-3">
        {/* Scenario Fingerprint */}
        <div
          className="hidden md:flex items-center space-x-1.5 bg-surface-alt border border-border px-2.5 py-1 rounded-full text-xs font-mono text-ink-muted"
          title={`Scenario Fingerprint Hash: ${fingerprint}`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>
          <span>{fingerprint.slice(0, 8)}</span>
        </div>

        {/* Engine version */}
        <div className="hidden lg:block text-[11px] font-mono text-ink-faint px-2 py-0.5 border border-border rounded bg-surface">
          v{simulationResult.engineVersion}
        </div>

        {/* Assumptions Modal Button */}
        <button
          onClick={() => setAssumptionsOpen(true)}
          className="flex items-center space-x-1.5 px-2.5 py-1 rounded-md text-xs text-ink-muted hover:text-ink hover:bg-surface-alt border border-border transition-colors relative"
          title="View assumptions & data integrity report"
        >
          <span>Assumptions</span>
          {warningsCount > 0 && (
            <span className="flex items-center px-1.5 py-0.2 rounded-full bg-amber-100 text-amber-800 text-[10px] font-mono font-medium">
              <AlertTriangle className="w-2.5 h-2.5 mr-0.5" />
              {warningsCount}
            </span>
          )}
        </button>

        {/* Export Dropdown */}
        <div className="relative">
          <button
            onClick={() => setExportOpen(!exportOpen)}
            className="flex items-center space-x-1 px-2.5 py-1 rounded-md text-xs text-ink-muted hover:text-ink hover:bg-surface-alt border border-border transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export</span>
            <ChevronDown className="w-3 h-3 ml-0.5 text-ink-faint" />
          </button>

          {exportOpen && (
            <div className="absolute right-0 mt-1 w-44 bg-surface border border-border rounded-lg shadow-card-elevated py-1 z-popover">
              <button
                onClick={exportJSON}
                className="w-full text-left px-3 py-1.5 text-xs text-ink hover:bg-surface-alt flex items-center justify-between"
              >
                <span>Full Simulation (JSON)</span>
                <span className="text-[10px] font-mono text-ink-faint">.json</span>
              </button>
              <button
                onClick={exportCSV}
                className="w-full text-left px-3 py-1.5 text-xs text-ink hover:bg-surface-alt flex items-center justify-between"
              >
                <span>Flight Results (CSV)</span>
                <span className="text-[10px] font-mono text-ink-faint">.csv</span>
              </button>
            </div>
          )}
        </div>

        {/* Share Button */}
        <button
          onClick={handleShare}
          className="flex items-center space-x-1.5 px-3 py-1 bg-primary text-white hover:bg-primary-hover rounded-md text-xs font-medium transition-colors shadow-sm"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-300" />
              <span>Copied!</span>
            </>
          ) : (
            <>
              <Share2 className="w-3.5 h-3.5" />
              <span>Share</span>
            </>
          )}
        </button>
      </div>
    </header>
  );
}
