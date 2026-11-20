# Domino Sky — Flight Disruption Cascade Simulator

Domino Sky is an aviation operations analysis platform and disruption cascade simulation engine for a single-day Indian domestic network (16 airports, 70 flights, 16 aircraft tails, 21 passenger connections, 16 flight crews, and 2 standby spare aircraft).

When an airport closes for an arbitrary time window, aircraft are delayed or held, late aircraft make downstream flights late, connecting passenger itineraries break, and crew duty limits are exceeded. Domino Sky provides deterministic cascade modeling, an automated beam-search recovery optimizer, and a number-safe AI dispatch narrator.

---

## Key Capabilities

1. **Deterministic Cascade Simulation**: Integer-minute simulation with no guessed numbers. Handles origin closure holds, destination airborne holds (`AIRBORNE_HOLD`), and ground holds (`GROUND_HOLD`).
2. **Geographically Continuous Action Engine**: Models `CANCEL` (suffix and out-and-back contiguous cancellations) and `SWAP_SPARE` (reassignment of remaining chain to a standby aircraft with standby crew).
3. **Multi-Objective Recovery Optimizer**: Deterministic beam search (width 5, depth 3) minimizing passenger strandings, arrival delays, crew duty breaches, cancellations, and spare activations.
4. **Number-Safe AI Dispatcher**: Architectural defense against LLM hallucination. The LLM only outputs `{{placeholders}}`; a validator scanner rejects any unauthorized digits, triggers a single self-correction retry, and automatically falls back to deterministic narration if needed.
5. **Network Fragility Heatmap**: Rapid vulnerability sweep evaluating disruption impact across 16 airports, 3 durations, and 31 time slices (1,488 simulations in ~300 ms).
6. **Cross-Verified Reliability**: Validated against an independent Bellman-Ford constraint relaxation oracle across 2,000 randomized scenarios with 100.0% exact agreement.

---

## Getting Started

### Prerequisites
- Node.js $\ge 18$ (tested on v26)
- npm $\ge 9$

### Installation
```bash
git clone https://github.com/mokshits2008/Domino-Sky.git
cd Domino-Sky
npm install
```

### Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

| Variable | Description | Default |
| :--- | :--- | :--- |
| `LLM_PROVIDER` | AI Dispatcher provider: `anthropic`, `gemini`, `mock`, or `none` | `none` |
| `ANTHROPIC_API_KEY` | Server-side API key for Anthropic Claude models | (optional) |
| `GEMINI_API_KEY` | Server-side API key for Google Gemini models | (optional) |

---

## Verification & Testing

Run the full verification suite (Typecheck + ESLint + Vitest + Production Build):
```bash
npm run verify
```
`npm run verify` sequentially executes:
1. `npm run typecheck` — TypeScript strict typechecking (0 errors)
2. `npm run lint` — ESLint rules & code styling (0 warnings)
3. `npm run test` — Vitest test suite (78 tests including oracle and property invariants)
4. `npx playwright test` — Playwright browser E2E suite (8 tests T1 to T8)
5. `npm run build` — Next.js optimized production build

Run test suites individually:
```bash
# All unit, golden, oracle, property, and adversarial tests
npm run test

# Playwright E2E tests (Chromium / Chrome)
npm run test:e2e

# Start development server
npm run dev

# Start production server
npm run start
```

---

## CLI Simulation Tool

You can run arbitrary simulations from the command line:

```bash
# Simulate Golden Scenario G1 (BLR closed 06:00 to 08:30)
npm run sim -- --closure BLR,06:00,08:30

# Simulate with spare swap recovery (Golden Scenario G2)
npm run sim -- --closure BLR,06:00,08:30 --swapSpare DS0603,VT-DS17

# Simulate under GROUND_HOLD arrival policy
npm run sim -- --closure BOM,09:00,10:30 --policy GROUND_HOLD
```

---

## Bare-Bones Debug Console

