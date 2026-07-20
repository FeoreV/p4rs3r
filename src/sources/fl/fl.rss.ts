import { XMLParser } from 'fast-xml-parser';
import { JobSource, RawJob, JobDetails, SearchQuery, SourceCapabilities } from '../../domain/types.js';

export class FLRssJobSource implements JobSource {
  public name = 'fl';

  public async search(query: SearchQuery): Promise<RawJob[]> {
    const url = 'https://www.fl.ru/rss/all.xml';

    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AI-Job-Hunter/1.0',
        },
      });

      if (!res.ok) {
        console.warn(`FL RSS search returned status ${res.status}`);
        return [];
      }

      const xmlText = await res.text();
      const parser = new XMLParser();
      const parsed = parser.parse(xmlText);
      const items: any[] = parsed?.rss?.channel?.item || [];

      const filtered = items.filter((item) => {
        const titleAndDesc = `${item.title || ''} ${item.description || ''}`.toLowerCase();
        return query.keywords.some((kw) => titleAndDesc.includes(kw.toLowerCase()));
      });

      return filtered.slice(0, 10).map((item, idx) => ({
        source: this.name,
        externalId: `fl-${item.guid || idx}`,
        title: item.title || 'Freelance Task',
        company: 'FL.ru Client',
        url: item.link || 'https://www.fl.ru',
        location: 'Remote',
        isRemote: true,
        employmentType: 'contract',
        publishedAt: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString(),
        rawPayload: item,
      }));
    } catch (err: any) {
      console.warn(`FL RSS search error: ${err.message}`);
      return [];
    }
  }

  public async getDetails(job: RawJob): Promise<JobDetails> {
    const raw = job.rawPayload || {};
    return {
      ...job,
      description: raw.description || job.title,
      keySkills: ['React', 'TypeScript', 'API Integration'],
    };
  }

  public capabilities(): SourceCapabilities {
    return { search: true, details: true, apply: false };
  }
}
