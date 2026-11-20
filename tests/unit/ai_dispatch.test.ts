import { describe, it, expect } from 'vitest';
import { loadFlightNetwork } from '@/engine/load';
import { runDispatchPipeline } from '@/ai/dispatch';
import { MockLLMProvider } from '@/ai/providers/mock';
import { parseTimeToMinutes } from '@/engine/time';
import { buildFactsCatalog } from '@/ai/facts';
import { recommendRecoveryPlans } from '@/engine/candidates';
import { validateRenderedText } from '@/ai/validator';

describe('AI Dispatcher & Number-Safety (Golden G5)', () => {
  const network = loadFlightNetwork();
  const start = parseTimeToMinutes('06:00');
  const end = parseTimeToMinutes('08:30');
  const scenario = { closures: [{ id: 'C_BLR', airport: 'BLR', start, end }] };

  it('G5: Rejects literal wrong number, retries, and falls back to deterministic narration', async () => {
    // Mock that always outputs literal unauthorized digits ("37 passengers", "999 minutes")
    const hallucinatingMock = new MockLLMProvider('always_hallucinate');

    const result = await runDispatchPipeline(network, scenario, {
      customProvider: hallucinatingMock
    });

    // Must be rejected, retried once, and use fallback
    expect(result.validation.retries).toBe(1);
    expect(result.validation.usedFallback).toBe(true);
    expect(result.validation.violations.length).toBeGreaterThan(0);
    expect(result.validation.violations.some((v) => v.includes('37') || v.includes('999'))).toBe(true);

    // Final narrative must be correct and grounded in engine facts
    expect(result.headline).toContain('325'); // delta arrival delay
    expect(result.headline).toContain('108'); // delta stranded pax

    // Provenance must be recorded
    expect(result.provenance.length).toBeGreaterThan(0);

    // Every number in the final narrative must appear in FACTS
    const { disruptedResult, rankedPlans } = recommendRecoveryPlans(network, scenario);
    const factsCatalog = buildFactsCatalog(network, disruptedResult, rankedPlans);
    const finalValidation = validateRenderedText(result.narrative, factsCatalog);
    expect(finalValidation.passed).toBe(true);
  });

  it('G5: Successfully recovers when mock LLM fixes placeholders on retry', async () => {
    // Mock that hallucinates on attempt 1, but fixes placeholders on retry
    const retryMock = new MockLLMProvider('hallucinate_once');

    const result = await runDispatchPipeline(network, scenario, {
      customProvider: retryMock
    });

    // Retried once and passed without needing fallback!
    expect(result.validation.retries).toBe(1);
    expect(result.validation.usedFallback).toBe(false);
    expect(result.validation.passed).toBe(true);
    expect(result.headline).toContain('plan-1');
    expect(result.narrative).toContain('325');

    // Provenance recorded
    expect(result.provenance.length).toBeGreaterThan(0);
  });

  it('G5: Correct placeholder narration passes on first try with 0 retries', async () => {
    const correctMock = new MockLLMProvider('correct');

    const result = await runDispatchPipeline(network, scenario, {
      customProvider: correctMock
    });

    expect(result.validation.retries).toBe(0);
    expect(result.validation.usedFallback).toBe(false);
    expect(result.validation.passed).toBe(true);
    expect(result.validation.violations).toHaveLength(0);
    expect(result.narrative).toContain('325');
  });

  it('G5: Deterministic fallback operates flawlessly when provider is "none"', async () => {
    const result = await runDispatchPipeline(network, scenario, {
      provider: 'none'
    });

    expect(result.validation.usedFallback).toBe(true);
    expect(result.validation.passed).toBe(true);
    expect(result.headline).toContain('plan-1');
    expect(result.headline).toContain('325');
    expect(result.provenance.length).toBeGreaterThan(0);
  });
});
