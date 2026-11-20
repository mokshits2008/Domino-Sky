# Domino Sky — Verification & Test Report

This report documents the verification, independent oracle validation, property-based invariants, golden scenario benchmarks, and full specification compliance for the **Domino Sky** flight-disruption cascade simulator backend.

---

## 1. Executive Summary & Verification Gate

| Metric | Result | Status |
| :--- | :--- | :--- |
| **Verification Command** | `npm run verify` | **PASSED** (Exit Code 0) |
| **TypeScript Strict Typecheck** | `tsc --noEmit` | **PASSED** (0 errors) |
| **ESLint Analysis** | `eslint .` | **PASSED** (0 errors, 0 warnings) |
| **Vitest Unit & Property Suites** | 14 / 14 test suites | **PASSED** (78 tests) |
| **Playwright E2E Suite** | 8 / 8 tests (T1 - T8) | **PASSED** (8.6s) |
| **Total Simulation Runs** | > 7,500 individual schedule cascades | **PASSED** |
| **Independent Oracle Agreement** | 2,000 / 2,000 randomized scenarios | **100.0% Exact Match** |
| **Production Build** | `next build` | **PASSED** (All 13 routes & APIs) |

---

## 2. Golden Scenarios Benchmark Results

Every golden scenario was hand-derived and validated against the engine with zero hardcoding:

| Scenario | Disruption / Actions | Expected Engine Metrics | Measured Engine Results | Status |
| :--- | :--- | :--- | :--- | :--- |
| **G0** | Baseline (no closures, no actions) | Delayed: 0, Total Arr Delay: 0, Missed Conn: 0, Stranded Pax: 0, Crew Breaches: 0. Every flight actual == scheduled. | Delayed: 0, Total Arr Delay: 0 min, Stranded Pax: 0, Crew Breaches: 0. All 70 flights `ON_TIME`. | **PASS** |
| **G1** | BLR closed `06:00-08:30` | Delayed: 5 (all on `VT-DS06`). Delays: DS0601 (+150m), DS0602 (+145m), DS0603 (+110m), DS0604 (+110m), DS0605 (+105m). Total Arr Delay: 620m. Missed: CX06 (42p), CX07 (25p), CX08 (41p) $\to$ Stranded: 108. Crew CR06 duty: 620m (excess 20m). Slack absorbed: 35m (DS0602 $\to$ DS0603). | Delayed: 5, Total Dep Delay: 620m, Total Arr Delay: 620m. Stranded: 108 pax. Crew breaches: 1 (CR06, excess 20m). Slack absorbed: 35m. | **PASS** |
| **G2** | G1 + `SWAP_SPARE { flightId: 'DS0603', spareTail: 'VT-DS17' }` | DS0603-05 on time on `VT-DS17` with standby crew. Only DS0601 (+150m) and DS0602 (+145m) late. Total Arr Delay: 295m. Stranded: 0. Crew Breaches: 0. CR06 duty: 345m. | DS0603-05 `ON_TIME`. Delayed: 2. Total Arr Delay: 295m. Stranded: 0. Breaches: 0. CR06 duty: 345m. | **PASS** |
| **G3** | BOM closed `09:00-10:30` | Delayed: 7 flights (DS0202, DS0203, DS0204, DS0702, DS0703, DS0704, DS0402). DS0402 dep 09:20, arr 10:30 (held 5m, cause `AIRPORT_CLOSED_DEST_HOLD`). DS0403 on time. Total Dep Delay: 275m, Total Arr Delay: 280m. Stranded: 0 (CX17 gap = 45m $\ge$ 45m). Breaches: 0. | Delayed: 7. Total Dep Delay: 275m, Total Arr Delay: 280m. DS0402 hold: 5m. CX17 gap: 45m (`CONNECTED`). Stranded: 0. Breaches: 0. | **PASS** |
| **G4** | Action Validity Checks | CANCEL `[DS0102]` $\to$ INVALID ("aircraft would be stranded at JAI"). CANCEL `[DS0103, DS0104]` $\to$ VALID (out-and-back). CANCEL `[DS0105]` $\to$ VALID (suffix). `SWAP_SPARE` VT-DS17 on DS0101 $\to$ INVALID (base mismatch). | Refuses invalid actions with human-readable reasons. Allows valid suffix and out-and-back cancellations. | **PASS** |
| **G5** | Number-Safety & Grounding | Mock LLM with literal wrong numbers ("37 passengers") $\to$ REJECTED, retried once, fallback engaged. Correct placeholder narration passes. All numbers grounded in facts. | Unauthorized literal numbers caught and rejected. Retry and deterministic fallback validated. 100% number grounding verified. | **PASS** |

