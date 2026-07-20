import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { JobDetails, NormalizedJob } from '../../domain/types.js';
import { normalizeCanonicalUrl } from '../../domain/dedupe.js';

export function saveRawPayload(source: string, externalId: string, payload: Record<string, any>): { hash: string; path: string } {
  const dateStr = new Date().toISOString().split('T')[0];
  const dirPath = join('./data/raw', source, dateStr);

  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }

  const gitignorePath = join('./data/raw', '.gitignore');
  if (!existsSync(gitignorePath)) {
    try {
      writeFileSync(gitignorePath, '*\n!.gitignore\n');
    } catch {
      // ignore write error
    }
  }

  // Redact authorization or cookies if present in raw payload
  const sanitized = JSON.parse(JSON.stringify(payload));
  if (sanitized.headers) {
    delete sanitized.headers['authorization'];
    delete sanitized.headers['cookie'];
    delete sanitized.headers['set-cookie'];
  }
  delete sanitized.cookies;
  delete sanitized.session;

  const jsonString = JSON.stringify(sanitized, null, 2);
  const hash = createHash('sha256').update(jsonString).digest('hex');
  const filePath = join(dirPath, `${externalId}.json`);

  try {
    writeFileSync(filePath, jsonString, 'utf8');
  } catch {
    // ignore filesystem write errors in test environments
  }

  return { hash, path: filePath };
}

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

  const companyName = details.company || raw.employer?.name || 'Unknown';
  const companyUrl = raw.employer?.alternate_url || raw.employer?.url || undefined;
  const areaId = raw.area?.id ? Number(raw.area.id) : undefined;
  const schedule = raw.schedule?.id || raw.schedule?.name || undefined;
  const experience = raw.experience?.id || raw.experience?.name || undefined;
  const alternateUrl = details.url || raw.alternate_url || `https://hh.ru/vacancy/${details.externalId}`;

  const isRemote =
    Boolean(details.isRemote) ||
    raw.schedule?.id === 'remote' ||
    (details.description ? details.description.toLowerCase().includes('удален') : false);

  const { hash, path } = saveRawPayload(details.source || 'hh', details.externalId, raw);

  const rawDesc = details.description || details.title;
  const cleanDesc = rawDesc.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

  return {
    canonicalUrl: normalizeCanonicalUrl(alternateUrl),
    externalId: details.externalId,
    source: details.source || 'hh',
    title: details.title,
    company: companyName,
    companyUrl,
    salaryMin,
    salaryMax,
    salaryCurrency,
    salaryFrom: salaryMin,
    salaryTo: salaryMax,
    currency: salaryCurrency,
    location: details.location || raw.area?.name || 'Unknown',
    areaId,
    isRemote,
    remote: isRemote,
    employmentType: details.employmentType || raw.employment?.name || 'full-time',
    schedule,
    experience,
    description: cleanDesc,
    keySkills: details.keySkills || raw.key_skills?.map((k: any) => k.name) || [],
    publishedAt: details.publishedAt || raw.published_at || new Date().toISOString(),
    firstSeenAt: new Date().toISOString(),
    alternateUrl,
    rawPayloadHash: hash,
    rawPayloadPath: path,
    sourceMetadata: JSON.stringify({
      employerId: raw.employer?.id,
      responseLetterRequired: raw.response_letter_required,
    }),
  };
}


