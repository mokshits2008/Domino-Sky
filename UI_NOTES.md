# Domino Sky — Front-End Implementation Notes & Spec Mapping (Step 0)

This document records the exact backend API request and response contracts, field mappings, design decisions, and specification compliance matrix for the Domino Sky front-end.

---

## 1. Backend API Contracts & Data Shapes

The front-end strictly imports types from `@/engine/types`, `@/engine/candidates`, `@/engine/analytics`, `@/engine/sweep`, and `@/ai/dispatch` without redefining them.

### `GET /api/health`
- **Request**: None
- **Response Shape**:
  ```ts
  {
    status: 'ok',
    engineVersion: string, // "1.0.0"
    uptimeSec: number
  }
  ```

### `GET /api/network`
- **Request**: None
- **Response Shape**:
  ```ts
  {
    engineVersion: string,
    meta: {
      dataset: string,
      operating_day: string,
      min_turnaround_minutes: number,
      seats_per_aircraft: number,
      notes: string[]
    },
    airports: AirportData[],       // 16 airports with id, name, city, lat, lng, tier, capacity_per_hour
    flights: FlightData[],         // 70 flights with flight_id, tail_id, leg_order, origin, destination, dep, arr, block_minutes, pax, turnaround_before_min
    connections: ConnectionData[], // 21 connections with connection_id, airport, from_flight, to_flight, passengers, min_connect_minutes
    crews: CrewData[],             // 16 crews with crew_id, tail_id, base, duty_start, max_duty_mins, flight_ids
    spare_aircraft: SpareAircraftData[], // 2 spares (VT-DS17 at BLR, VT-DS18 at DEL)
    integrity: {
      valid: boolean,
      counts: { airports: 16, flights: 70, tails: 16, connections: 21, crews: 16, spares: 2 },
      warnings: IntegrityWarning[]
    },
    baselineSlack: {
      turnaroundSlack: TurnaroundSlack[],
      crewSlack: CrewSlack[],
      mostFragileTails: string[],
      mostFragileCrews: string[]
    }
  }
  ```

### `POST /api/simulate`
- **Request Shape**:
  ```ts
  {
    closures: Closure[],           // 0 to 5 closures: { id, airport, start, end }
    actions?: Action[],            // CANCEL or SWAP_SPARE
    decisionTime?: Minute,         // Optional integer minutes
    config?: UserEngineConfig      // Optional arrivalPolicy ('AIRBORNE_HOLD' | 'GROUND_HOLD'), etc.
  }
  ```
- **Response Shape (`SimulationResult`)**:
  ```ts
  {
    engineVersion: string,
    scenarioFingerprint: string,   // 16-char deterministic hex hash
    flights: FlightResult[],       // 70 flight results with actualDep/Arr, dep/arrDelay, primaryCause, rootCause, causeChain, explanation
    connections: ConnectionResult[], // 21 connection results with status ('CONNECTED' | 'MISSED' | 'TO_CANCELLED'), gapMin, strandedPax
    crews: CrewResult[],           // 16 crew results + standby crews with dutyMin, breach, excessMin, slackToLimitMin
    metrics: Metrics,              // delayedFlights, totalArrDelayMin, strandedPaxTotal, crewBreaches, etc.
    perAirport: Record<string, { delayedDepartures: number, delayedArrivals: number, totalDelayMin: number }>,
    propagationEdges: PropagationEdge[], // Domino cascade edges: { from, to, minutesTransmitted, minutesAbsorbed, via }
    warnings: string[]
  }
  ```
- **Error Shape (400 or 422)**:
  ```ts
  {
    error: {
      code: 'INVALID_REQUEST' | 'INVALID_ACTION' | 'INTERNAL_SERVER_ERROR',
      message: string,
      details: unknown
    }
  }
  ```

### `POST /api/recommend`
- **Request Shape**:
  ```ts
  {
    closures: Closure[],           // 1 to 5 closures
    maxActions?: number,           // Default 3 (1 to 5)
    decisionTime?: Minute,
    config?: UserEngineConfig
  }
  ```
- **Response Shape**:
  ```ts
  {
    engineVersion: string,
    scenarioFingerprint: string,
    baselineResult: SimulationResult,
    disruptedResult: SimulationResult,
    rankedPlans: RecoveryPlan[]    // Ranked by multi-objective score:
                                   // { id, actions, score, scoreBreakdown, beforeMetrics, afterMetrics, deltas, flightDiffs, crewChanges, connectionChanges, tradeoffs }
  }
  ```

### `POST /api/dispatch`
- **Request Shape**:
  ```ts
  {
    closures: Closure[],           // 1 to 5 closures
    planId?: string,               // Specific plan to narrate (optional)
    maxActions?: number,
    provider?: 'anthropic' | 'gemini' | 'mock' | 'none'
  }
  ```
