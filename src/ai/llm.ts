export interface LLMConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export class LLMClient {
  private baseUrl: string;
  private apiKey: string;
  private model: string;

  constructor(config?: Partial<LLMConfig>) {
    this.baseUrl = config?.baseUrl || process.env.LLM_BASE_URL || 'https://api.openai.com/v1';
    this.apiKey = config?.apiKey || process.env.LLM_API_KEY || 'dummy-key';
    this.model = config?.model || process.env.LLM_MODEL || 'gpt-4o-mini';
  }

  public async completeJSON(prompt: string, systemPrompt?: string): Promise<string> {
    const url = `${this.baseUrl.replace(/\/+$/, '')}/chat/completions`;
    const messages = [];
    
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        temperature: 0.1,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`LLM API request failed (${response.status}): ${errorText}`);
    }

    const data: any = await response.json();
    return data.choices?.[0]?.message?.content || '';
  }
}
