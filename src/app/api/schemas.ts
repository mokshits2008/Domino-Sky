import { z } from 'zod';
import { loadFlightNetwork } from '@/engine/load';

const network = loadFlightNetwork();
const validAirports = network.airports.map((a) => a.id) as [string, ...string[]];
const validFlightIds = new Set(network.flights.map((f) => f.flight_id));
const validSpareTails = new Set(network.spare_aircraft.map((s) => s.tail_id));

export const ClosureSchema = z.object({
  id: z.string().min(1, 'Closure ID is required'),
  airport: z.enum(validAirports, {
    errorMap: () => ({ message: 'Airport must be a valid airport in the network' })
  }),
  start: z
    .number()
    .int('Start minute must be an integer')
    .min(0, 'Start minute must be >= 0')
    .max(1440, 'Start minute must be <= 1440'),
  end: z
    .number()
    .int('End minute must be an integer')
    .min(0, 'End minute must be >= 0')
    .max(1440, 'End minute must be <= 1440')
}).refine((data) => data.start < data.end, {
  message: 'Closure start minute must be strictly less than end minute (0 <= start < end <= 1440)',
  path: ['end']
});

export const ActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('CANCEL'),
    flightIds: z
      .array(z.string())
      .min(1, 'CANCEL action must specify at least one flightId')
      .refine(
        (ids) => ids.every((id) => validFlightIds.has(id)),
        { message: 'All flightIds in CANCEL action must exist in the network' }
      )
  }),
  z.object({
    type: z.literal('SWAP_SPARE'),
    flightId: z
      .string()
      .refine((id) => validFlightIds.has(id), { message: 'flightId must exist in the network' }),
    spareTail: z
      .string()
      .refine((t) => validSpareTails.has(t), { message: 'spareTail must be a valid spare aircraft in the network' })
  })
]);

export const EngineConfigSchema = z.object({
  minTurnaround: z.number().int().min(1).optional(),
  arrivalPolicy: z.enum(['AIRBORNE_HOLD', 'GROUND_HOLD']).optional(),
  spareCrewReportMin: z.number().int().min(0).optional(),
  maxFixpointIterations: z.number().int().min(1).optional(),
  scoreWeights: z
    .object({
      strandedPaxTotal: z.number().optional(),
      totalArrDelayMin: z.number().optional(),
      crewBreaches: z.number().optional(),
      crewBreachExcessMin: z.number().optional(),
      cancelledFlights: z.number().optional(),
      sparesUsed: z.number().optional()
    })
    .optional()
});

export const SimulateRequestSchema = z.object({
  closures: z
    .array(ClosureSchema)
    .max(5, 'Maximum 5 closures allowed per scenario'),
  actions: z.array(ActionSchema).optional(),
  decisionTime: z.number().int().min(0).max(1440).optional(),
  config: EngineConfigSchema.optional()
});

export const RecommendRequestSchema = z.object({
  closures: z
    .array(ClosureSchema)
    .min(1, 'At least 1 closure is required for recovery recommendations')
    .max(5, 'Maximum 5 closures allowed per scenario'),
  maxActions: z.number().int().min(1).max(5).optional(),
  decisionTime: z.number().int().min(0).max(1440).optional(),
  config: EngineConfigSchema.optional()
});

export const DispatchRequestSchema = z.object({
  closures: z
    .array(ClosureSchema)
    .min(1, 'At least 1 closure is required for AI dispatch')
    .max(5, 'Maximum 5 closures allowed per scenario'),
  planId: z.string().optional(),
  maxActions: z.number().int().min(1).max(5).optional(),
  provider: z.enum(['anthropic', 'gemini', 'mock', 'none']).optional()
});

export const VulnerabilityRequestSchema = z.object({
  durations: z
    .array(z.number().int().min(15).max(360))
    .min(1)
    .max(10)
    .optional()
    .default([60, 90, 120]),
  stepMin: z.number().int().min(15).max(120).optional().default(30),
  windowStart: z.number().int().min(0).max(1440).optional().default(300),
  windowEnd: z.number().int().min(0).max(1440).optional().default(1200)
}).refine((data) => data.windowStart < data.windowEnd, {
  message: 'windowStart must be strictly less than windowEnd',
  path: ['windowEnd']
});

export function errorResponse(code: string, message: string, details?: unknown, status: number = 400) {
  return Response.json(
    {
      error: {
        code,
        message,
        details: details ?? null
      }
    },
    { status }
  );
}
