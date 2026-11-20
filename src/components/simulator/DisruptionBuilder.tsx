'use client';

import React, { useState, useEffect } from 'react';
import { useSimulatorStore } from '@/lib/store';
import { formatTime, formatDuration, formatClosureWindow, getAirportTier } from '@/lib/formatters';
import { parseTimeToMinutes } from '@/engine/time';
import { Closure } from '@/engine/types';
import {
  Plus,
  Trash2,
  Sparkles,
  RotateCcw,
  Clock,
  ShieldAlert,
  Info,
} from 'lucide-react';

export function DisruptionBuilder() {
  const {
    closures,
    arrivalPolicy,
    addClosure,
    updateClosure,
    removeClosure,
    setArrivalPolicy,
    resetAll,
    setDispatcherOpen,
    isRecomputing,
    network,
  } = useSimulatorStore();

  const [selectedAirport, setSelectedAirport] = useState<string>('BLR');
  const [startMin, setStartMin] = useState<number>(360); // 06:00
  const [endMin, setEndMin] = useState<number>(510);     // 08:30
  const [startInput, setStartInput] = useState<string>('06:00');
  const [endInput, setEndInput] = useState<string>('08:30');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Sync builder controls with active closure if closures exist
  useEffect(() => {
    if (closures.length > 0) {
      const active = closures[0];
      setSelectedAirport(active.airport);
      setStartMin(active.start);
      setEndMin(active.end);
      setStartInput(formatTime(active.start));
      setEndInput(formatTime(active.end));
    }
  }, [closures]);

  // Group airports by tier (supports both dataset's mega_hub/regional_hub/spoke and 1/2/3)
  const tier1 = network.airports.filter((a) => getAirportTier(a.tier) === 1);
  const tier2 = network.airports.filter((a) => getAirportTier(a.tier) === 2);
  const tier3 = network.airports.filter((a) => getAirportTier(a.tier) === 3);

  const handleAirportChange = (newAirport: string) => {
    setSelectedAirport(newAirport);
    setErrorMsg(null);
    if (closures.length > 0) {
      updateClosure(closures[0].id, { airport: newAirport });
    } else {
      addClosure(newAirport, startMin, endMin);
    }
  };

  const handleStartInputChange = (val: string) => {
    setStartInput(val);
    try {
      const parsed = parseTimeToMinutes(val);
      if (parsed < endMin) {
        setStartMin(parsed);
        setErrorMsg(null);
        if (closures.length > 0) {
          updateClosure(closures[0].id, { start: parsed });
        }
      }
    } catch {
      // Ignore intermediate typing
    }
  };

  const handleEndInputChange = (val: string) => {
    setEndInput(val);
    try {
      const parsed = parseTimeToMinutes(val);
      if (parsed > startMin) {
        setEndMin(parsed);
        setErrorMsg(null);
        if (closures.length > 0) {
          updateClosure(closures[0].id, { end: parsed });
        }
      }
    } catch {
      // Ignore intermediate typing
    }
  };

  const handleStartSlider = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    const clamped = Math.min(val, endMin - 15);
    setStartMin(clamped);
    setStartInput(formatTime(clamped));
    setErrorMsg(null);
    if (closures.length > 0) {
      updateClosure(closures[0].id, { start: clamped });
    } else {
      addClosure(selectedAirport, clamped, endMin);
    }
  };

  const handleEndSlider = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    const clamped = Math.max(val, startMin + 15);
    setEndMin(clamped);
    setEndInput(formatTime(clamped));
    setErrorMsg(null);
    if (closures.length > 0) {
      updateClosure(closures[0].id, { end: clamped });
    } else {
      addClosure(selectedAirport, startMin, clamped);
    }
  };

  const applyDurationChip = (durationMin: number) => {
    const newEnd = Math.min(1440, startMin + durationMin);
    setEndMin(newEnd);
    setEndInput(formatTime(newEnd));
    setErrorMsg(null);
    if (closures.length > 0) {
      updateClosure(closures[0].id, { end: newEnd });
    } else {
      addClosure(selectedAirport, startMin, newEnd);
    }
  };

  const handleAddClosure = () => {
    if (closures.length >= 5) {
      setErrorMsg('Maximum 5 closures allowed');
      return;
    }
    if (startMin >= endMin) {
      setErrorMsg('Start time must precede end time');
      return;
    }

    // If an existing closure already matches this airport, pick another airport or add new window
    const alreadyExists = closures.some((c) => c.airport === selectedAirport);
    const airportToAdd = alreadyExists
      ? (network.airports.find((a) => !closures.some((c) => c.airport === a.id))?.id ?? 'BOM')
      : selectedAirport;

    const success = addClosure(airportToAdd, startMin, endMin);
    if (!success) {
      setErrorMsg('Could not add closure');
    } else {
      setSelectedAirport(airportToAdd);
      setErrorMsg(null);
    }
  };

  const handleSelectClosureToEdit = (c: Closure) => {
    setSelectedAirport(c.airport);
    setStartMin(c.start);
    setEndMin(c.end);
    setStartInput(formatTime(c.start));
    setEndInput(formatTime(c.end));
  };

  return (
      <aside
        aria-label="Disruption Builder"
        className="w-80 min-w-80 max-w-80 bg-surface border-r border-border h-full flex flex-col justify-between overflow-y-auto select-none"
      >
        <div className="p-4 space-y-5">
          {/* Rail Title */}
          <div className="flex items-center justify-between pb-2 border-b border-border">
            <div className="flex items-center space-x-2">
              <ShieldAlert className="w-4 h-4 text-closure" aria-hidden="true" />
              <h2 className="font-semibold text-sm text-ink tracking-tight">Create Disruption</h2>
            </div>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-surface-alt border border-border text-ink-muted">
              {closures.length}/5 active
            </span>
          </div>

          {/* Airport Select (Tier Grouped) */}
          <div className="space-y-1.5">
              <label htmlFor="target-airport-select" className="text-xs font-medium text-ink-muted flex items-center justify-between">
                <span>Target Airport</span>
                <span className="text-[10px] font-mono text-ink-faint">16 network hubs</span>
              </label>
              <select
                id="target-airport-select"
                aria-label="Target Airport"
                value={selectedAirport}
                onChange={(e) => handleAirportChange(e.target.value)}
                className="w-full h-9 px-2.5 bg-surface border border-border rounded-input text-xs font-sans text-ink focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors"
              >
                <optgroup label="Tier 1 — Mega Hubs">
                  {tier1.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.id} — {a.name} ({a.city})
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Tier 2 — Regional Hubs">
                  {tier2.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.id} — {a.name} ({a.city})
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Tier 3 — Spoke Airports">
                  {tier3.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.id} — {a.name} ({a.city})
                    </option>
                  ))}
                </optgroup>
              </select>
          </div>

          {/* Dual Handle Slider & Inputs */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-ink-muted flex items-center space-x-1">
                <Clock className="w-3.5 h-3.5 text-ink-faint" aria-hidden="true" />
                <span>Closure Window [Start, End)</span>
              </label>
              <span className="text-[11px] font-mono text-ink-muted">
                {formatDuration(endMin - startMin)}
              </span>
            </div>

            {/* Dual Sliders */}
            <div className="space-y-2 pt-1">
              <div className="flex flex-col space-y-1">
                <div className="flex justify-between text-[10px] font-mono text-ink-faint">
                  <span>Start: {formatTime(startMin)}</span>
                  <span>00:00 - 24:00</span>
                </div>
                <input
                  id="closure-start-slider"
                  aria-label="Closure window start time"
                  aria-valuemin={0}
                  aria-valuemax={1440}
                  aria-valuenow={startMin}
                  aria-valuetext={formatTime(startMin)}
                  type="range"
                  min={0}
                  max={1440}
                  step={5}
                  value={startMin}
                  onChange={handleStartSlider}
                  className="w-full accent-primary h-1.5 bg-surface-alt rounded-lg cursor-pointer"
                />
              </div>
              <div className="flex flex-col space-y-1">
                <div className="flex justify-between text-[10px] font-mono text-ink-faint">
                  <span>End: {formatTime(endMin)}</span>
                  <span>00:00 - 24:00</span>
                </div>
                <input
                  id="closure-end-slider"
                  aria-label="Closure window end time"
                  aria-valuemin={0}
                  aria-valuemax={1440}
                  aria-valuenow={endMin}
                  aria-valuetext={formatTime(endMin)}
                  type="range"
                  min={0}
                  max={1440}
                  step={5}
                  value={endMin}
                  onChange={handleEndSlider}
                  className="w-full accent-primary h-1.5 bg-surface-alt rounded-lg cursor-pointer"
                />
              </div>
            </div>

            {/* Manual HH:MM Inputs */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <div className="space-y-1">
                <label htmlFor="closure-start-input" className="text-[10px] uppercase font-mono text-ink-faint block">
                  Start IST
                </label>
                <input
                  id="closure-start-input"
                  aria-label="Closure start time in HH:MM IST"
                  type="text"
                  value={startInput}
                  onChange={(e) => handleStartInputChange(e.target.value)}
                  placeholder="06:00"
                  className="w-full h-8 px-2.5 font-mono text-xs text-ink bg-surface border border-border rounded-input focus:border-primary outline-none"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="closure-end-input" className="text-[10px] uppercase font-mono text-ink-faint block">
                  End IST
                </label>
                <input
                  id="closure-end-input"
                  aria-label="Closure end time in HH:MM IST"
                  type="text"
                  value={endInput}
                  onChange={(e) => handleEndInputChange(e.target.value)}
                  placeholder="08:30"
                  className="w-full h-8 px-2.5 font-mono text-xs text-ink bg-surface border border-border rounded-input focus:border-primary outline-none"
                />
              </div>
            </div>

            {/* Duration Chips */}
            <div className="flex items-center space-x-1.5 pt-1">
              <span className="text-[10px] font-mono text-ink-faint mr-1">Presets:</span>
              {[60, 90, 120, 180].map((dur) => (
                <button
                  key={dur}
                  aria-label={`Set duration to ${dur} minutes`}
                  onClick={() => applyDurationChip(dur)}
                  className="px-2 py-0.5 rounded-full text-[10px] font-mono border border-border bg-surface-alt text-ink-muted hover:text-ink hover:border-primary/50 transition-colors"
                >
                  +{dur}m
                </button>
              ))}
            </div>

            {errorMsg && (
              <div className="text-[11px] text-red-600 font-medium px-2 py-1 bg-red-50 border border-red-200 rounded">
                {errorMsg}
              </div>
            )}

            <button
              onClick={handleAddClosure}
              disabled={closures.length >= 5}
              className="w-full h-8.5 bg-surface-alt hover:bg-surface-alt/80 border border-border text-ink rounded-input text-xs font-medium flex items-center justify-center space-x-1.5 transition-colors disabled:opacity-50"
            >
              <Plus className="w-3.5 h-3.5 text-primary" />
              <span>+ Add Additional Disruption Window</span>
            </button>
          </div>

          {/* Active Disruption Chips */}
          <div className="space-y-2 pt-2 border-t border-border">
            <label className="text-xs font-medium text-ink-muted flex items-center justify-between">
              <span>Active Closures</span>
              <span className="text-[10px] font-mono text-ink-faint">{closures.length} active</span>
            </label>

            {closures.length === 0 ? (
              <div className="p-3 border border-dashed border-border rounded-input text-center text-xs text-ink-faint">
                Network running normally. Select an airport above or click a preset to simulate.
              </div>
            ) : (
              <div className="space-y-1.5">
                {closures.map((c) => (
                  <div
                    key={c.id}
                    onClick={() => handleSelectClosureToEdit(c)}
                    className={`flex items-center justify-between p-2 rounded-lg border text-xs cursor-pointer transition-colors ${c.airport === selectedAirport
                      ? 'bg-closure-tint/60 border-closure shadow-sm'
                      : 'bg-closure-tint/25 border-closure/30 hover:bg-closure-tint/40'
                      }`}
                  >
                    <div className="flex items-center space-x-2">
                      <span className="font-mono font-bold text-xs text-closure bg-surface px-1.5 py-0.5 rounded border border-closure/30">
                        {c.airport}
                      </span>
                      <div className="flex flex-col">
                        <span className="font-mono text-[11px]">
                          {formatClosureWindow(c.start, c.end)}
                        </span>
                        <span className="text-[10px] text-ink-muted">
                          Duration: {formatDuration(c.end - c.start)}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeClosure(c.id);
                      }}
                      className="p-1 rounded text-ink-muted hover:text-red-700 hover:bg-surface/80 transition-colors"
                      title="Remove closure"
                      aria-label={`Remove closure for ${c.airport}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Arrival Policy Segmented Control */}
          <div className="space-y-1.5 pt-2 border-t border-border">
            <div className="flex items-center justify-between">
                <label id="arrival-policy-label" className="text-xs font-medium text-ink-muted flex items-center space-x-1">
                  <span>Arrival Policy</span>
                  <Info className="w-3 h-3 text-ink-faint" aria-hidden="true" />
                </label>
                <span className="text-[10px] font-mono text-ink-faint">
                  {arrivalPolicy === 'AIRBORNE_HOLD' ? 'Fuel burn hold' : 'Gate hold'}
                </span>
            </div>

              <div
                role="radiogroup"
                aria-labelledby="arrival-policy-label"
                className="grid grid-cols-2 p-0.5 bg-surface-alt border border-border rounded-input text-xs font-medium"
              >
                <button
                  role="radio"
                  aria-checked={arrivalPolicy === 'AIRBORNE_HOLD'}
                  onClick={() => setArrivalPolicy('AIRBORNE_HOLD')}
                  className={`py-1.5 rounded-[8px] transition-all text-center ${arrivalPolicy === 'AIRBORNE_HOLD'
                    ? 'bg-surface text-ink font-semibold shadow-card'
                    : 'text-ink-muted hover:text-ink'
                    }`}
                >
                  Airborne Hold
                </button>
                <button
                  role="radio"
                  aria-checked={arrivalPolicy === 'GROUND_HOLD'}
                  onClick={() => setArrivalPolicy('GROUND_HOLD')}
                  className={`py-1.5 rounded-[8px] transition-all text-center ${arrivalPolicy === 'GROUND_HOLD'
                    ? 'bg-surface text-ink font-semibold shadow-card'
                    : 'text-ink-muted hover:text-ink'
                    }`}
                >
                  Ground Hold
                </button>
              </div>
              <p className="text-[10px] text-ink-faint leading-tight">
                {arrivalPolicy === 'AIRBORNE_HOLD'
                  ? 'Aircraft depart on time; arrive and hold in airspace until airport opens.'
                  : 'Aircraft held at origin gate so departure is delayed and arrival aligns with opening.'}
              </p>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="p-4 border-t border-border bg-surface-alt/50 space-y-2.5">
            {/* Live status */}
            <div className="flex items-center justify-between text-xs text-ink-muted">
                <div className="flex items-center space-x-1.5" aria-live="polite">
                  <span
                    className={`w-2 h-2 rounded-full ${isRecomputing ? 'bg-amber-500 animate-ping' : 'bg-emerald-500'
                      }`}
                    aria-hidden="true"
                  ></span>
                  <span className="text-[11px] font-mono">
                    {isRecomputing ? 'Computing cascade…' : 'Engine synchronized'}
                  </span>
                </div>
                <button
                  onClick={resetAll}
                  aria-label="Reset simulation to baseline"
                  className="flex items-center space-x-1 text-[11px] text-ink-muted hover:text-ink transition-colors"
                >
                  <RotateCcw className="w-3 h-3" aria-hidden="true" />
                  <span>Reset</span>
                </button>
              </div>

              {/* Primary AI Recovery Button */}
              <button
                onClick={() => setDispatcherOpen(true)}
                disabled={closures.length === 0}
                aria-label="Ask AI Dispatcher for schedule recovery recommendations"
                className="w-full h-10 bg-primary text-white hover:bg-primary-hover font-semibold text-xs rounded-input flex items-center justify-center space-x-2 shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Sparkles className="w-4 h-4 text-sky-200" aria-hidden="true" />
                <span>Ask AI Dispatcher</span>
              </button>
            </div>
          </aside>
          );
}
