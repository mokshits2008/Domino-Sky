import { create } from 'zustand';
import { loadFlightNetwork } from '@/engine/load';
import { simulate } from '@/engine/simulate';
import {
  Closure,
  Action,
  ArrivalPolicy,
  SimulationResult,
  FlightNetworkData,
  FlightResult,
} from '@/engine/types';
import { formatTime } from '@/lib/formatters';
import { parseTimeToMinutes } from '@/engine/time';

const networkData = loadFlightNetwork();
const initialBaseline = simulate(networkData, { closures: [] });

export interface SimulatorState {
  network: FlightNetworkData;
  closures: Closure[];
  arrivalPolicy: ArrivalPolicy;
  appliedActions: Action[];
  selectedFlightId: string | null;
  activeTab: 'gantt' | 'map' | 'flights' | 'connections' | 'crews';
  drawerOpen: boolean;
  dispatcherOpen: boolean;
  assumptionsOpen: boolean;
  isRecomputing: boolean;

  // Derived results
  baselineResult: SimulationResult;
  simulationResult: SimulationResult;

  // Actions
  addClosure: (airport: string, start: number, end: number) => boolean;
  removeClosure: (id: string) => void;
  updateClosure: (id: string, partial: Partial<Closure>) => void;
  setArrivalPolicy: (policy: ArrivalPolicy) => void;
  applyAction: (action: Action) => void;
  applyPlanActions: (actions: Action[]) => void;
  resetActions: () => void;
  resetAll: () => void;
  setSelectedFlightId: (id: string | null) => void;
  setActiveTab: (tab: 'gantt' | 'map' | 'flights' | 'connections' | 'crews') => void;
  setDrawerOpen: (open: boolean) => void;
  setDispatcherOpen: (open: boolean) => void;
  setAssumptionsOpen: (open: boolean) => void;

  // URL & Serialization
  serializeToQueryString: () => string;
  loadFromQueryString: (search: string) => void;
  getSelectedFlight: () => FlightResult | undefined;
}

let pendingRaf: number | null = null;

function computeSimulation(
  closures: Closure[],
  actions: Action[],
  arrivalPolicy: ArrivalPolicy
): SimulationResult {
  return simulate(networkData, {
    closures,
    actions,
    config: { arrivalPolicy },
  });
}

function updateBrowserUrl(closures: Closure[], policy: ArrivalPolicy) {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams();
  if (closures.length > 0) {
    const serializedClosures = closures
      .map((c) => `${c.airport}:${formatTime(c.start)}-${formatTime(c.end)}`)
      .join(',');
    params.set('closures', serializedClosures);
  }
  if (policy !== 'AIRBORNE_HOLD') {
    params.set('policy', policy);
  }
  const queryString = params.toString();
  const newUrl = queryString ? `${window.location.pathname}?${queryString}` : window.location.pathname;
  window.history.replaceState(null, '', newUrl);
}