Start the development server:
```bash
npm run dev
```
Navigate to [http://localhost:3000/debug](http://localhost:3000/debug) in your browser. The `/debug` console provides a bare-bones form with pre-loaded presets (G1, G2, Recommend, Dispatch, Sweep) to test endpoints and inspect JSON responses.

---

## REST API Reference

All requests accept JSON and return JSON. Error responses follow a uniform shape:
```json
{
  "error": {
    "code": "INVALID_REQUEST",
    "message": "Human readable explanation",
    "details": {}
  }
}
```

### 1. `GET /api/health`
Health check and engine status.

**curl:**
```bash
curl -X GET http://localhost:3000/api/health
```

**Response (200 OK):**
```json
{
  "status": "ok",
  "engineVersion": "1.0.0",
  "uptimeSec": 120
}
```

---

### 2. `GET /api/network`
Returns complete network static dataset, load-time integrity report, and baseline turnaround / crew slack fragility reports.

**curl:**
```bash
curl -X GET http://localhost:3000/api/network
```

**Response (200 OK):**
```json
{
  "engineVersion": "1.0.0",
  "meta": {
    "dataset": "Domino Sky flight network",
    "min_turnaround_minutes": 30
  },
  "airports": [ ... ],
  "flights": [ ... ],
  "connections": [ ... ],
  "crews": [ ... ],
  "spare_aircraft": [ ... ],
  "integrity": {
    "valid": true,
    "counts": { "airports": 16, "flights": 70, "tails": 16, "connections": 21, "crews": 16, "spares": 2 },
    "warnings": []
  },
  "baselineSlack": {
    "turnaroundSlack": [ ... ],
    "crewSlack": [ ... ],
    "mostFragileTails": [ ... ],
    "mostFragileCrews": [ ... ]
  }
}
```

---

### 3. `POST /api/simulate`
Simulates a disruption scenario with 0 to 5 closures, optional actions, and optional config overrides.

**curl:**
```bash
curl -X POST http://localhost:3000/api/simulate \
  -H "Content-Type: application/json" \
  -d '{
    "closures": [
      { "id": "C_BLR", "airport": "BLR", "start": 360, "end": 510 }
    ],
    "config": {
      "arrivalPolicy": "AIRBORNE_HOLD"
    }
  }'
```

**Response (200 OK):**
```json
{
  "engineVersion": "1.0.0",
  "scenarioFingerprint": "9d1920e3e8b5e2dd",
  "flights": [
    {
      "flightId": "DS0601",
      "tailId": "VT-DS06",
      "originalTailId": "VT-DS06",
      "crewId": "CR06",
      "origin": "BLR",
      "destination": "COK",
      "schedDep": 360,
      "schedArr": 420,
      "actualDep": 510,
      "actualArr": 570,
      "depDelay": 150,
      "arrDelay": 150,
      "arrivalHoldMin": 0,
      "cancelled": false,
      "status": "DELAYED",
      "severity": "SEVERE",
      "primaryCause": {
        "type": "AIRPORT_CLOSED_ORIGIN",
        "closureId": "C_BLR",
        "airport": "BLR",
        "minutes": 150
      },
      "rootCause": { "closureId": "C_BLR", "airport": "BLR", "flightId": "DS0601" },
      "causeChain": ["DS0601"],
      "slackAbsorbedMin": 0,
      "explanation": "Flight DS0601 was delayed at origin BLR by 150 minutes due to airport closure, departing at 08:30 and arriving at 09:30."
    }
  ],
  "connections": [
    {
      "connectionId": "CX06",
      "airport": "MAA",
      "fromFlight": "DS0603",
      "toFlight": "DS1304",
      "passengers": 42,
      "minConnect": 40,
      "gapMin": -45,
      "status": "MISSED",
      "reason": "INSUFFICIENT_TIME",
      "strandedPax": 42
    }
  ],
  "crews": [
    {
      "crewId": "CR06",
      "tailId": "VT-DS06",
      "dutyStart": 315,
      "dutyEnd": 935,
      "dutyMin": 620,
      "maxDutyMin": 600,
      "breach": true,
      "excessMin": 20,
      "slackToLimitMin": 0,
      "standby": false
    }
  ],
  "metrics": {
    "totalFlights": 70,
    "delayedFlights": 5,
    "cancelledFlights": 0,
    "totalDepDelayMin": 620,
    "totalArrDelayMin": 620,
    "maxArrDelayMin": 150,
    "paxDelayMinutes": 98970,
    "cancelledPax": 0,
    "missedConnectionPax": 108,
    "strandedPaxTotal": 108,
    "strandedPaxVsBaseline": 108,
    "missedConnections": 3,
    "crewBreaches": 1,
    "crewBreachExcessMin": 20,
    "airportsAffected": ["BLR", "COK", "MAA", "TRV"],
    "tailsAffected": ["VT-DS06"],
    "propagationDepthMax": 4,
    "spareAircraftUsed": 0
  },
  "perAirport": { ... },
  "propagationEdges": [ ... ],
  "warnings": []
}
```

---

### 4. `POST /api/recommend`
Evaluates multi-action candidate permutations via beam search (width 5, depth up to `maxActions`).

**curl:**
```bash
curl -X POST http://localhost:3000/api/recommend \
  -H "Content-Type: application/json" \
  -d '{
    "closures": [
      { "id": "C_BLR", "airport": "BLR", "start": 360, "end": 510 }
    ],
    "maxActions": 2
  }'
```

**Response (200 OK):**
```json
{
  "engineVersion": "1.0.0",
  "scenarioFingerprint": "9d1920e3e8b5e2dd",
  "baselineResult": { ... },
  "disruptedResult": { ... },
  "rankedPlans": [
    {
      "id": "plan-1",
      "actions": [
        { "type": "SWAP_SPARE", "flightId": "DS0603", "spareTail": "VT-DS17" }
      ],
      "score": 167.5,
      "scoreBreakdown": {
        "strandedPaxTotal": 0,
        "totalArrDelayMin": 147.5,
        "crewBreaches": 0,
        "crewBreachExcessMin": 0,
        "cancelledFlights": 0,
        "sparesUsed": 20,
        "total": 167.5
      },
      "beforeMetrics": { "totalArrDelayMin": 620, "strandedPaxTotal": 108, "crewBreaches": 1 },
      "afterMetrics": { "totalArrDelayMin": 295, "strandedPaxTotal": 0, "crewBreaches": 0 },
      "deltas": {
        "totalArrDelayMin": -325,
        "strandedPaxTotal": -108,
        "crewBreaches": -1,
        "spareAircraftUsed": 1
      },
      "flightDiffs": [ ... ],
      "crewChanges": [ ... ],
      "connectionChanges": [ ... ],
      "tradeoffs": [
        "Reduced arrival delay by 325 minutes",
        "Eliminated 1 crew breach",
        "Prevented 108 stranded passengers",
        "Deployed 1 spare aircraft"
      ]
    }
  ]
}
```

---

### 5. `POST /api/dispatch`
AI Dispatcher narrative with number audit provenance.

**curl:**
```bash
curl -X POST http://localhost:3000/api/dispatch \
  -H "Content-Type: application/json" \
  -d '{
    "closures": [
      { "id": "C_BLR", "airport": "BLR", "start": 360, "end": 510 }
    ],
    "provider": "none"
  }'
```

**Response (200 OK):**
```json
{
  "engineVersion": "1.0.0",
  "recommendedPlanId": "plan-1",
  "headline": "Implement plan-1 to reduce network arrival delay by 325 minutes and prevent 108 stranded passengers.",
  "narrative": "...",
  "reasoning": [
    "Eliminates 1 crew duty breaches across affected tails.",
    "Recovers 325 minutes of cumulative arrival delay.",
    "Protects 108 connecting passenger itineraries."
  ],
  "tradeoffs": [ ... ],
  "risks": [ ... ],
  "provenance": [
    { "placeholder": "{{plan.plan-1.id}}", "key": "plan.plan-1.id", "value": "plan-1", "position": 10 },
    { "placeholder": "{{plan.plan-1.delta.totalArrDelayMin_abs}}", "key": "plan.plan-1.delta.totalArrDelayMin_abs", "value": 325, "position": 58 }
  ],
  "validation": {
    "passed": true,
    "retries": 0,
    "usedFallback": true,
    "violations": []
  },
  "chosenPlan": { ... },
  "beforeMetrics": { ... },
  "afterMetrics": { ... },
  "scenarioFingerprint": "9d1920e3e8b5e2dd"
}
```

---

### 6. `POST /api/vulnerability`
Computes the network fragility heatmap.

**curl:**
```bash
curl -X POST http://localhost:3000/api/vulnerability \
  -H "Content-Type: application/json" \
  -d '{
    "durations": [60, 90, 120],
    "stepMin": 30,
    "windowStart": 300,
    "windowEnd": 1200
  }'
```

**Response (200 OK):**
```json
{
  "engineVersion": "1.0.0",
  "options": {
    "durations": [60, 90, 120],
    "stepMin": 30,
    "windowStart": 300,
    "windowEnd": 1200
  },
  "totalScenariosEvaluated": 1488,
  "elapsedMs": 312,
  "heatmap": [ ... ],
  "mostDamagingClosures": [
    {
      "rank": 1,
      "airport": "BLR",
      "start": 360,
      "startFormatted": "06:00",
      "duration": 120,
      "endFormatted": "08:00",
      "damageScore": 875.5,
      "strandedPax": 108,
      "delayedFlights": 5,
      "totalDelay": 520,
      "breaches": 1
    }
  ]
}
```

---

## Assumptions & Design Choices

All operational decisions where the spec permitted options are formally indexed in `ASSUMPTIONS.md`:
- **[A1] Closure Interval**: Closed on $[start, end)$ — $start$ inclusive, $end$ exclusive.
- **[A2] Arrival Policy**: Default `AIRBORNE_HOLD` (airplane holds in air over destination); alternative `GROUND_HOLD` (origin departure delayed).
- **[A3] Cancellation Validity**: Continuous remaining chains; forbids stranding aircraft at outstations.
- **[A4] Standby Crew**: Standby crew activated for `SWAP_SPARE` at $\text{schedDep} - 60\text{m}$.
- **[A5] Breaches Flagged**: Crew duty breaches are recorded, not auto-reassigned.
- **[A6] Tie Rules**: Knock-on overrides closure boundary; AIRCRAFT > CREW > SPARE > SCHEDULE.
- **[A7] Scoring Weights**: Multi-objective breakdown: $1.0\times\text{pax} + 0.5\times\text{delay} + 250\times\text{breach} + 0.1\times\text{excess} + 50\times\text{cancel} + 20\times\text{spare}$.
- **[A8] Decision Time**: Actions cannot modify flights with scheduled departure $< \text{decisionTime}$.
- **[A9] Propagation Depth**: Measured as cause chain depth $(\text{length} - 1)$.
