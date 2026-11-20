export interface LLMDispatchOutput {
  recommendedPlanId: string;
  headline: string;
  reasoning: string[];
  tradeoffs: string[];
  risks: string[];
}

export interface LLMProvider {
  generateDispatch(
    prompt: string,
    facts: Record<string, unknown>,
    retryViolations?: string[]
  ): Promise<LLMDispatchOutput>;
}

export class MockLLMProvider implements LLMProvider {
  private mode: 'correct' | 'hallucinate_once' | 'always_hallucinate';
  private callCount: number = 0;

  constructor(mode: 'correct' | 'hallucinate_once' | 'always_hallucinate' = 'correct') {
    this.mode = mode;
  }

  public getCallCount(): number {
    return this.callCount;
  }

  async generateDispatch(
    _prompt: string,
    _facts: Record<string, unknown>,
    retryViolations?: string[]
  ): Promise<LLMDispatchOutput> {
    this.callCount++;

    if (this.mode === 'always_hallucinate') {
      return {
        recommendedPlanId: 'plan-1',
        headline: 'Emergency recovery plan for airline disruption with 37 passengers stranded',
        reasoning: [
          'Delay reduced by 999 minutes across the entire fleet',
          'Only 42 flights impacted'
        ],
        tradeoffs: ['Cancelled 12 flights'],
        risks: ['High crew duty across 9 crews']
      };
    }

    if (this.mode === 'hallucinate_once') {
      if (retryViolations && retryViolations.length > 0) {
        // Correct on retry
        return {
          recommendedPlanId: 'plan-1',
          headline: 'Deploy spare aircraft {{plan.p1.id}} to recover network operations',
          reasoning: [
            'Reduces arrival delay by {{plan.p1.delta.totalArrDelayMin_abs}} minutes',
            'Prevents {{plan.p1.delta.strandedPaxTotal_abs}} passengers from being stranded'
          ],
          tradeoffs: ['Deploys {{plan.p1.after.spareAircraftUsed}} spare aircraft'],
          risks: ['Standby crew duty required at base']
        };
      } else {
        // Hallucinate on first attempt
        return {
          recommendedPlanId: 'plan-1',
          headline: 'Recovery plan with 37 passengers stranded',
          reasoning: ['Delays reduced by 400 minutes'],
          tradeoffs: ['Cancelled 7 flights'],
          risks: ['Potential delay']
        };
      }
    }

    // Default correct placeholder output
    return {
      recommendedPlanId: 'plan-1',
      headline: 'Deploy recovery {{plan.p1.id}} to eliminate crew breaches and save passenger connections',
      reasoning: [
        'Reduces arrival delay by {{plan.p1.delta.totalArrDelayMin_abs}} minutes across the network',
        'Eliminates {{plan.p1.before.crewBreaches}} crew duty breaches',
        'Resolves {{plan.p1.delta.strandedPaxTotal_abs}} stranded passenger connections'
      ],
      tradeoffs: ['Deploys {{plan.p1.after.spareAircraftUsed}} spare aircraft at base'],
      risks: ['Spare aircraft unavailable for subsequent operational contingencies']
    };
  }
}
