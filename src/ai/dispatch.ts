import { FlightNetworkData, Metrics, Scenario } from '../engine/types';
import { recommendRecoveryPlans, RecoveryPlan } from '../engine/candidates';
import { buildFactsCatalog } from './facts';
import { renderTemplate, ProvenanceEntry } from './template';
import { validateRenderedText } from './validator';
import { LLMProvider, LLMDispatchOutput, MockLLMProvider } from './providers/mock';
import { AnthropicLLMProvider } from './providers/anthropic';
import { GeminiLLMProvider } from './providers/gemini';

export interface DispatchResult {
  recommendedPlanId: string;
  headline: string;
  narrative: string;
  reasoning: string[];
  tradeoffs: string[];
  risks: string[];
  provenance: ProvenanceEntry[];
  validation: {
    passed: boolean;
    retries: number;
    usedFallback: boolean;
    violations: string[];
  };
  chosenPlan: RecoveryPlan | null;
  beforeMetrics: Metrics;
  afterMetrics: Metrics | null;
  scenarioFingerprint: string;
}

export interface DispatchOptions {
  provider?: 'anthropic' | 'gemini' | 'mock' | 'none';
  customProvider?: LLMProvider;
  planId?: string;
  maxActions?: number;
}

export function selectLLMProvider(requestedProvider?: string): LLMProvider | null {
  const provider = requestedProvider ?? process.env.LLM_PROVIDER ?? 'none';

  if (provider === 'anthropic' && process.env.ANTHROPIC_API_KEY) {
    return new AnthropicLLMProvider();
  }
  if (provider === 'gemini' && process.env.GEMINI_API_KEY) {
    return new GeminiLLMProvider();
  }
  if (provider === 'mock') {
    return new MockLLMProvider('correct');
  }
  return null;
}

/**
 * Runs the AI Dispatcher pipeline with strict number-safety, provenance auditing,
 * retry on hallucinated numeric tokens, and deterministic template fallback.
 */
