export interface VacancySchema {
  id?: number;
  dedupeHash: string;
  canonicalUrl: string;
  externalId: string;
  source: string;
  title: string;
  company: string;
  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency?: string;
  location: string;
  isRemote: boolean;
  employmentType: string;
  description: string;
  keySkills: string[];
  publishedAt: string;
  firstSeenAt: string;
}
