import { CrewData, CrewResult, FlightResult, Minute } from './types';
import { parseTimeToMinutes } from './time';

export interface StandbyCrewAssignment {
  crewId: string;
  tailId: string;
  firstSchedDep: Minute;
  spareCrewReportMin: number;
}

export function evaluateCrews(
  crews: CrewData[],
  flights: FlightResult[],
  standbyCrews: StandbyCrewAssignment[] = []
): CrewResult[] {
  // Map flights by crewId
  const flightsByCrew = new Map<string, FlightResult[]>();
  for (const f of flights) {
    const list = flightsByCrew.get(f.crewId) ?? [];
    list.push(f);
    flightsByCrew.set(f.crewId, list);
  }

  const results: CrewResult[] = [];

  // Evaluate standard crews
  for (const crew of crews) {
    const crewFlights = flightsByCrew.get(crew.crew_id) ?? [];
    const activeFlights = crewFlights.filter((f) => !f.cancelled && f.actualArr !== null);

    const dutyStart = parseTimeToMinutes(crew.duty_start);
    const maxDutyMin = crew.max_duty_mins;

    if (activeFlights.length === 0) {
      results.push({
        crewId: crew.crew_id,
        tailId: crew.tail_id,
        dutyStart,
        dutyEnd: null,
        dutyMin: 0,
        maxDutyMin,
        breach: false,
        excessMin: 0,
        slackToLimitMin: maxDutyMin,
        standby: false
      });
      continue;
    }

    // dutyEnd is the last actualArr among that crew's flights
    let maxArr = -1;
    for (const f of activeFlights) {
      if (f.actualArr !== null && f.actualArr > maxArr) {
        maxArr = f.actualArr;
      }
    }

    const dutyEnd = maxArr >= 0 ? maxArr : null;
    const dutyMin = dutyEnd !== null ? Math.max(0, dutyEnd - dutyStart) : 0;
    // breach iff dutyMin > maxDutyMin (equality is legal)
    const breach = dutyMin > maxDutyMin;
    const excessMin = breach ? dutyMin - maxDutyMin : 0;
    const slackToLimitMin = breach ? 0 : maxDutyMin - dutyMin;

    results.push({
      crewId: crew.crew_id,
      tailId: crew.tail_id,
      dutyStart,
      dutyEnd,
      dutyMin,
      maxDutyMin,
      breach,
      excessMin,
      slackToLimitMin,
      standby: false
    });
  }

  // Evaluate standby crews created for spare flights
  for (const standby of standbyCrews) {
    const standbyFlights = flightsByCrew.get(standby.crewId) ?? [];
    const activeFlights = standbyFlights.filter((f) => !f.cancelled && f.actualArr !== null);

    const dutyStart = standby.firstSchedDep - standby.spareCrewReportMin;
    const maxDutyMin = 600;

    if (activeFlights.length === 0) {
      results.push({
        crewId: standby.crewId,
        tailId: standby.tailId,
        dutyStart,
        dutyEnd: null,
        dutyMin: 0,
        maxDutyMin,
        breach: false,
        excessMin: 0,
        slackToLimitMin: maxDutyMin,
        standby: true
      });
      continue;
    }

    let maxArr = -1;
    for (const f of activeFlights) {
      if (f.actualArr !== null && f.actualArr > maxArr) {
        maxArr = f.actualArr;
      }
    }

    const dutyEnd = maxArr >= 0 ? maxArr : null;
    const dutyMin = dutyEnd !== null ? Math.max(0, dutyEnd - dutyStart) : 0;
    const breach = dutyMin > maxDutyMin;
    const excessMin = breach ? dutyMin - maxDutyMin : 0;
    const slackToLimitMin = breach ? 0 : maxDutyMin - dutyMin;

    results.push({
      crewId: standby.crewId,
      tailId: standby.tailId,
      dutyStart,
      dutyEnd,
      dutyMin,
      maxDutyMin,
      breach,
      excessMin,
      slackToLimitMin,
      standby: true
    });
  }

  return results;
}