export const useSimulatorStore = create<SimulatorState>((set, get) => ({
  network: networkData,
  closures: [],
  arrivalPolicy: 'AIRBORNE_HOLD',
  appliedActions: [],
  selectedFlightId: null,
  activeTab: 'gantt',
  drawerOpen: false,
  dispatcherOpen: false,
  assumptionsOpen: false,
  isRecomputing: false,

  baselineResult: initialBaseline,
  simulationResult: initialBaseline,

  addClosure: (airport: string, start: number, end: number) => {
    const { closures, arrivalPolicy, appliedActions } = get();
    if (closures.length >= 5) return false;
    if (start >= end) return false;

    // Check airport validity
    const airportExists = networkData.airports.some((a) => a.id === airport);
    if (!airportExists) return false;

    const newId = `c${Date.now().toString(36).slice(-4)}_${Math.floor(Math.random() * 100)}`;
    const newClosures = [...closures, { id: newId, airport, start, end }];

    const result = computeSimulation(newClosures, appliedActions, arrivalPolicy);
    set({
      closures: newClosures,
      simulationResult: result,
    });
    updateBrowserUrl(newClosures, arrivalPolicy);
    return true;
  },

  removeClosure: (id: string) => {
    const { closures, arrivalPolicy, appliedActions } = get();
    const newClosures = closures.filter((c) => c.id !== id);
    const result = computeSimulation(newClosures, appliedActions, arrivalPolicy);
    set({
      closures: newClosures,
      simulationResult: result,
    });
    updateBrowserUrl(newClosures, arrivalPolicy);
  },

  updateClosure: (id: string, partial: Partial<Closure>) => {
    const { closures, arrivalPolicy, appliedActions } = get();
    const newClosures = closures.map((c) => {
      if (c.id === id) {
        const updated = { ...c, ...partial };
        return updated.start < updated.end ? updated : c;
      }
      return c;
    });

    // Debounce recomputation via requestAnimationFrame for sub-16ms response while dragging
    if (pendingRaf !== null && typeof window !== 'undefined') {
      cancelAnimationFrame(pendingRaf);
    }

    set({ isRecomputing: true, closures: newClosures });

    if (typeof window !== 'undefined') {
      pendingRaf = requestAnimationFrame(() => {
        const result = computeSimulation(newClosures, appliedActions, arrivalPolicy);
        set({ simulationResult: result, isRecomputing: false });
        updateBrowserUrl(newClosures, arrivalPolicy);
      });
    } else {
      const result = computeSimulation(newClosures, appliedActions, arrivalPolicy);
      set({ simulationResult: result, isRecomputing: false });
    }
  },

  setArrivalPolicy: (policy: ArrivalPolicy) => {
    const { closures, appliedActions } = get();
    const result = computeSimulation(closures, appliedActions, policy);
    set({
      arrivalPolicy: policy,
      simulationResult: result,
    });
    updateBrowserUrl(closures, policy);
  },

  applyAction: (action: Action) => {
    const { closures, arrivalPolicy, appliedActions } = get();
    const newActions = [...appliedActions, action];
    const result = computeSimulation(closures, newActions, arrivalPolicy);
    set({
      appliedActions: newActions,
      simulationResult: result,
    });
  },

  applyPlanActions: (actions: Action[]) => {
    const { closures, arrivalPolicy } = get();
    const result = computeSimulation(closures, actions, arrivalPolicy);
    set({
      appliedActions: actions,
      simulationResult: result,
      dispatcherOpen: false,
    });
  },

  resetActions: () => {
    const { closures, arrivalPolicy } = get();
    const result = computeSimulation(closures, [], arrivalPolicy);
    set({
      appliedActions: [],
      simulationResult: result,
    });
  },

  resetAll: () => {
    set({
      closures: [],
      arrivalPolicy: 'AIRBORNE_HOLD',
      appliedActions: [],
      selectedFlightId: null,
      drawerOpen: false,
      simulationResult: initialBaseline,
    });
    updateBrowserUrl([], 'AIRBORNE_HOLD');
  },

  setSelectedFlightId: (id: string | null) => {
    set({
      selectedFlightId: id,
      drawerOpen: id !== null,
    });
  },

  setActiveTab: (tab) => set({ activeTab: tab }),
  setDrawerOpen: (open) => set({ drawerOpen: open }),
  setDispatcherOpen: (open) => set({ dispatcherOpen: open }),
  setAssumptionsOpen: (open) => set({ assumptionsOpen: open }),

  serializeToQueryString: () => {
    const { closures, arrivalPolicy } = get();
    const params = new URLSearchParams();
    if (closures.length > 0) {
      const serialized = closures
        .map((c) => `${c.airport}:${formatTime(c.start)}-${formatTime(c.end)}`)
        .join(',');
      params.set('closures', serialized);
    }
    if (arrivalPolicy !== 'AIRBORNE_HOLD') {
      params.set('policy', arrivalPolicy);
    }
    return params.toString();
  },

  loadFromQueryString: (search: string) => {
    if (!search) return;
    try {
      const cleanSearch = search.startsWith('?') ? search.slice(1) : search;
      const params = new URLSearchParams(cleanSearch);
      const closuresParam = params.get('closures');
      const policyParam = params.get('policy');

      const parsedClosures: Closure[] = [];
      if (closuresParam) {
        const parts = closuresParam.split(',');
        for (let i = 0; i < parts.length; i++) {
          const item = parts[i];
          const colonIdx = item.indexOf(':');
          if (colonIdx > 0) {
            const airport = item.slice(0, colonIdx).trim().toUpperCase();
            const timeRange = item.slice(colonIdx + 1).trim();
            const [startStr, endStr] = timeRange.split('-');
            if (startStr && endStr) {
              const start = parseTimeToMinutes(startStr);
              const end = parseTimeToMinutes(endStr);
              if (start < end && parsedClosures.length < 5) {
                parsedClosures.push({
                  id: `url_c${i + 1}`,
                  airport,
                  start,
                  end,
                });
              }
            }
          }
        }
      }

      const policy: ArrivalPolicy =
        policyParam === 'GROUND_HOLD' ? 'GROUND_HOLD' : 'AIRBORNE_HOLD';

      const result = computeSimulation(parsedClosures, [], policy);
      set({
        closures: parsedClosures,
        arrivalPolicy: policy,
        appliedActions: [],
        simulationResult: result,
      });
    } catch (err) {
      console.error('Failed to parse URL query params', err);
    }
  },

  getSelectedFlight: () => {
    const { selectedFlightId, simulationResult } = get();
    if (!selectedFlightId) return undefined;
    return simulationResult.flights.find((f) => f.flightId === selectedFlightId);
  },
}));
