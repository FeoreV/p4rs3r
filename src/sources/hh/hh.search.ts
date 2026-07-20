import { z } from 'zod';
import { JobSource, RawJob, JobDetails, SearchQuery, SourceCapabilities } from '../../domain/types.js';

const HHItemSalarySchema = z.object({
  from: z.number().nullable().optional(),
  to: z.number().nullable().optional(),
  currency: z.string().nullable().optional(),
  gross: z.boolean().nullable().optional(),
}).nullable().optional();

const HHItemSchema = z.object({
  id: z.string().or(z.number()),
  name: z.string(),
  employer: z.object({
    id: z.string().or(z.number()).optional(),
    name: z.string().optional(),
    url: z.string().optional(),
    alternate_url: z.string().optional(),
  }).nullable().optional(),
  area: z.object({
    id: z.string().or(z.number()).optional(),
    name: z.string().optional(),
  }).nullable().optional(),
  salary: HHItemSalarySchema,
  schedule: z.object({
    id: z.string().optional(),
    name: z.string().optional(),
  }).nullable().optional(),
  employment: z.object({
    id: z.string().optional(),
    name: z.string().optional(),
  }).nullable().optional(),
  experience: z.object({
    id: z.string().optional(),
    name: z.string().optional(),
  }).nullable().optional(),
  published_at: z.string().optional(),
  alternate_url: z.string().optional(),
  url: z.string().optional(),
});

const HHSearchResponseSchema = z.object({
  items: z.array(HHItemSchema).optional().default([]),
  found: z.number().optional(),
  pages: z.number().optional(),
  page: z.number().optional(),
  per_page: z.number().optional(),
});

const DEFAULT_USER_AGENT = process.env.HH_USER_AGENT || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';


const DEFAULT_TIMEOUT_MS = 10000;

export class HHJobSource implements JobSource {
  public name = 'hh';

  private async fetchWithRetry(url: string, maxRetries = 2): Promise<{ ok: boolean; status: number; data?: any; error?: string }> {
    let attempt = 0;
    while (attempt <= maxRetries) {
      attempt++;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

      try {
        const res = await fetch(url, {
          headers: {
            'User-Agent': DEFAULT_USER_AGENT,
            'Accept': 'application/json',
          },
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (res.status === 401 || res.status === 403 || res.status === 429) {
          const bodyText = await res.text().catch(() => '');
          console.warn(`[HH API] Access blocked or rate limited (HTTP ${res.status}): ${bodyText.slice(0, 100)}`);
          return { ok: false, status: res.status, error: `HTTP ${res.status}: Access blocked or rate limited` };
        }

        if (!res.ok) {
          const bodyText = await res.text().catch(() => '');
          console.warn(`[HH API] HTTP ${res.status} error response from URL: ${url}\nResponse body: ${bodyText}`);
          if (res.status >= 500 && attempt <= maxRetries) {
            console.warn(`[HH API] Transient error (HTTP ${res.status}). Retrying attempt ${attempt}/${maxRetries}...`);
            await new Promise((r) => setTimeout(r, attempt * 500));
            continue;
          }
          return { ok: false, status: res.status, error: `HTTP ${res.status}: ${bodyText.slice(0, 100)}` };
        }


        const json = await res.json();
        return { ok: true, status: res.status, data: json };
      } catch (err: any) {
        clearTimeout(timeout);
        if (err.name === 'AbortError') {
          console.warn(`[HH API] Request timed out after ${DEFAULT_TIMEOUT_MS}ms.`);
          return { ok: false, status: 408, error: 'Request Timeout' };
        }
        if (attempt <= maxRetries) {
          await new Promise((r) => setTimeout(r, attempt * 500));
          continue;
        }
        return { ok: false, status: 0, error: err.message };
      }
    }
    return { ok: false, status: 0, error: 'Max retries reached' };
  }

  public async search(query: SearchQuery): Promise<RawJob[]> {
    const textQuery = Array.isArray(query.keywords) ? query.keywords.join(' ') : String(query.keywords || '');
    const perPage = Math.min(query.perPage || query.limit || 10, 100);
    const startPage = query.page || 0;
    const totalPagesToScan = query.pages || 1;

    const rawJobs: RawJob[] = [];

    for (let p = startPage; p < startPage + totalPagesToScan; p++) {
      const params = new URLSearchParams({
        text: textQuery,
        per_page: String(perPage),
        page: String(p),
      });

      if (query.area) {
        params.append('area', String(query.area));
      }
      if (query.schedule) {
        params.append('schedule', query.schedule);
      } else if (query.remoteOnly) {
        params.append('schedule', 'remote');
      }

      if (query.since) {
        params.append('date_from', query.since);
      }

      const url = `https://api.hh.ru/vacancies?${params.toString()}`;
      const res = await this.fetchWithRetry(url);

      if (!res.ok || !res.data) {
        console.warn(`[HH API] Search fetch failed: status=${res.status}, error=${res.error}`);
        break;
      }


      const parsed = HHSearchResponseSchema.safeParse(res.data);
      if (!parsed.success) {
        console.warn('[HH API] Failed to parse search response JSON with Zod:', parsed.error.message);
        break;
      }

      const items = parsed.data.items || [];
      for (const item of items) {
        const salaryText = item.salary
          ? `${item.salary.from ?? ''} - ${item.salary.to ?? ''} ${item.salary.currency || ''}`
          : undefined;

        rawJobs.push({
          source: this.name,
          externalId: String(item.id),
          title: item.name,
          company: item.employer?.name || 'Unknown',
          companyUrl: item.employer?.alternate_url || item.employer?.url,
          url: item.alternate_url || item.url || `https://hh.ru/vacancy/${item.id}`,
          salaryText,
          location: item.area?.name || 'Unknown',
          areaId: item.area?.id ? Number(item.area.id) : undefined,
          isRemote: item.schedule?.id === 'remote',
          employmentType: item.employment?.id || item.employment?.name || 'full-time',
          schedule: item.schedule?.id || item.schedule?.name,
          experience: item.experience?.id || item.experience?.name,
          publishedAt: item.published_at,
          rawPayload: item,
        });

        if (query.limit && rawJobs.length >= query.limit) {
          break;
        }
      }

      if (query.limit && rawJobs.length >= query.limit) {
        break;
      }
    }

    return rawJobs;
  }

  public async getDetails(job: RawJob): Promise<JobDetails> {
    const url = `https://api.hh.ru/vacancies/${job.externalId}`;
    const res = await this.fetchWithRetry(url);

    if (!res.ok || !res.data) {
      return {
        ...job,
        description: job.title,
        keySkills: [],
      };
    }

    const data = res.data;
    const description = data.description ? data.description.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : job.title;
    const keySkills = data.key_skills ? data.key_skills.map((k: any) => k.name) : [];

    return {
      ...job,
      description,
      keySkills,
      rawPayload: data,
    };
  }

  public capabilities(): SourceCapabilities {
    return { search: true, details: true, apply: true };
  }
}