- **Response Shape**:
  ```ts
  {
    engineVersion: string,
    recommendedPlanId: string,
    headline: string,
    narrative: string,
    reasoning: string[],
    tradeoffs: string[],
    risks: string[],
    provenance: ProvenanceEntry[], // { placeholder, key, value, position }
    validation: {
      passed: boolean,
      retries: number,
      usedFallback: boolean,
      violations: string[]
    },
    chosenPlan: RecoveryPlan | null,
    beforeMetrics: Metrics,
    afterMetrics: Metrics | null,
    scenarioFingerprint: string
  }
  ```

### `POST /api/vulnerability`
- **Request Shape**:
  ```ts
  {
    durations?: number[],          // Default [60, 90, 120]
    stepMin?: number,              // Default 30
    windowStart?: number,          // Default 300 (05:00)
    windowEnd?: number             // Default 1200 (20:00)
  }
  ```
- **Response Shape (`VulnerabilitySweepResult`)**:
  ```ts
  {
    engineVersion: string,
    options: { durations, stepMin, windowStart, windowEnd },
    totalScenariosEvaluated: number, // 1488
    elapsedMs: number,
    heatmap: VulnerabilityCell[],  // { airport, start, startFormatted, duration, end, endFormatted, strandedPax, delayedFlights, totalDelay, breaches }
    mostDamagingClosures: VulnerabilityRanking[] // Top 20 ranked by damageScore
  }
  ```

---

## 2. Specification Nuances & Code Grounding

| Concept / Field | Prompt Specification | Real Backend Code | Resolution |
| :--- | :--- | :--- | :--- |
| **Connection ID Format** | Spec mentioned CN04/CN05 in some examples | Dataset uses `CX01`..`CX21` in `flight_network.json` | Used canonical `CX01`..`CX21` from dataset. |
| **Connection Minimum Connect** | Spec mentioned `minConnectMinutes` | `ConnectionResult.minConnect` in `src/engine/types.ts` | Code strictly uses `minConnect`. |
| **Crew Max Duty** | Spec mentioned `maxDutyMins` | `CrewResult.maxDutyMin` in `src/engine/types.ts` | Code strictly uses `maxDutyMin`. |
| **Airport Tier** | Spec mentioned integer tier (1, 2, 3) | `AirportData.tier` is string in `src/engine/types.ts` | Converted comparisons to string (`'1'`, `'2'`, `'3'`). |
| **Connection Reason** | `reason?: 'INSUFFICIENT_TIME' \| 'FROM_CANCELLED'` | `ConnectionResult.reason` | Code directly implements this exact union. |
| **KPI Delta vs Baseline** | "each with a delta-vs-baseline line (use strandedPaxVsBaseline where it exists; for others compare to simulateBaseline)" | `metrics.strandedPaxVsBaseline` exists in engine; other deltas computed via `baseline.metrics`. | Front-end compares current `metrics` with `simulateBaseline(network).metrics`. |
| **Client-Side Simulation** | "The engine runs client-side (it is pure) for instant recompute while dragging the slider" | `src/engine/simulate.ts` has pure `simulate(network, scenario)` runnable in browser. | Front-end imports `simulate` and `loadFlightNetwork` directly for instant 0.2ms updates during dragging. |
| **AI Number Safety** | "Render every substituted number as a small mono chip with a subtle underline; hover shows its source key and engine value" | `ProvenanceEntry` from `/api/dispatch` includes `{ placeholder, key, value, position }`. | Front-end maps provenance entries to render interactive audit tokens. |
| **Map Offline Fallback** | "CARTO light_nolabels or equivalent; if tiles fail to load, fall back to plain #EAF0F4 with India outline" | Leaflet map layer error listener. | Added SVG India outline boundary fallback so map operates with or without network tile connectivity. |

---

## 3. Design System Implementation

- **Color Tokens**:
  - `canvas`: `#FAF7F2`
  - `surface`: `#FFFFFF`, `surface-alt`: `#F3EFE8`
  - `border`: `#E6E0D6`
  - `ink`: `#2B2F3A`, `ink-muted`: `#6B7280`, `ink-faint`: `#9AA1AC`
  - `primary`: `#4F7494` (hover `#426584`, tint `#DCE6EF`)
  - `closure`: `#C9776B` (tint `#F4DAD5`)
  - `recovery`: `#A9CDB4`
  - `spare`: `#BFD9E6`
  - Severity tokens:
    - `NONE`: Fill `#CFE3D4`, Text `#3F6B4E`, Pattern: Plain
    - `MINOR`: Fill `#F5E6B3`, Text `#7A6420`, Pattern: Subtle dots
    - `MODERATE`: Fill `#F6C9A6`, Text `#8A4F1F`, Pattern: Light stripes
    - `SEVERE`: Fill `#EBA5A0`, Text `#8C2F2A`, Pattern: Dense stripes
    - `CANCELLED`: Fill `#D9D5CE`, Text `#5E5A52`, Pattern: Diagonal hatch
