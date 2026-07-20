import { JobSource, RawJob, JobDetails, SearchQuery, SourceCapabilities } from '../../domain/types.js';

export class AvitoJobSource implements JobSource {
  public name = 'avito';

  public async search(query: SearchQuery): Promise<RawJob[]> {
    console.log('[AVITO] Source is unsupported for candidate job search in MVP. Skipping harvest.');
    return [];
  }

  public async getDetails(job: RawJob): Promise<JobDetails> {
    return {
      ...job,
      description: 'Avito source unsupported.',
      keySkills: [],
    };
  }

  public capabilities(): SourceCapabilities {
    return { search: false, details: false, apply: false };
  }
}
