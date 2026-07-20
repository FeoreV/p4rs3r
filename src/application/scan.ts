import { parse } from 'yaml';
import { readFileSync, existsSync } from 'node:fs';
import { JobRepository } from '../db/repositories.js';
import { SourceRegistry } from '../sources/source.js';
import { FixtureJobSource } from '../sources/fixture.js';
import { HHJobSource } from '../sources/hh/hh.search.js';
import { HabrJobSource } from '../sources/habr/habr.search.js';
import { FLRssJobSource } from '../sources/fl/fl.rss.js';
import { AvitoJobSource } from '../sources/avito/avito.search.js';
import { mapHHDetailsToNormalized } from '../sources/hh/hh.mapper.js';
import { CandidateProfile, SearchQuery, NormalizedJob } from '../domain/types.js';
import { normalizeCanonicalUrl } from '../domain/dedupe.js';
import { AuditLogger } from '../safety/audit.js';

export function loadProfileConfig(profilePath = './config/profile.yaml', policyPath = './config/policy.yaml'): CandidateProfile {
  let candidateData: any = {};
  let policyData: any = {};

  if (existsSync(profilePath)) {
    candidateData = parse(readFileSync(profilePath, 'utf8'));
  }
  if (existsSync(policyPath)) {
    policyData = parse(readFileSync(policyPath, 'utf8'));
  }

  const defaultPolicy = {
    min_score: 70,
    review_score: 55,
    max_applications_per_run: 8,
    max_applications_per_day: 12,
    auto_apply: false,
    require_confirmation_for_first_run: true,
    never_answer_unknown_questions: true,
    never_invent_facts: true,
    never_bypass_captcha: true,
  };

  return {
    candidate: candidateData.candidate || candidateData,
    policy: policyData.policy || candidateData.policy || defaultPolicy,
  };
}

export function loadSearchesConfig(searchesPath = './config/searches.yaml'): Record<string, any> {
  if (!existsSync(searchesPath)) {
    return {
      frontend: { keywords: ['React', 'TypeScript'], area: 113 },
    };
  }
  const content = readFileSync(searchesPath, 'utf8');
  const parsed = parse(content);
  return parsed.profiles || parsed;
}

export async function runScanPipeline(
  repository: JobRepository,
  sourceNames: string[] = ['hh', 'habr', 'fl']
): Promise<{ foundCount: number; insertedCount: number }> {
  const audit = new AuditLogger(repository);
  audit.recordScanStart(sourceNames);

  const registry = new SourceRegistry();
  registry.register(new FixtureJobSource());
  registry.register(new HHJobSource());
  registry.register(new HabrJobSource());
  registry.register(new FLRssJobSource());
  registry.register(new AvitoJobSource());

  const enabledSources = registry.getEnabled(sourceNames);
  const searchProfiles = loadSearchesConfig();

  let totalFound = 0;
  let totalInserted = 0;

  for (const source of enabledSources) {
    if (!source.capabilities().search) {
      console.log(`[SCAN] Source ${source.name} does not support search. Skipping.`);
      continue;
    }

    for (const [pName, pConfig] of Object.entries<any>(searchProfiles)) {
      const query: SearchQuery = {
        profileName: pName,
        keywords: pConfig.keywords || ['React'],
        area: pConfig.area,
        schedule: pConfig.schedule,
      };

      console.log(`[SCAN] Searching source ${source.name} for profile "${pName}"...`);
      const rawJobs = await source.search(query);
      totalFound += rawJobs.length;

      for (const raw of rawJobs) {
        const canonicalUrl = normalizeCanonicalUrl(raw.url);

        if (repository.isDuplicate(raw.source, raw.externalId, canonicalUrl)) {
          continue;
        }

        const details = await source.getDetails(raw);
        const normalized: NormalizedJob = mapHHDetailsToNormalized(details);
        repository.saveVacancy(normalized);
        totalInserted++;
      }
    }
  }

  audit.recordScanComplete(totalFound, totalInserted);
  console.log(`[SCAN] Pipeline complete. Found ${totalFound} raw jobs, inserted ${totalInserted} new vacancies.`);
  return { foundCount: totalFound, insertedCount: totalInserted };
}
