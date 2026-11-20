# Domino Sky — Operational Assumptions

This document formally records all operational assumptions made where the specification allowed options or required specific modeling semantics. Each assumption is keyed by an ID (A1, A2...) and reflected directly in the engine implementation and user interface.

## [A1] Closure Interval Semantics
- **Rule**: An airport closure defined by `[start, end)` is closed starting at minute `start` (inclusive) and reopening at minute `end` (exclusive).
- **Behavior**:
  - A departure scheduled or held at minute $t$ where $start \le t < end$ cannot take off; it is held until at least $end$.
  - An arrival scheduled or reaching destination at minute $t$ where $start \le t < end$ cannot land; it is held until $end$.
  - A departure or arrival at exactly $t = end$ is permitted immediately.
  - A departure scheduled at exactly $t = start$ is held.

## [A2] Arrival Disruption Policy (AIRBORNE_HOLD vs GROUND_HOLD)
- **Rule**: Default policy is `AIRBORNE_HOLD`. The alternate policy is `GROUND_HOLD`.
- **Behavior**:
  - Under `AIRBORNE_HOLD`: If the destination is closed upon arrival ($start \le arr < end$), the aircraft departs at its normal release time, flies to destination, and holds in the air until $end$. Departure delay is 0, arrival hold minutes = $end - (t + block)$, and arrival delay equals arrival hold minutes.
  - Under `GROUND_HOLD`: If destination is closed upon arrival, departure is delayed at the origin so the aircraft touches down at or after $end$. The fixpoint loop adjusts $t \leftarrow t + (end - arr)$ and re-checks origin closures.

## [A3] Geographic Continuity for Cancellations
- **Rule**: A `CANCEL` action is valid if and only if for every tail, the remaining non-cancelled flights form a continuous geographic chain (i.e. for every leg $i+1$, its origin matches leg $i$'s destination).
- **Behavior**:
  - Permitted cancellations are suffixes of the tail chain (e.g. cancelling the last 1 to $k$ flights) or contiguous out-and-back runs (e.g. $[A \to B, B \to A]$).
  - Isolating an aircraft at an outstation (e.g. cancelling leg 2 of a 4-leg chain while retaining leg 3 departing elsewhere) is strictly INVALID with rejection reason: `"aircraft would be stranded at <airport>"`.

## [A4] Standby Crew for Spare Aircraft Swaps
- **Rule**: When a `SWAP_SPARE` action replaces a tail with a spare aircraft starting at `flightId`, a dedicated standby crew takes over the spare aircraft.
- **Behavior**:
  - The original crew and original tail retain only the flights prior to `flightId`.
  - The standby crew duty begins at $\text{schedDep}(\text{first spare flight}) - \text{spareCrewReportMin}$ (default 60 minutes).
  - Standby crew maximum duty is 600 minutes.
  - The spare aircraft is available from its base starting at its configured `available_from` time (default 05:00).

## [A5] Crew Duty Breaches are Flagged, Not Auto-Fixed
- **Rule**: If a crew's actual duty exceeds `max_duty_mins` (600 minutes), the engine flags `breach = true` and records `excessMin`.
- **Behavior**:
  - The engine does NOT unilaterally cancel the flight or auto-assign relief crews. In real airline operations, duty breaches trigger dispatcher intervention, which is modeled via the recovery optimiser.

## [A6] Constraint Binding and Tie Rules
- **Rule**: When multiple constraints dictate flight departure or cause:
  - If departure after closure resolution strictly exceeds the non-closure base ($t_{\text{after}} > base$), the cause is closure-driven (`AIRPORT_CLOSED_ORIGIN` or `GROUND_HOLD_DEST_CLOSED`).
  - If a closure boundary coincides with a knock-on constraint (tie between closure and knock-on), the delay is attributed to the **knock-on**.
  - Ties among non-closure constraints are resolved in strict priority: $\text{AIRCRAFT} > \text{CREW} > \text{SPARE} > \text{SCHEDULE}$.
  - If a flight has zero departure delay and positive arrival hold minutes, its primary cause is `AIRPORT_CLOSED_DEST_HOLD`. If delay is zero, cause is `ON_TIME`.

## [A7] Objective Function & Scoring Weights
- **Rule**: The recovery optimiser evaluates scenario penalties (lower is better) using the formula:
  $$\text{Score} = 1.0 \times \text{strandedPaxTotal} + 0.5 \times \text{totalArrDelayMin} + 250 \times \text{crewBreaches} + 0.1 \times \text{crewBreachExcessMin} + 50 \times \text{cancelledFlights} + 20 \times \text{sparesUsed}$$
- **Breakdown**: Each response includes an itemized `scoreBreakdown` object corresponding to each term.

## [A8] Decision Time Window
- **Rule**: `decisionTime` is optional (default: none).
- **Behavior**: When provided, actions may not modify flights whose resulting actual departure is strictly prior to `decisionTime` ($\text{actualDep} < \text{decisionTime}$).

## [A9] Propagation Depth Metric
- **Rule**: Propagation depth measures the cascade distance in flight hops from the root disruption.
- **Behavior**:
  - A flight directly delayed by an airport closure has propagation depth 0 (`causeChain = [flightId]`).
  - An aircraft or crew knock-on flight has propagation depth equal to the number of predecessor links in its chain ($\text{causeChain.length} - 1$).
  - `propagationDepthMax` is the maximum propagation depth across all delayed flights in the network.
