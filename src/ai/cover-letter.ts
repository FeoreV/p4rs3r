import { LLMClient } from './llm.js';
import { buildCoverLetterPrompt } from './prompts.js';
import { CandidateProfile, NormalizedJob } from '../domain/types.js';

export class CoverLetterGenerator {
  constructor(private llmClient: LLMClient = new LLMClient()) {}

  public async generateCoverLetter(
    profile: CandidateProfile,
    job: NormalizedJob,
    tone: 'neutral' | 'direct' | 'warm' = 'neutral'
  ): Promise<string> {
    const prompt = buildCoverLetterPrompt(profile, job, tone);

    try {
      const result = await this.llmClient.completeJSON(prompt);
      let text = result.trim();

      try {
        const parsed = JSON.parse(text);
        if (typeof parsed === 'string') {
          text = parsed;
        } else if (parsed && typeof parsed.letter === 'string') {
          text = parsed.letter;
        }
      } catch {
        // Plain text response, leave as is
      }

      text = text.replace(/^"|"$/g, '').trim();

      // Verify facts guard (non-hallucination check)
      this.verifyNoHallucinatedFacts(profile, text);
      return text;
    } catch {
      return this.fallbackCoverLetter(profile, job, tone);
    }
  }

  private verifyNoHallucinatedFacts(profile: CandidateProfile, letterText: string): void {
    // Basic safety check for suspicious fake claims
    const forbiddenClaims = ['5 лет опыта', '10 лет опыта', 'высшее образование', 'бакалавриат', 'магистратура'];
    for (const claim of forbiddenClaims) {
      if (letterText.toLowerCase().includes(claim)) {
        throw new Error(`Hallucination guard triggered: unapproved claim "${claim}" found in generated cover letter`);
      }
    }
  }

  public fallbackCoverLetter(
    profile: CandidateProfile,
    job: NormalizedJob,
    tone: 'neutral' | 'direct' | 'warm'
  ): string {
    const candidateName = profile.candidate.name;
    const skillsStr = profile.candidate.truthful_facts.join(', ');
    const github = profile.candidate.github;

    if (tone === 'direct') {
      return `Здравствуйте! Меня зовут ${candidateName}. Заинтересован в вакансии ${job.title} в компании ${job.company}. Мой стековые навыки: ${skillsStr}. У меня 0 лет коммерческого опыта, но я имею прочные практические проекты и пет-проекты в GitHub: ${github}. Готов выполнить тестовое задание и оперативно приступить к работе.`;
    }

    if (tone === 'warm') {
      return `Добрый день! Меня зовут ${candidateName}. Очень вдохновляет позиция ${job.title} в ${job.company}. Мои ключевые технологии: ${skillsStr}. Мой коммерческий опыт — 0 лет, однако я активно развиваюсь в разработке, делаю проекты на React/Node.js и делюсь исходным кодом на GitHub (${github}). Буду рад пообщаться и проявить себя!`;
    }

    return `Здравствуйте! Меня зовут ${candidateName}. Хочу откликнуться на вакансию ${job.title} в компания ${job.company}. Использую в работе ${skillsStr}. Рассматриваю позицию Junior разработчика. Исходный код моих проектов можно посмотреть в GitHub profile: ${github}. Готов ответить на вопросы и решить тестовое задание.`;
  }
}
