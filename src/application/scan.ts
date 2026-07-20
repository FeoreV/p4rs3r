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
import { CandidateProfile, SearchQuery, NormalizedJob, ScanOptions } from '../domain/types.js';
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

export interface ScanResultStats {
  foundCount: number;
  insertedCount: number;
  fetched: number;
  inserted: number;
  updated: number;
  skipped: number;
  failed: number;
  blocked: number;
}


export async function runScanPipeline(
  repository: JobRepository,
  sourceNames: string[] = ['hh', 'habr', 'fl'],
  options: ScanOptions = {}
): Promise<ScanResultStats> {
  const audit = new AuditLogger(repository);
  const targetSources = options.sources && options.sources.length > 0 ? options.sources : sourceNames;
  audit.recordScanStart(targetSources);

  const registry = new SourceRegistry();
  registry.register(new FixtureJobSource());
  registry.register(new HHJobSource());
  registry.register(new HabrJobSource());
  registry.register(new FLRssJobSource());
  registry.register(new AvitoJobSource());

  const enabledSources = registry.getEnabled(targetSources);
  const searchProfiles = loadSearchesConfig();

  const stats: ScanResultStats = {
    foundCount: 0,
    insertedCount: 0,
    fetched: 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    blocked: 0,
  };


  const queriesToRun: { profileName: string; query: SearchQuery }[] = [];

  if (options.query) {
    const keywords = options.query.split(/\s+/).filter(Boolean);
    queriesToRun.push({
      profileName: 'cli-query',
      query: {
        keywords,
        area: options.area ?? 113,
        page: options.page ?? 0,
        pages: options.pages ?? 1,
        perPage: options.perPage ?? options.limit ?? 10,
        limit: options.limit,
        remoteOnly: options.remoteOnly,
        since: options.since,
        noDetails: options.noDetails,
      },
    });
  } else {
    for (const [pName, pConfig] of Object.entries<any>(searchProfiles)) {
      queriesToRun.push({
        profileName: pName,
        query: {
          profileName: pName,
          keywords: pConfig.keywords || ['React'],
          area: options.area ?? pConfig.area,
          page: options.page ?? 0,
          pages: options.pages ?? 1,
          perPage: options.perPage ?? options.limit ?? 10,
          schedule: pConfig.schedule,
          limit: options.limit,
          remoteOnly: options.remoteOnly,
          since: options.since,
          noDetails: options.noDetails,
        },
      });
    }
  }

  for (const source of enabledSources) {
    if (!source.capabilities().search) {
      console.log(`[SCAN] Source ${source.name} does not support search. Skipping.`);
      continue;
    }

    for (const { profileName, query } of queriesToRun) {
      console.log(`[SCAN] Searching source "${source.name}" for profile "${profileName}" (keywords: "${query.keywords.join(' ')}")...`);
      try {
        const rawJobs = await source.search(query);
        stats.fetched += rawJobs.length;

        for (const raw of rawJobs) {
          const canonicalUrl = normalizeCanonicalUrl(raw.url);
          const isDup = repository.isDuplicate(raw.source, raw.externalId, canonicalUrl);

          try {
            let normalized: NormalizedJob;
            if (query.noDetails) {
              normalized = {
                canonicalUrl,
                externalId: raw.externalId,
                source: raw.source,
                title: raw.title,
                company: raw.company,
                location: raw.location || 'Unknown',
                isRemote: Boolean(raw.isRemote),
                employmentType: raw.employmentType || 'full-time',
                description: raw.title,
                keySkills: [],
                publishedAt: raw.publishedAt || new Date().toISOString(),
                firstSeenAt: new Date().toISOString(),
              };
            } else {
              const details = await source.getDetails(raw);
              normalized = mapHHDetailsToNormalized(details);
            }

            const newId = repository.upsertJob(normalized);
            if (isDup) {
              stats.updated++;
            } else {
              stats.inserted++;
            }
          } catch (err: any) {
            stats.failed++;
            console.warn(`[SCAN] Failed processing job ${raw.externalId}: ${err.message}`);
          }
        }
      } catch (err: any) {
        if (err.message?.includes('403') || err.message?.includes('429') || err.message?.includes('blocked')) {
          stats.blocked++;
        } else {
          stats.failed++;
        }
        console.warn(`[SCAN] Error scanning source ${source.name}: ${err.message}`);
      }
    }
  }

  stats.foundCount = stats.fetched;
  stats.insertedCount = stats.inserted;

  audit.recordScanComplete(stats.fetched, stats.inserted);
  console.log(`[SCAN] Pipeline complete. Summary: Fetched ${stats.fetched}, Inserted ${stats.inserted}, Updated ${stats.updated}, Skipped ${stats.skipped}, Failed ${stats.failed}, Blocked ${stats.blocked}.`);

  return stats;
}


