export interface LLMConfig {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  provider?: 'mock' | 'openai' | 'ollama';
}

export class LLMClient {
  private baseUrl: string;
  private apiKey: string;
  private model: string;
  private provider: string;

  constructor(config?: Partial<LLMConfig>) {
    this.provider = (config?.provider || process.env.LLM_PROVIDER || 'mock').toLowerCase();
    this.baseUrl = config?.baseUrl || process.env.LLM_BASE_URL || 'https://api.openai.com/v1';
    this.apiKey = config?.apiKey || process.env.LLM_API_KEY || 'dummy-key';
    this.model = config?.model || process.env.LLM_MODEL || 'gpt-4o-mini';
  }

  public getProvider(): string {
    return this.provider;
  }

  public async completeJSON(prompt: string, systemPrompt?: string): Promise<string> {
    const sanitizedPrompt = this.sanitizeInput(prompt);

    if (this.provider === 'mock') {
      return this.mockResponse(sanitizedPrompt, systemPrompt);
    }

    const url = `${this.baseUrl.replace(/\/+$/, '')}/chat/completions`;
    const messages = [];

    if (systemPrompt) {
      messages.push({ role: 'system', content: this.sanitizeInput(systemPrompt) });
    }
    messages.push({ role: 'user', content: sanitizedPrompt });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
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
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`LLM API request failed (${response.status}): ${errorText}`);
      }

      const data: any = await response.json();
      return data.choices?.[0]?.message?.content || '';
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private sanitizeInput(input: string, maxLength = 6000): string {
    let text = input.slice(0, maxLength);
    // Strip authorization headers, cookies, passwords, or token patterns
    text = text.replace(/([a-zA-Z0-9_-]*password[a-zA-Z0-9_-]*\s*[:=]\s*)[^\s]+/gi, '$1[REDACTED]');
    text = text.replace(/(cookie[s]?\s*[:=]\s*)[^\s]+/gi, '$1[REDACTED]');
    text = text.replace(/(bearer\s+[a-zA-Z0-9._-]+)/gi, '[REDACTED_TOKEN]');
    return text;
  }

  private mockResponse(prompt: string, systemPrompt?: string): string {
    const textLower = prompt.toLowerCase();

    // Cover letter prompt detection
    if (systemPrompt?.includes('cover letter') || textLower.includes('сопроводительное письмо') || textLower.includes('cover letter prompt')) {
      return JSON.stringify(
        "Здравствуйте! Меня зовут Alex Developer. Заинтересован в вакансии Junior Developer. Использую в работе React, TypeScript, Node.js. Рассматриваю позицию Junior разработчика. Мои проекты можно посмотреть на GitHub: https://github.com/alex-dev-ru. Готов решить тестовое задание."
      );
    }

    // Isolate the Job Details section of the prompt to avoid matching candidate profile keywords
    const jobSection = textLower.includes('job details:') ? textLower.split('job details:')[1] : textLower;

    if (jobSection.includes('unpaid') || jobSection.includes('shadybiz') || jobSection.includes('холодн')) {
      return JSON.stringify({
        score: 10,
        recommendation: 'reject',
        skill_match: 20,
        seniority_match: 50,
        format_match: 100,
        salary_match: 0,
        growth_signal: 10,
        reasons: ['No-go clause: unpaid or sales position'],
        missing_requirements: ['Salary compensation'],
        red_flags: ['Contains candidate no-go keyword: unpaid sales internship'],
        questions_to_verify: [],
      });
    }

    if (jobSection.includes('astana') || jobSection.includes('officeonly') || (jobSection.includes('офис') && !jobSection.includes('удален'))) {
      return JSON.stringify({
        score: 30,
        recommendation: 'reject',
        skill_match: 80,
        seniority_match: 70,
        format_match: 0,
        salary_match: 60,
        growth_signal: 40,
        reasons: ['Violates candidate remote_only policy'],
        missing_requirements: ['Remote work possibility'],
        red_flags: ['Mandatory office relocation required'],
        questions_to_verify: [],
      });
    }

    if (jobSection.includes('senior') || jobSection.includes('architect') || jobSection.includes('7 лет') || jobSection.includes('megacorp')) {
      return JSON.stringify({
        score: 25,
        recommendation: 'reject',
        skill_match: 60,
        seniority_match: 10,
        format_match: 50,
        salary_match: 90,
        growth_signal: 30,
        reasons: ['Seniority level is far higher than candidate experience (7+ years required)'],
        missing_requirements: ['Commercial lead/architect experience (7+ years)'],
        red_flags: ['Seniority mismatch'],
        questions_to_verify: [],
      });
    }

    if (jobSection.includes('questionnaire') || jobSection.includes('вопрос') || jobSection.includes('согласны ли')) {
      return JSON.stringify({
        score: 65,
        recommendation: 'review',
        skill_match: 85,
        seniority_match: 80,
        format_match: 100,
        salary_match: 75,
        growth_signal: 70,
        reasons: ['Good technical match, but vacancy contains unknown mandatory application questionnaire'],
        missing_requirements: [],
        red_flags: [],
        questions_to_verify: ['Requires answering custom application questions'],
      });
    }

    // Default strong Junior match for fix-101 and fix-102
    return JSON.stringify({
      score: 85,
      recommendation: 'apply',
      skill_match: 90,
      seniority_match: 95,
      format_match: 100,
      salary_match: 85,
      growth_signal: 80,
      reasons: ['Strong match for Junior React/TypeScript role with remote option'],
      missing_requirements: [],
      red_flags: [],
      questions_to_verify: [],
    });
  }
}
