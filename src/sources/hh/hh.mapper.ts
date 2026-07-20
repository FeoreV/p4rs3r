import { JobDetails, NormalizedJob } from '../../domain/types.js';
import { normalizeCanonicalUrl } from '../../domain/dedupe.js';

export function mapHHDetailsToNormalized(details: JobDetails): NormalizedJob {
  const raw = details.rawPayload || {};
  let salaryMin: number | undefined;
  let salaryMax: number | undefined;
  let salaryCurrency: string | undefined;

  if (raw.salary) {
    salaryMin = raw.salary.from ?? undefined;
    salaryMax = raw.salary.to ?? undefined;
    salaryCurrency = raw.salary.currency ?? undefined;
  }

  const isRemote =
    Boolean(details.isRemote) ||
    raw.schedule?.id === 'remote' ||
    (details.description ? details.description.toLowerCase().includes('удален') : false);

  return {
    canonicalUrl: normalizeCanonicalUrl(details.url),
    externalId: details.externalId,
    source: details.source || 'hh',
    title: details.title,
    company: details.company,
    salaryMin,
    salaryMax,
    salaryCurrency,
    location: details.location || 'Unknown',
    isRemote,
    employmentType: details.employmentType || raw.employment?.name || 'full-time',
    description: details.description || details.title,
    keySkills: details.keySkills || raw.key_skills?.map((k: any) => k.name) || [],
    publishedAt: details.publishedAt || new Date().toISOString(),
    firstSeenAt: new Date().toISOString(),
  };
}
