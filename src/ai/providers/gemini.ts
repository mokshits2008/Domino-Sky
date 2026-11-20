import { LLMDispatchOutput, LLMProvider } from './mock';

export class GeminiLLMProvider implements LLMProvider {
  private apiKey: string;
  private model: string;

  constructor(apiKey?: string, model: string = 'gemini-1.5-flash') {
    this.apiKey = apiKey ?? process.env.GEMINI_API_KEY ?? '';
    this.model = model;
  }

  async generateDispatch(
    prompt: string,
    facts: Record<string, unknown>,
    retryViolations?: string[]
  ): Promise<LLMDispatchOutput> {
    if (!this.apiKey) {
      throw new Error('GEMINI_API_KEY environment variable is not configured.');
    }

    let userPrompt = `${prompt}\n\nFACTS:\n${JSON.stringify(facts, null, 2)}`;
    if (retryViolations && retryViolations.length > 0) {
      userPrompt += `\n\nCRITICAL RETRY NOTICE: Your previous output contained UNAUTHORIZED NUMBERS that caused validation failure:\n${retryViolations.join('\n')}\nYOU MUST NEVER WRITE LITERAL DIGITS. Use only {{placeholders}} like {{plan.p1.delta.totalArrDelayMin_abs}}!`;
    }

    const systemInstruction = `You are an airline operations chief dispatcher.
Output ONLY a JSON object:
{
  "recommendedPlanId": "plan-1",
  "headline": "string with {{placeholders}}",
  "reasoning": ["bullet points with {{placeholders}}"],
  "tradeoffs": ["bullet points with {{placeholders}}"],
  "risks": ["bullet points with {{placeholders}}"]
}
STRICT RULE: NEVER write literal numbers or digits. Every number MUST be a placeholder like {{plan.p1.after.totalArrDelayMin}}.`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: systemInstruction }]
        },
        contents: [
          {
            role: 'user',
            parts: [{ text: userPrompt }]
          }
        ],
        generationConfig: {
          response_mime_type: 'application/json'
        }
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini API error (${response.status}): ${errText}`);
    }

    const data = await response.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const cleaned = content.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();

    return JSON.parse(cleaned) as LLMDispatchOutput;
  }
}
