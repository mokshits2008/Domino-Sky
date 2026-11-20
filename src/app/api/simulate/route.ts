import { NextRequest, NextResponse } from 'next/server';
import { loadFlightNetwork } from '@/engine/load';
import { simulate } from '@/engine/simulate';
import { SimulateRequestSchema, errorResponse } from '@/app/api/schemas';
import { ActionValidationError } from '@/engine/actions';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = SimulateRequestSchema.safeParse(body);

    if (!parsed.success) {
      return errorResponse(
        'INVALID_REQUEST',
        'Request validation failed',
        parsed.error.errors,
        400
      );
    }

    const network = loadFlightNetwork();
    const result = simulate(network, parsed.data);
    return NextResponse.json(result);
  } catch (err: unknown) {
    if (err instanceof ActionValidationError) {
      return errorResponse(
        'INVALID_ACTION',
        err.message,
        { reasons: err.reasons },
        422
      );
    }
    return errorResponse(
      'INTERNAL_SERVER_ERROR',
      err instanceof Error ? err.message : 'Unexpected simulation error',
      null,
      500
    );
  }
}
