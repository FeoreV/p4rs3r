import { CandidateProfile, NormalizedJob } from '../domain/types.js';

export const SCORING_SYSTEM_PROMPT = `
You are a senior technical interviewer and strict career match evaluator for Russian tech vacancies.
Your task is to score candidate-to-job match from 0 to 100 and output ONLY a valid JSON matching the exact Zod schema:

{
  "score": number (0-100),
  "recommendation": "apply" | "review" | "reject",
  "skill_match": number (0-100),
  "seniority_match": number (0-100),
  "format_match": number (0-100),
  "salary_match": number (0-100),
  "growth_signal": number (0-100),
  "reasons": string[],
  "missing_requirements": string[],
  "red_flags": string[],
  "questions_to_verify": string[]
}

Rules:
1. Do NOT consider the job title alone as proof of fit.
2. Heavily penalize Senior/Middle requirements if candidate is Junior (0 years commercial experience).
3. Flag red flags: hidden sales/marketing, unpaid full-time internships, suspicious salary schemes, mandatory office relocation.
4. Value strong GitHub repositories / portfolio as compensation for lack of commercial experience.
5. Return "review" if the vacancy is promising but contains unknown critical parameters.
6. Output raw JSON only with NO markdown formatting or extra text.
`;

export function buildScoringPrompt(profile: CandidateProfile, job: NormalizedJob): string {
  return `
CANDIDATE PROFILE:
${JSON.stringify(profile.candidate, null, 2)}

JOB DETAILS:
Title: ${job.title}
Company: ${job.company}
Location: ${job.location}
Is Remote: ${job.isRemote}
Employment Type: ${job.employmentType}
Salary Range: ${job.salaryMin ?? 'Unspecified'} - ${job.salaryMax ?? 'Unspecified'} ${job.salaryCurrency ?? ''}
Key Skills: ${job.keySkills.join(', ')}
Description:
${job.description}

Evaluate this job and return ONLY the JSON result object.
`;
}

export function buildCoverLetterPrompt(profile: CandidateProfile, job: NormalizedJob, tone: 'neutral' | 'direct' | 'warm'): string {
  return `
Write a personalized cover letter in Russian for a job application.

CANDIDATE TRUTHFUL FACTS (DO NOT INVENT ANY FACT NOT LISTED HERE):
- Name: ${profile.candidate.name}
- Age: ${profile.candidate.age}
- Location: ${profile.candidate.location}
- Facts: ${profile.candidate.truthful_facts.join('; ')}
- GitHub: ${profile.candidate.github}
- Portfolio: ${profile.candidate.portfolio}

JOB DETAILS:
- Title: ${job.title}
- Company: ${job.company}
- Key Skills: ${job.keySkills.join(', ')}

REQUIREMENTS:
1. Length MUST be between 500 and 900 characters in Russian.
2. Highlight 1-2 specific tech matches with the job.
3. Include link to GitHub/portfolio.
4. Honestly state junior level without corporate jargon or generic fluff.
5. Strict non-hallucination: Do NOT invent years of commercial experience, education, degrees, unlisted frameworks, or fake companies.
6. Tone: ${tone}.
7. Output plain text cover letter text ONLY.
`;
}
