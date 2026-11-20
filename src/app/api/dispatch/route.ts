import { NextRequest, NextResponse } from 'next/server';
import { loadFlightNetwork } from '@/engine/load';
import { runDispatchPipeline } from '@/ai/dispatch';
import { DispatchRequestSchema, errorResponse } from '@/app/api/schemas';
import { ActionValidationError } from '@/engine/actions';
import { ENGINE_VERSION } from '@/engine/config';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = DispatchRequestSchema.safeParse(body);

    if (!parsed.success) {
      return errorResponse(
        'INVALID_REQUEST',
        'Request validation failed',
        parsed.error.errors,
        400
      );
    }

    const network = loadFlightNetwork();
    const dispatchResult = await runDispatchPipeline(
      network,
      {
        closures: parsed.data.closures
      },
      {
        planId: parsed.data.planId,
        maxActions: parsed.data.maxActions,
        provider: parsed.data.provider
      }
    );

    return NextResponse.json({
      engineVersion: ENGINE_VERSION,
      ...dispatchResult
    });
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
      err instanceof Error ? err.message : 'Unexpected dispatch error',
      null,
      500
    );
  }
}
