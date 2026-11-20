import { LLMDispatchOutput, LLMProvider } from './mock';

export class AnthropicLLMProvider implements LLMProvider {
  private apiKey: string;
  private model: string;

  constructor(apiKey?: string, model: string = 'claude-3-5-sonnet-20241022') {
    this.apiKey = apiKey ?? process.env.ANTHROPIC_API_KEY ?? '';
    this.model = model;
  }

  async generateDispatch(
    prompt: string,
    facts: Record<string, unknown>,
    retryViolations?: string[]
  ): Promise<LLMDispatchOutput> {
    if (!this.apiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable is not configured.');
    }

    let userPrompt = `${prompt}\n\nFACTS:\n${JSON.stringify(facts, null, 2)}`;
    if (retryViolations && retryViolations.length > 0) {
      userPrompt += `\n\nCRITICAL RETRY NOTICE: Your previous output contained UNAUTHORIZED NUMBERS that caused validation failure:\n${retryViolations.join('\n')}\nYOU MUST NEVER WRITE LITERAL DIGITS. Use only {{placeholders}} like {{plan.p1.delta.totalArrDelayMin_abs}}!`;
    }

    const systemPrompt = `You are an airline operations chief dispatcher.
You MUST output ONLY a valid JSON object matching this schema:
{
  "recommendedPlanId": "plan-1",
  "headline": "string with {{placeholders}}",
  "reasoning": ["bullet points with {{placeholders}}"],
  "tradeoffs": ["bullet points with {{placeholders}}"],
  "risks": ["bullet points with {{placeholders}}"]
}
STRICT RULE: NEVER write literal numbers or digits. Every number MUST be a placeholder like {{plan.p1.after.totalArrDelayMin}}.`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Anthropic API error (${response.status}): ${errText}`);
    }

    const data = await response.json();
    const content = data.content?.[0]?.text ?? '';
    const cleaned = content.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();

    return JSON.parse(cleaned) as LLMDispatchOutput;
  }
}
