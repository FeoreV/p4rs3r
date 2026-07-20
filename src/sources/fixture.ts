import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { JobSource, RawJob, JobDetails, SearchQuery, SourceCapabilities } from '../domain/types.js';

export class FixtureJobSource implements JobSource {
  public name = 'fixture';

  private loadFixtureItems(): any[] {
    const fixturePath = join(process.cwd(), 'fixtures', 'vacancies_hh.json');
    if (existsSync(fixturePath)) {
      const content = readFileSync(fixturePath, 'utf8');
      return JSON.parse(content);
    }
    return [];
  }

  public async search(query: SearchQuery): Promise<RawJob[]> {
    const fixtureData = this.loadFixtureItems();
    return fixtureData.map((item) => ({
      source: this.name,
      externalId: item.externalId,
      title: item.title,
      company: item.company,
      url: item.url,
      salaryText: item.salaryText,
      location: item.location,
      isRemote: item.isRemote,
      employmentType: item.employmentType,
      publishedAt: item.publishedAt,
      rawPayload: item,
    }));
  }

  public async getDetails(job: RawJob): Promise<JobDetails> {
    const raw = job.rawPayload as any;
    return {
      ...job,
      description: raw?.description || 'No description provided in fixture',
      keySkills: raw?.keySkills || [],
      mandatoryQuestions: raw?.mandatoryQuestions || [],
    };
  }


  public capabilities(): SourceCapabilities {
    return { search: true, details: true, apply: true };
  }
}
