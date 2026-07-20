import { LLMClient } from './llm.js';
import { SCORING_SYSTEM_PROMPT, buildScoringPrompt } from './prompts.js';
import { CandidateProfile, NormalizedJob, ScoringResult, ScoringResultSchema } from '../domain/types.js';

export class LLMScorer {
  constructor(private llmClient: LLMClient = new LLMClient()) {}

  public async scoreJob(profile: CandidateProfile, job: NormalizedJob): Promise<ScoringResult> {
    const prompt = buildScoringPrompt(profile, job);

    try {
      const rawResponse = await this.llmClient.completeJSON(prompt, SCORING_SYSTEM_PROMPT);
      const cleaned = this.extractJSONString(rawResponse);
      const parsed = JSON.parse(cleaned);
      const validated = ScoringResultSchema.parse(parsed);
      return validated;
    } catch (error: any) {
      console.warn(`Scoring failed for job ${job.id || 'N/A'} (${job.title}): ${error.message}`);
      return this.fallbackHeuristicScoring(profile, job, error.message);
    }
  }

  public extractJSONString(raw: string): string {
    let text = raw.trim();

    // Match JSON inside code fence ```json ... ``` or ``` ... ```
    const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fenceMatch) {
      text = fenceMatch[1].trim();
    }

    // Match JSON object {...}
    const objectMatch = text.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      return objectMatch[0].trim();
    }

    return text;
  }

  private fallbackHeuristicScoring(profile: CandidateProfile, job: NormalizedJob, errorMsg: string): ScoringResult {
    const textLower = `${job.title} ${job.description}`.toLowerCase();

    // Check no-go terms
    const hasNoGo = profile.candidate.no_go.some((term) => textLower.includes(term.toLowerCase()));
    const isSenior = textLower.includes('senior') || textLower.includes('lead') || textLower.includes('architect');

    let score = 50;
    if (hasNoGo) score -= 40;
    if (isSenior) score -= 30;
    if (textLower.includes('react') || textLower.includes('typescript')) score += 20;

    score = Math.max(0, Math.min(100, score));

    return {
      score,
      recommendation: score >= 70 ? 'apply' : score >= 55 ? 'review' : 'reject',
      skill_match: 60,
      seniority_match: isSenior ? 20 : 70,
      format_match: job.isRemote || job.remote ? 100 : 50,
      salary_match: 50,
      growth_signal: 60,
      reasons: [`Fallback heuristic used due to scoring error: ${errorMsg}`],
      missing_requirements: isSenior ? ['Commercial experience requirement'] : [],
      red_flags: hasNoGo ? ['Contains candidate no-go keyword'] : [],
      questions_to_verify: ['Requires manual verification'],
    };
  }
}