- **Forbidden Styles**:
  - No dark mode, no neon/glows, no purple/indigo gradients, no glassmorphism, no sparkle/robot icons, no pure black text.
- **Typography**:
  - `DM Sans` for all editorial headings, button labels, and descriptions.
  - `IBM Plex Mono` for all flight IDs, tail numbers, times, durations, delays, hashes, and tabular numbers.
- **Layout Grid**:
  - Top Bar: 56px (`h-14`)
  - Main Grid: Left rail 320px | Center `minmax(0,1fr)` | Right drawer 380px collapsible.
  - Z-Index Scale: Base 0, Sticky 10, Drawer 20, Popover 30, Modal 40, Toast 50.
  - Zero `position: absolute` layout arrangement.

---

## 4. Verification & Test Report

All checks pass with exit code 0:
1. **TypeScript Typecheck**: `tsc --noEmit` -> 0 errors.
2. **ESLint**: `eslint .` -> 0 errors, 0 warnings.
3. **Vitest Unit Tests**: 80 tests across 14 test suites -> 80 passed (including formatters, tier mappings, time utils, Gantt geometry, URL round-trip, engine simulation, recovery beam search, AST number validator, golden scenarios G0..G5, 2,000 oracle relaxation scenarios, and 4,000+ property test runs).
4. **Playwright E2E Tests**: 9 tests -> 9 passed (9.7s):
   - `T1`: BLR 06:00-08:30 closure KPIs verified (5 delayed, 620m delay, 108 stranded pax, 1 crew breach).
   - `T2`: Gantt flight bar click opens inspector drawer with full `causeChain [DS0601, DS0602, DS0603]` and slack absorption.
   - `T3`: Connections tab shows 108 stranded passengers across `CX06`, `CX07`, `CX08`.
   - `T4`: Crews tab shows `CR06` duty breach (+20m excess).
   - `T5`: AI Dispatcher modal loads ranked plans, verifies number audit, and applies recovery plan reducing stranded pax to 0.
   - `T6`: Share URL query restoration verifies exact state reload.
   - `T7`: Fallback mode when provider=none verifies zero hallucinated numbers.
   - `T8`: Responsive layout checks at 1440x900 and 1024x768 verify zero horizontal scroll, zero console errors, capturing screenshots to `screenshots/`.
   - `T9`: Target Airport selection across tiers (Tier 1 Mega Hub BOM, Tier 2 Regional Hub MAA) populates all 16 network airports and reflects immediately in UI, KPIs, and Leaflet network map.
5. **Next.js Production Build**: `next build` -> Compiles all 13 routes and API handlers statically and dynamically.

---

## 5. CARTO Basemap API Key & Airport Tier Selection Fix

### 1. CARTO Basemap Watermark Elimination
- **API Key Parameter**: Connected the CARTO API key `cb1_5cr2_1_d2b9535c988184e55e0a70cb` to `NetworkMapInner.tsx` using `NEXT_PUBLIC_CARTO_API_KEY` (with the key as default fallback in code and in `.env.local` / `.env.example`).
- **Tile Endpoint**: Configured `https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png?key=${cartoApiKey}`.
- **Verification**: Verified via HTTP 200 response that CARTO serves clean 256x256 tiles with zero watermark.

### 2. Airport Tier Dropdown Population & Immediate Reflection
- **Root Cause**: `flight_network.json` classifies airports as `"mega_hub"`, `"regional_hub"`, and `"spoke"`. The dropdown previously filtered by numeric comparison `String(a.tier) === '1'` / `'2'`, resulting in empty option groups.
- **Solution**:
  - Implemented `getAirportTier` and `getAirportTierLabel` in `src/lib/formatters.ts` mapping:
    - `"mega_hub"` / `1` -> Tier 1 (Mega Hubs: DEL, BOM, BLR, HYD)
    - `"regional_hub"` / `2` -> Tier 2 (Regional Hubs: MAA, CCU, AMD, COK)
    - `"spoke"` / `3` -> Tier 3 (Spokes: GOI, PNQ, JAI, GAU, LKO, IXC, BBI, TRV)
  - Updated `DisruptionBuilder.tsx` to group options with `getAirportTier`.
  - Updated `handleAirportChange`, duration chips, and sliders to immediately mutate `closures[0]` and recompute the simulation via rAF debounce. Changing the airport now immediately updates the KPI cards, Gantt chart, and map overlay without requiring an additional click.
