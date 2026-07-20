import { JobSource, RawJob, JobDetails, SearchQuery, SourceCapabilities } from '../../domain/types.js';

export class HHJobSource implements JobSource {
  public name = 'hh';

  public async search(query: SearchQuery): Promise<RawJob[]> {
    const textQuery = query.keywords.join(' ');
    const params = new URLSearchParams({
      text: textQuery,
      per_page: '20',
      page: '0',
    });

    if (query.area) {
      params.append('area', String(query.area));
    }
    if (query.schedule) {
      params.append('schedule', query.schedule);
    }

    const url = `https://api.hh.ru/vacancies?${params.toString()}`;

    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'AI-Job-Hunter-MVP/1.0 (contact@example.com)',
        },
      });

      if (!res.ok) {
        console.warn(`HH search failed (${res.status}): ${await res.text()}`);
        return [];
      }

      const data: any = await res.json();
      const items: any[] = data.items || [];

      return items.map((item) => ({
        source: this.name,
        externalId: String(item.id),
        title: item.name,
        company: item.employer?.name || 'Unknown',
        url: item.alternate_url || `https://hh.ru/vacancy/${item.id}`,
        salaryText: item.salary
          ? `${item.salary.from || ''} - ${item.salary.to || ''} ${item.salary.currency || ''}`
          : undefined,
        location: item.area?.name || 'Unknown',
        isRemote: item.schedule?.id === 'remote',
        employmentType: item.employment?.id || 'full-time',
        publishedAt: item.published_at,
        rawPayload: item,
      }));
    } catch (err: any) {
      console.warn(`HH search network error: ${err.message}`);
      return [];
    }
  }

  public async getDetails(job: RawJob): Promise<JobDetails> {
    const url = `https://api.hh.ru/vacancies/${job.externalId}`;

    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'AI-Job-Hunter-MVP/1.0 (contact@example.com)',
        },
      });

      if (!res.ok) {
        return {
          ...job,
          description: job.title,
          keySkills: [],
        };
      }

      const data: any = await res.json();
      const description = data.description ? data.description.replace(/<[^>]+>/g, ' ') : job.title;
      const keySkills = data.key_skills ? data.key_skills.map((k: any) => k.name) : [];

      return {
        ...job,
        description,
        keySkills,
        rawPayload: data,
      };
    } catch {
      return {
        ...job,
        description: job.title,
        keySkills: [],
      };
    }
  }

  public capabilities(): SourceCapabilities {
    return { search: true, details: true, apply: true };
  }
}