export async function runDispatchPipeline(
  network: FlightNetworkData,
  scenario: Scenario,
  options?: DispatchOptions
): Promise<DispatchResult> {
  const { disruptedResult, rankedPlans } = recommendRecoveryPlans(
    network,
    scenario,
    options?.maxActions ?? 3
  );

  const factsCatalog = buildFactsCatalog(network, disruptedResult, rankedPlans);
  const provider = options?.customProvider ?? selectLLMProvider(options?.provider);

  let chosenPlan: RecoveryPlan | null = null;
  if (options?.planId) {
    chosenPlan = rankedPlans.find((p) => p.id === options.planId) ?? null;
  }
  if (!chosenPlan && rankedPlans.length > 0) {
    chosenPlan = rankedPlans[0];
  }

  let retries = 0;
  let usedFallback = false;
  let violations: string[] = [];
  let llmOutput: LLMDispatchOutput | null = null;

  // Try LLM generation if provider is available
  if (provider && rankedPlans.length > 0) {
    try {
      const prompt = `Review the disruption scenario and recommend recovery actions. Output valid JSON with {{placeholders}} only.`;
      const output = await provider.generateDispatch(prompt, factsCatalog.facts);

      // Validate rendered output
      const fullText = [
        output.headline,
        ...output.reasoning,
        ...output.tradeoffs,
        ...output.risks
      ].join(' ');

      const renderedCheck = renderTemplate(fullText, factsCatalog.facts);
      const valCheck = validateRenderedText(renderedCheck.renderedText, factsCatalog);

      if (valCheck.passed && renderedCheck.errors.length === 0) {
        llmOutput = output;
      } else {
        // Retry once with violation list
        retries = 1;
        const combinedViolations = [...valCheck.violations, ...renderedCheck.errors];
        const retryOutput = await provider.generateDispatch(
          prompt,
          factsCatalog.facts,
          combinedViolations
        );

        const retryFullText = [
          retryOutput.headline,
          ...retryOutput.reasoning,
          ...retryOutput.tradeoffs,
          ...retryOutput.risks
        ].join(' ');

        const retryRender = renderTemplate(retryFullText, factsCatalog.facts);
        const retryVal = validateRenderedText(retryRender.renderedText, factsCatalog);

        if (retryVal.passed && retryRender.errors.length === 0) {
          llmOutput = retryOutput;
        } else {
          usedFallback = true;
          violations = [...retryVal.violations, ...retryRender.errors];
        }
      }
    } catch (err: unknown) {
      usedFallback = true;
      violations.push(`LLM error: ${(err as Error).message}`);
    }
  } else {
    usedFallback = true;
  }

  // Deterministic fallback if LLM not used or validation failed
  if (!llmOutput) {
    usedFallback = true;
    if (chosenPlan) {
      llmOutput = {
        recommendedPlanId: chosenPlan.id,
        headline: `Implement {{plan.${chosenPlan.id}.id}} to reduce network arrival delay by {{plan.${chosenPlan.id}.delta.totalArrDelayMin_abs}} minutes and prevent {{plan.${chosenPlan.id}.delta.strandedPaxTotal_abs}} stranded passengers.`,
        reasoning: [
          `Eliminates {{plan.${chosenPlan.id}.delta.crewBreaches_abs}} crew duty breaches across affected tails.`,
          `Recovers {{plan.${chosenPlan.id}.delta.totalArrDelayMin_abs}} minutes of cumulative arrival delay.`,
          `Protects {{plan.${chosenPlan.id}.delta.strandedPaxTotal_abs}} connecting passenger itineraries.`
        ],
        tradeoffs: chosenPlan.tradeoffs.length > 0 ? chosenPlan.tradeoffs : ['No significant tradeoffs recorded.'],
        risks: [
          chosenPlan.deltas.spareAircraftUsed > 0
            ? `Standby spare deployed ({{plan.${chosenPlan.id}.after.spareAircraftUsed}} spare aircraft in use).`
            : `Schedule compression may absorb remaining turn slack.`
        ]
      };
    } else {
      llmOutput = {
        recommendedPlanId: 'none',
        headline: 'No recovery actions required; network schedule operating within acceptable tolerance.',
        reasoning: ['All flights on schedule or disruption absorbed by turnaround slack.'],
        tradeoffs: [],
        risks: []
      };
    }
  }

  // Render all fields with provenance
  const allProvenance: ProvenanceEntry[] = [];

  const headlineRender = renderTemplate(llmOutput.headline, factsCatalog.facts);
  allProvenance.push(...headlineRender.provenance);

  const reasoningRendered = llmOutput.reasoning.map((r) => {
    const res = renderTemplate(r, factsCatalog.facts);
    allProvenance.push(...res.provenance);
    return res.renderedText;
  });

  const tradeoffsRendered = llmOutput.tradeoffs.map((t) => {
    const res = renderTemplate(t, factsCatalog.facts);
    allProvenance.push(...res.provenance);
    return res.renderedText;
  });

  const risksRendered = llmOutput.risks.map((rk) => {
    const res = renderTemplate(rk, factsCatalog.facts);
    allProvenance.push(...res.provenance);
    return res.renderedText;
  });

  const narrative = [
    headlineRender.renderedText,
    '',
    'Reasoning:',
    ...reasoningRendered.map((r) => `* ${r}`),
    '',
    'Tradeoffs:',
    ...tradeoffsRendered.map((t) => `* ${t}`),
    '',
    'Risks:',
    ...risksRendered.map((rk) => `* ${rk}`)
  ].join('\n');

  return {
    recommendedPlanId: chosenPlan?.id ?? llmOutput.recommendedPlanId,
    headline: headlineRender.renderedText,
    narrative,
    reasoning: reasoningRendered,
    tradeoffs: tradeoffsRendered,
    risks: risksRendered,
    provenance: allProvenance,
    validation: {
      passed: !usedFallback || violations.length === 0,
      retries,
      usedFallback,
      violations
    },
    chosenPlan,
    beforeMetrics: disruptedResult.metrics,
    afterMetrics: chosenPlan?.afterMetrics ?? null,
    scenarioFingerprint: disruptedResult.scenarioFingerprint
  };
}
