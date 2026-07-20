import { JobSource, RawJob, JobDetails, SearchQuery, SourceCapabilities } from '../../domain/types.js';

export class HabrJobSource implements JobSource {
  public name = 'habr';

  public async search(query: SearchQuery): Promise<RawJob[]> {
    const textQuery = encodeURIComponent(query.keywords.join(' '));
    const url = `https://career.habr.com/vacancies?q=${textQuery}&type=all`;

    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AI-Job-Hunter/1.0',
        },
      });

      if (!res.ok) {
        console.warn(`Habr Career search returned status ${res.status}`);
        return [];
      }

      const html = await res.text();
      // Extract vacancy card matches from HTML listing
      const matches = Array.from(html.matchAll(/<a class="vacancy-card__title-link" href="(\/vacancies\/\d+)">([^<]+)<\/a>/g));

      return matches.slice(0, 10).map((m, index) => {
        const path = m[1];
        const title = m[2].trim();
        const id = path.replace('/vacancies/', '');
        return {
          source: this.name,
          externalId: `habr-${id}`,
          title,
          company: 'Habr Employer',
          url: `https://career.habr.com${path}`,
          location: 'Remote/RF',
          isRemote: true,
          employmentType: 'full-time',
          publishedAt: new Date().toISOString(),
          rawPayload: { html, title, path },
        };
      });
    } catch (err: any) {
      console.warn(`Habr search network error: ${err.message}`);
      return [];
    }
  }

  public async getDetails(job: RawJob): Promise<JobDetails> {
    return {
      ...job,
      description: `${job.title} — Habr Career job posting. Direct application requires web submission at ${job.url}`,
      keySkills: ['React', 'TypeScript', 'Node.js'],
    };
  }

  public capabilities(): SourceCapabilities {
    return { search: true, details: true, apply: false };
  }
}
