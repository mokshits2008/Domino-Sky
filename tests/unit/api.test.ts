import { describe, it, expect } from 'vitest';
import { GET as healthGET } from '@/app/api/health/route';
import { GET as networkGET } from '@/app/api/network/route';
import { POST as simulatePOST } from '@/app/api/simulate/route';
import { POST as recommendPOST } from '@/app/api/recommend/route';
import { POST as dispatchPOST } from '@/app/api/dispatch/route';
import { POST as vulnerabilityPOST } from '@/app/api/vulnerability/route';
import { NextRequest } from 'next/server';

function createPostRequest(url: string, body: unknown): NextRequest {
  return new NextRequest(new URL(url, 'http://localhost:3000'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

describe('API Route Handlers', () => {
  it('GET /api/health returns status ok and engine version', async () => {
    const res = await healthGET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe('ok');
    expect(json.engineVersion).toBe('1.0.0');
  });

  it('GET /api/network returns complete dataset, integrity report, and baseline slack', async () => {
    const res = await networkGET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.airports).toHaveLength(16);
    expect(json.flights).toHaveLength(70);
    expect(json.connections).toHaveLength(21);
    expect(json.crews).toHaveLength(16);
    expect(json.spare_aircraft).toHaveLength(2);
    expect(json.integrity.valid).toBe(true);
    expect(json.baselineSlack.turnaroundSlack.length).toBeGreaterThan(0);
  });

  it('POST /api/simulate returns SimulationResult for G1 disruption', async () => {
    const req = createPostRequest('http://localhost:3000/api/simulate', {
      closures: [{ id: 'C_BLR', airport: 'BLR', start: 360, end: 510 }]
    });

    const res = await simulatePOST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.metrics.delayedFlights).toBe(5);
    expect(json.metrics.totalArrDelayMin).toBe(620);
    expect(json.metrics.strandedPaxTotal).toBe(108);
    expect(json.scenarioFingerprint).toBeDefined();
  });

  it('POST /api/simulate rejects invalid input with 400 and consistent error shape', async () => {
    // Unknown airport
    const req = createPostRequest('http://localhost:3000/api/simulate', {
      closures: [{ id: 'C_BAD', airport: 'XYZ', start: 360, end: 510 }]
    });

    const res = await simulatePOST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBeDefined();
    expect(json.error.code).toBe('INVALID_REQUEST');
    expect(json.error.details).toBeDefined();
  });

  it('POST /api/simulate rejects start >= end with 400', async () => {
    const req = createPostRequest('http://localhost:3000/api/simulate', {
      closures: [{ id: 'C_BAD', airport: 'BLR', start: 500, end: 400 }]
    });

    const res = await simulatePOST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe('INVALID_REQUEST');
  });

  it('POST /api/simulate rejects invalid actions with 422', async () => {
    // DS0102 alone strands aircraft at JAI
    const req = createPostRequest('http://localhost:3000/api/simulate', {
      closures: [{ id: 'C_BLR', airport: 'BLR', start: 360, end: 510 }],
      actions: [{ type: 'CANCEL', flightIds: ['DS0102'] }]
    });

    const res = await simulatePOST(req);
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error.code).toBe('INVALID_ACTION');
    expect(json.error.details.reasons[0]).toContain('aircraft would be stranded at JAI');
  });

  it('POST /api/recommend returns ranked plans and deltas', async () => {
    const req = createPostRequest('http://localhost:3000/api/recommend', {
      closures: [{ id: 'C_BLR', airport: 'BLR', start: 360, end: 510 }],
      maxActions: 2
    });

    const res = await recommendPOST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.baselineResult).toBeDefined();
    expect(json.disruptedResult).toBeDefined();
    expect(json.rankedPlans.length).toBeGreaterThan(0);
    expect(json.rankedPlans[0].deltas).toBeDefined();
  });

  it('POST /api/dispatch returns validated narrative and provenance', async () => {
    const req = createPostRequest('http://localhost:3000/api/dispatch', {
      closures: [{ id: 'C_BLR', airport: 'BLR', start: 360, end: 510 }],
      provider: 'mock'
    });

    const res = await dispatchPOST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.headline).toBeDefined();
    expect(json.narrative).toBeDefined();
    expect(json.provenance.length).toBeGreaterThan(0);
    expect(json.validation.passed).toBe(true);
  });

  it('POST /api/vulnerability returns heatmap and most damaging closures', async () => {
    const req = createPostRequest('http://localhost:3000/api/vulnerability', {
      durations: [60],
      stepMin: 120,
      windowStart: 360,
      windowEnd: 600
    });

    const res = await vulnerabilityPOST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.heatmap.length).toBeGreaterThan(0);
    expect(json.mostDamagingClosures.length).toBeGreaterThan(0);
  });
});