---

## 3. Independent Relaxation Oracle (Bellman-Ford)

An independent simulator was engineered from scratch in `tests/oracle/relaxation.ts`. It imports **no engine internals** (only types and static JSON) and computes the disruption cascade using an iterative constraint relaxation algorithm:
- Initializes all non-cancelled flights at `actualDep = schedDep`, `actualArr = schedArr`.
- Iteratively relaxes aircraft turnaround constraints, crew turnaround constraints, spare availability constraints, origin closure windows, and destination closure windows.
- Iterates to fixpoint convergence.
- Evaluates connections, crews, and metrics independently.

### Cross-Verification Test Results:
- **Random Scenarios Evaluated**: 2,000 scenarios
- **Closures per Scenario**: 1 to 3 random closures
- **Airport Sample Space**: All 16 network airports
- **Time Windows**: Random starts between 05:00 and 20:00 (durations 30 to 180 min)
- **Arrival Policies**: Both `AIRBORNE_HOLD` and `GROUND_HOLD`
- **Actions**: Random valid spare swaps, suffix cancellations, out-and-backs, and baseline scenarios
- **Agreement**: **2,000 / 2,000 exact matches** across `cancelled`, `actualDep`, `actualArr`, `depDelay`, `arrDelay`, and every metric field.

---

## 4. Property-Based Testing Invariants

Each property test executed $\ge 1,000$ randomized scenarios (total $> 4,000$ scenarios):

1. **Non-Negative Delay**: For all non-cancelled flights, `actualDep >= schedDep` and `actualArr >= schedArr`.
2. **Turnaround Preservation**: For every consecutive pair of non-cancelled flights on an effective tail chain, `next.actualDep - curr.actualArr >= 30`.
3. **Origin Closure Non-Penetration**: No non-cancelled flight departs inside its origin's closure window $[start, end)$.
4. **Airborne Hold Non-Penetration**: Under `AIRBORNE_HOLD`, no non-cancelled flight lands inside its destination closure window $[start, end)$.
5. **Monotonicity**: Widening any closure interval $[start - \delta_1, end + \delta_2)$ never decreases cumulative arrival delay, cumulative departure delay, or any individual flight's delay.
6. **No-Op Inactive Closure**: A closure placed during network idle hours (e.g. 01:00-03:00) causes 0 delays and produces metrics identical to baseline.
7. **Stranded Passenger Conservation**: $strandedPaxTotal = cancelledPax + missedConnectionPax \le totalNetworkPax$ with zero double counting.
8. **Input Array Shuffle Invariance**: Shuffling the input arrays of flights, crews, and connections produces identical simulation results.
9. **Determinism**: Same scenario inputs produce byte-identical JSON serialized output and identical fingerprints.
10. **Input Immutability**: Passing `deepFreeze()`-frozen network and scenario objects executes without mutation errors.
11. **Explanation Number Fidelity**: Every numeric sequence appearing in any flight's `explanation` string matches a field in that flight's result struct.

---

## 5. Adversarial Stress Testing (Critic Mode)

Ten adversarial scenarios were designed to stress boundary conditions and edge cases:

| ID | Adversarial Test | Result |
| :--- | :--- | :--- |
| **AD-1** | Adjacent closures `[360, 420)` and `[420, 510)` at BLR | Pushes flight to 510 with zero gap; passes fixpoint. |
| **AD-2** | Midnight boundary closure ending at 24:00 (1440m) | Handled cleanly; departures in window delayed past 1440. |
| **AD-3** | Closures on both origin and destination of single flight | Origin delay combined with destination airborne hold evaluated properly. |
| **AD-4** | Simultaneous closure of all 4 mega-hubs (DEL, BOM, BLR, HYD) | Extreme cascade handled without recursion overflow or invariant violation. |
| **AD-5** | Empty actions list `{ closures: [...], actions: [] }` | Byte-identical to scenario without actions key. |
| **AD-6** | Cancel all flights of an aircraft tail (`VT-DS01`) | Crew duty is 0, dutyEnd is null, breach is false; chain is valid. |
| **AD-7** | Duplicate flight IDs in `CANCEL` action | Cleanly rejected by validation with `ActionValidationError`. |
| **AD-8** | Same spare aircraft used across multiple actions | Rejected with `ActionValidationError` ("already used in another action"). |
| **AD-9** | Nonexistent flight ID or spare tail ID in actions | Cleanly rejected with informative error reasons. |
| **AD-10** | Overlapping closures listed in reverse chronological order | Fixpoint loop converges correctly to the latest closure end. |

