import { CauseType, Minute } from './types';
import { formatMinutesToTime } from './time';

export interface CauseDeterminationInput {
  flightId: string;
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
  baseDep: Minute; // max of non-closure constraints
  tAfterClosure: Minute;
  groundHoldShift: number; // minutes shifted specifically by ground hold rule
  activeOriginClosureId?: string;
  activeDestClosureId?: string;
  aircraftConstraint?: { time: Minute; sourceFlightId: string };
  crewConstraint?: { time: Minute; sourceFlightId: string };
  spareConstraint?: { time: Minute };
  predecessorArrDelay?: number;
  predecessorRootCause?: { closureId: string; airport: string; flightId: string } | null;
  predecessorCauseChain?: string[];
}

export interface CauseDeterminationResult {
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
  causeChain: string[];
  slackAbsorbedMin: number;
  explanation: string;
}

export function determineFlightCauses(input: CauseDeterminationInput): CauseDeterminationResult {
  const {
    flightId,
    origin,
    destination,
    schedDep,
    schedArr,
    actualDep,
    actualArr,
    depDelay,
    arrDelay,
    arrivalHoldMin,
    cancelled,
    baseDep,
    tAfterClosure,
    groundHoldShift,
    activeOriginClosureId,
    activeDestClosureId,
    aircraftConstraint,
    crewConstraint,
    spareConstraint,
    predecessorArrDelay = 0,
    predecessorRootCause = null,
    predecessorCauseChain = []
  } = input;

  if (cancelled) {
    return {
      primaryCause: {
        type: 'CANCELLED',
        minutes: 0
      },
      rootCause: null,
      causeChain: [],
      slackAbsorbedMin: 0,
      explanation: `Flight ${flightId} was cancelled.`
    };
  }

  // Calculate slack absorbed for knock-ons: max(0, predecessorArrDelay - depDelay)
  let slackAbsorbedMin = 0;

  // Case 1: Departure strictly shifted past base by closure
  if (tAfterClosure > baseDep) {
    if (groundHoldShift > 0) {
      const closureId = activeDestClosureId ?? '';
      return {
        primaryCause: {
          type: 'GROUND_HOLD_DEST_CLOSED',
          closureId,
          airport: destination,
          minutes: depDelay
        },
        rootCause: {
          closureId,
          airport: destination,
          flightId
        },
        causeChain: [flightId],
        slackAbsorbedMin: 0,
        explanation: `Flight ${flightId} was held on the ground for ${depDelay} minutes due to destination closure at ${destination}, departing at ${formatMinutesToTime(actualDep!)} and arriving at ${formatMinutesToTime(actualArr!)}.`
      };
    } else {
      const closureId = activeOriginClosureId ?? '';
      return {
        primaryCause: {
          type: 'AIRPORT_CLOSED_ORIGIN',
          closureId,
          airport: origin,
          minutes: depDelay
        },
        rootCause: {
          closureId,
          airport: origin,
          flightId
        },
        causeChain: [flightId],
        slackAbsorbedMin: 0,
        explanation: `Flight ${flightId} was delayed at origin ${origin} by ${depDelay} minutes due to airport closure, departing at ${formatMinutesToTime(actualDep!)} and arriving at ${formatMinutesToTime(actualArr!)}.`
      };
    }
  }

  // Case 2: On-time departure (depDelay == 0)
  if (depDelay === 0) {
    if (arrivalHoldMin > 0) {
      const closureId = activeDestClosureId ?? '';
      return {
        primaryCause: {
          type: 'AIRPORT_CLOSED_DEST_HOLD',
          closureId,
          airport: destination,
          minutes: arrivalHoldMin
        },
        rootCause: {
          closureId,
          airport: destination,
          flightId
        },
        causeChain: [flightId],
        slackAbsorbedMin: 0,
        explanation: `Flight ${flightId} was held in the air on arrival at ${destination} for ${arrivalHoldMin} minutes due to airport closure, arriving at ${formatMinutesToTime(actualArr!)} with ${arrDelay} minutes delay.`
      };
    }

    return {
      primaryCause: {
        type: 'ON_TIME',
        minutes: 0
      },
      rootCause: null,
      causeChain: [],
      slackAbsorbedMin: 0,
      explanation: `Flight ${flightId} operated on schedule, departing at ${formatMinutesToTime(schedDep)} and arriving at ${formatMinutesToTime(schedArr)}.`
    };
  }

  // Case 3: depDelay > 0 caused by non-closure constraints
  // Priority: AIRCRAFT > CREW > SPARE > SCHEDULE
  const acTime = aircraftConstraint?.time ?? -1;
  const crTime = crewConstraint?.time ?? -1;
  const spTime = spareConstraint?.time ?? -1;

  if (acTime === baseDep && acTime > schedDep) {
    slackAbsorbedMin = Math.max(0, predecessorArrDelay - depDelay);
    const srcFlight = aircraftConstraint!.sourceFlightId;
    return {
      primaryCause: {
        type: 'KNOCK_ON_AIRCRAFT',
        sourceFlightId: srcFlight,
        minutes: depDelay
      },
      rootCause: predecessorRootCause,
      causeChain: [flightId, ...predecessorCauseChain],
      slackAbsorbedMin,
      explanation: `Flight ${flightId} was delayed by ${depDelay} minutes due to late incoming aircraft from ${srcFlight} (slack absorbed: ${slackAbsorbedMin} minutes).`
    };
  }

  if (crTime === baseDep && crTime > schedDep) {
    slackAbsorbedMin = Math.max(0, predecessorArrDelay - depDelay);
    const srcFlight = crewConstraint!.sourceFlightId;
    return {
      primaryCause: {
        type: 'KNOCK_ON_CREW',
        sourceFlightId: srcFlight,
        minutes: depDelay
      },
      rootCause: predecessorRootCause,
      causeChain: [flightId, ...predecessorCauseChain],
      slackAbsorbedMin,
      explanation: `Flight ${flightId} was delayed by ${depDelay} minutes due to late incoming crew from ${srcFlight} (slack absorbed: ${slackAbsorbedMin} minutes).`
    };
  }

  if (spTime === baseDep && spTime > schedDep) {
    return {
      primaryCause: {
        type: 'SPARE_NOT_READY',
        minutes: depDelay
      },
      rootCause: null,
      causeChain: [flightId],
      slackAbsorbedMin: 0,
      explanation: `Flight ${flightId} was delayed by ${depDelay} minutes awaiting spare aircraft availability at ${formatMinutesToTime(actualDep!)}.`
    };
  }

  // Fallback: should not be reached if depDelay > 0, but guard defensively
  return {
    primaryCause: {
      type: 'ON_TIME',
      minutes: 0
    },
    rootCause: null,
    causeChain: [],
    slackAbsorbedMin: 0,
    explanation: `Flight ${flightId} operated with ${depDelay} minutes delay.`
  };
}
