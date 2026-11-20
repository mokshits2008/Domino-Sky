import { NextRequest, NextResponse } from 'next/server';
import { loadFlightNetwork } from '@/engine/load';
import { simulateBaseline } from '@/engine/simulate';
import { recommendRecoveryPlans } from '@/engine/candidates';
import { RecommendRequestSchema, errorResponse } from '@/app/api/schemas';
import { ActionValidationError } from '@/engine/actions';
import { ENGINE_VERSION } from '@/engine/config';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = RecommendRequestSchema.safeParse(body);

    if (!parsed.success) {
      return errorResponse(
        'INVALID_REQUEST',
        'Request validation failed',
        parsed.error.errors,
        400
      );
    }

    const network = loadFlightNetwork();
    const baselineResult = simulateBaseline(network);
    const { disruptedResult, rankedPlans } = recommendRecoveryPlans(
      network,
      {
        closures: parsed.data.closures,
        decisionTime: parsed.data.decisionTime,
        config: parsed.data.config
      },
      parsed.data.maxActions ?? 3
    );

    return NextResponse.json({
      engineVersion: ENGINE_VERSION,
      scenarioFingerprint: disruptedResult.scenarioFingerprint,
      baselineResult,
      disruptedResult,
      rankedPlans
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
      (err as Error).message || 'Unexpected recommendation error',
      null,
      500
    );
  }
}
