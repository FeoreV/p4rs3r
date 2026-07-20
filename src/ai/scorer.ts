import { LLMClient } from './llm.js';
import { SCORING_SYSTEM_PROMPT, buildScoringPrompt } from './prompts.js';
import { CandidateProfile, NormalizedJob, ScoringResult, ScoringResultSchema } from '../domain/types.js';

export class LLMScorer {
  constructor(private llmClient: LLMClient = new LLMClient()) {}

  public async scoreJob(profile: CandidateProfile, job: NormalizedJob): Promise<ScoringResult> {
    const prompt = buildScoringPrompt(profile, job);
    
    try {
      const rawResponse = await this.llmClient.completeJSON(prompt, SCORING_SYSTEM_PROMPT);
      
      // Clean JSON string in case of backticks or whitespace
      let cleaned = rawResponse.trim();
      if (cleaned.startsWith('```json')) {
        cleaned = cleaned.slice(7);
      }
      if (cleaned.startsWith('```')) {
        cleaned = cleaned.slice(3);
      }
      if (cleaned.endsWith('```')) {
        cleaned = cleaned.slice(0, -3);
      }
      cleaned = cleaned.trim();

      const parsed = JSON.parse(cleaned);
      const validated = ScoringResultSchema.parse(parsed);
      return validated;
    } catch (error: any) {
      console.warn(`Scoring failed for job ${job.id} (${job.title}): ${error.message}`);
      // Fallback heuristic scoring result if LLM parsing/network fails
      return this.fallbackHeuristicScoring(profile, job, error.message);
    }
  }

  private fallbackHeuristicScoring(profile: CandidateProfile, job: NormalizedJob, errorMsg: string): ScoringResult {
    const textLower = `${job.title} ${job.description}`.toLowerCase();
    
    // Check no-go terms
    const hasNoGo = profile.candidate.no_go.some((term) => textLower.includes(term.toLowerCase()));
    const isSenior = textLower.includes('senior') || textLower.includes('lead');

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
      format_match: job.isRemote ? 100 : 50,
      salary_match: 50,
      growth_signal: 60,
      reasons: [`Fallback heuristic used due to scoring error: ${errorMsg}`],
      missing_requirements: isSenior ? ['Commercial experience requirement'] : [],
      red_flags: hasNoGo ? ['Contains candidate no-go keyword'] : [],
      questions_to_verify: ['Requires manual verification'],
    };
  }
}
