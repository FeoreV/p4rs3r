import { describe, it, expect } from 'vitest';
import { mapHHDetailsToNormalized } from '../src/sources/hh/hh.mapper.js';
import { JobDetails } from '../src/domain/types.js';

describe('HH Details Mapper', () => {
  it('correctly maps raw HH API job details to NormalizedJob', () => {
    const details: JobDetails = {
      source: 'hh',
      externalId: '9999',
      title: 'Junior React Dev',
      company: 'Test Company',
      url: 'https://hh.ru/vacancy/9999?utm_source=test',
      location: 'Moscow',
      isRemote: true,
      employmentType: 'full-time',
      description: '<p>React experience required</p>',
      keySkills: ['React', 'TypeScript'],
      rawPayload: {
        salary: { from: 80000, to: 120000, currency: 'RUR' },
      },
    };

    const normalized = mapHHDetailsToNormalized(details);

    expect(normalized.externalId).toBe('9999');
    expect(normalized.canonicalUrl).toBe('https://hh.ru/vacancy/9999');
    expect(normalized.salaryMin).toBe(80000);
    expect(normalized.salaryMax).toBe(120000);
    expect(normalized.salaryCurrency).toBe('RUR');
  });
});
