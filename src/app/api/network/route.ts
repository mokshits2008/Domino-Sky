import { NextResponse } from 'next/server';
import { loadFlightNetwork } from '@/engine/load';
import { validateNetworkIntegrity } from '@/engine/validate';
import { computeBaselineSlackReport } from '@/engine/analytics';
import { ENGINE_VERSION } from '@/engine/config';

export async function GET() {
  const network = loadFlightNetwork();
  const integrityReport = validateNetworkIntegrity(network);
  const baselineSlack = computeBaselineSlackReport(network);

  return NextResponse.json({
    engineVersion: ENGINE_VERSION,
    meta: network.meta,
    airports: network.airports,
    flights: network.flights,
    connections: network.connections,
    crews: network.crews,
    spare_aircraft: network.spare_aircraft,
    integrity: integrityReport,
    baselineSlack
  });
}
