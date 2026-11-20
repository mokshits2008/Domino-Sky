export type Minute = number;

export interface Closure {
  id: string;
  airport: string;
  start: Minute;
  end: Minute; // closed on [start, end): start inclusive, end exclusive
}

export type Action =
  | { type: 'CANCEL'; flightIds: string[] }
  | { type: 'SWAP_SPARE'; flightId: string; spareTail: string };

export type ArrivalPolicy = 'AIRBORNE_HOLD' | 'GROUND_HOLD';

export interface ScoreWeights {
  strandedPaxTotal: number;
  totalArrDelayMin: number;
  crewBreaches: number;
  crewBreachExcessMin: number;
  cancelledFlights: number;
  sparesUsed: number;
}

export interface EngineConfig {
  minTurnaround: number;
  arrivalPolicy: ArrivalPolicy;
  spareCrewReportMin: number;
  maxFixpointIterations: number;
  scoreWeights: ScoreWeights;
}

export interface Scenario {
  closures: Closure[];
  actions?: Action[];
  decisionTime?: Minute;
  config?: Partial<Omit<EngineConfig, 'scoreWeights'>> & {
    scoreWeights?: Partial<ScoreWeights>;
  };
}

export type CauseType =
  | 'ON_TIME'
  | 'AIRPORT_CLOSED_ORIGIN'
  | 'AIRPORT_CLOSED_DEST_HOLD'
  | 'GROUND_HOLD_DEST_CLOSED'
  | 'KNOCK_ON_AIRCRAFT'
  | 'KNOCK_ON_CREW'
  | 'SPARE_NOT_READY'
  | 'CANCELLED';

export interface FlightResult {
  flightId: string;
  tailId: string; /* effective tail after actions */
  originalTailId: string;
  crewId: string;
  origin: string;
  destination: string;
  schedDep: Minute;
  schedArr: Minute;
  actualDep: Minute | null;
  actualArr: Minute | null;
  depDelay: number;
  arrDelay: number;
  arrivalHoldMin: number;
  cancelled: boolean;
  status: 'ON_TIME' | 'DELAYED' | 'CANCELLED';
  severity: 'NONE' | 'MINOR' | 'MODERATE' | 'SEVERE'; // arrDelay 0 / 1-14 / 15-59 / 60+
  primaryCause: {
    type: CauseType;
    closureId?: string;
    airport?: string;
    sourceFlightId?: string;
    minutes: number;
  };
  rootCause: {
    closureId: string;
    airport: string;
    flightId: string;
  } | null;
  causeChain: string[]; // flightIds from this flight back to the root flight
  slackAbsorbedMin: number; // incoming delay absorbed by schedule slack
  explanation: string; // deterministic one-sentence English; every number in it comes from this struct
}

export interface ConnectionResult {
  connectionId: string;
  airport: string;
  fromFlight: string;
  toFlight: string;
  passengers: number;
  minConnect: number;
  gapMin: number | null;
  status: 'CONNECTED' | 'MISSED' | 'TO_CANCELLED';
  reason?: 'INSUFFICIENT_TIME' | 'FROM_CANCELLED';
  strandedPax: number;
}

export interface CrewResult {
  crewId: string;
  tailId: string;
  dutyStart: Minute;
  dutyEnd: Minute | null;
  dutyMin: number;
  maxDutyMin: number;
  breach: boolean;
  excessMin: number;
  slackToLimitMin: number;
  standby: boolean;
}

export interface Metrics {
  totalFlights: number;
  delayedFlights: number;
  cancelledFlights: number;
  totalDepDelayMin: number;
  totalArrDelayMin: number;
  maxArrDelayMin: number;
  paxDelayMinutes: number; /* sum arrDelay * pax */
  cancelledPax: number;
  missedConnectionPax: number;
  strandedPaxTotal: number; /* cancelledPax + missedConnectionPax, no double counting */
  strandedPaxVsBaseline: number;
  missedConnections: number;
  crewBreaches: number;
  crewBreachExcessMin: number;
  airportsAffected: string[];
  tailsAffected: string[];
  propagationDepthMax: number;
  spareAircraftUsed: number;
}

export interface PropagationEdge {
  from: string;
  to: string;
  minutesTransmitted: number;
  minutesAbsorbed: number;
  via: 'AIRCRAFT' | 'CREW';
}

export interface SimulationResult {
  engineVersion: string;
  scenarioFingerprint: string;
  flights: FlightResult[];
  connections: ConnectionResult[];
  crews: CrewResult[];
  metrics: Metrics;
  perAirport: Record<string, {
    delayedDepartures: number;
    delayedArrivals: number;
    totalDelayMin: number;
  }>;
  propagationEdges: PropagationEdge[];
  warnings: string[];
}

// Data file schema types
export interface AirportData {
  id: string;
  name: string;
  city: string;
  lat: number;
  lng: number;
  tier: string;
  capacity_per_hour: number;
}

export interface FlightData {
  flight_id: string;
  tail_id: string;
  leg_order: number;
  origin: string;
  destination: string;
  dep: string;
  arr: string;
  block_minutes: number;
  pax: number;
  turnaround_before_min: number | null;
}

export interface ConnectionData {
  connection_id: string;
  airport: string;
  from_flight: string;
  to_flight: string;
  passengers: number;
  min_connect_minutes: number;
}

export interface CrewData {
  crew_id: string;
  tail_id: string;
  base: string;
  duty_start: string;
  max_duty_mins: number;
  flight_ids: string[];
}

export interface SpareAircraftData {
  tail_id: string;
  base: string;
  available_from: string;
  seats: number;
}

export interface FlightNetworkData {
  meta: {
    dataset: string;
    operating_day: string;
    min_turnaround_minutes: number;
    seats_per_aircraft: number;
    notes: string[];
  };
  airports: AirportData[];
  flights: FlightData[];
  connections: ConnectionData[];
  crews: CrewData[];
  spare_aircraft: SpareAircraftData[];
}