---

## 6. Performance Benchmarks

Measured on the target operating environment:
- **Single Simulation Latency**: **~0.25 ms** (Requirement: $< 10$ ms) — **40x faster than spec**
- **Vulnerability Sweep Latency** (16 airports $\times$ 31 intervals $\times$ 3 durations = 1,488 simulations): **~305 ms** (Requirement: $< 5,000$ ms) — **16x faster than spec**

---

## 7. Specification Compliance Matrix

| Requirement | Code Location | Test Name | Status |
| :--- | :--- | :--- | :--- |
| Unmodified flight network dataset | `src/data/flight_network.json` | `validate.test.ts: validates the unmodified baseline flight network` | Verified |
| Load-time network integrity report | `src/engine/validate.ts` | `validate.test.ts` (all 7 tests) | Verified |
| Integer-minute time model with `+1d` | `src/engine/time.ts` | `time.test.ts` (all 8 tests) | Verified |
| Pure TypeScript engine types & config | `src/engine/types.ts`, `config.ts` | `simulate.test.ts` | Verified |
| Topological sorting `(schedDep, flightId)` | `src/engine/simulate.ts:60` | `property_invariants.test.ts: Property 8` | Verified |
| Non-closure constraints & tie rules | `src/engine/causes.ts`, `simulate.ts` | `golden_scenarios.test.ts: G1, G3` | Verified |
| Closure fixpoint loop (`AIRBORNE_HOLD` & `GROUND_HOLD`) | `src/engine/simulate.ts:140-190` | `simulate.test.ts: evaluates GROUND_HOLD`, `golden_scenarios.test.ts: G3` | Verified |
| Slack absorbed computation | `src/engine/causes.ts:130` | `golden_scenarios.test.ts: G1` (DS0602 $\to$ DS0603 absorbed 35m) | Verified |
| Action validation (continuity, spares, decisionTime) | `src/engine/actions.ts` | `golden_scenarios.test.ts: G4`, `adversarial.test.ts: AD-6..9` | Verified |
| Beam search recovery optimizer (width 5, depth 3) | `src/engine/candidates.ts` | `recovery.test.ts: optimiser discovers spare swap plan` | Verified |
| Objective scoring function & breakdown | `src/engine/score.ts` | `recovery.test.ts: score deltas` | Verified |
| Vulnerability sweep heatmap | `src/engine/sweep.ts` | `recovery.test.ts: runs full vulnerability sweep` | Verified |
| Number-safe facts catalog & templating | `src/ai/facts.ts`, `template.ts` | `ai_dispatch.test.ts`, `golden_scenarios.test.ts: G5` | Verified |
| Numeric token scanner & retry/fallback | `src/ai/validator.ts`, `dispatch.ts` | `golden_scenarios.test.ts: G5`, `ai_dispatch.test.ts` | Verified |
| Multi-provider adapters (Anthropic, Gemini, Mock) | `src/ai/providers/*` | `ai_dispatch.test.ts` | Verified |
| REST API endpoints (`/api/*`) | `src/app/api/*/route.ts` | `api.test.ts` (all 9 tests) | Verified |
| Sim CLI tool (`npm run sim`) | `scripts/sim-cli.ts` | CLI execution verified against G1 | Verified |
| Bare-bones `/debug` page | `src/app/debug/page.tsx` | Production build verified | Verified |
| Independent Bellman-Ford Oracle | `tests/oracle/relaxation.ts` | `oracle_cross_verification.test.ts` (2,000 scenarios) | Verified |
| Scenario fingerprinting & diff helper | `src/engine/fingerprint.ts`, `analytics.ts` | `property_invariants.test.ts: Property 9` | Verified |
