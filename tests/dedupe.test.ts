import { describe, it, expect } from 'vitest';
import { normalizeCanonicalUrl, generateDedupeHash } from '../src/domain/dedupe.js';

describe('Deduplication & Canonical URL Utilities', () => {
  it('strips tracking params and normalizes URL format', () => {
    const raw = 'https://HH.ru/vacancy/12345/?utm_source=telegram&from=search_result';
    const canonical = normalizeCanonicalUrl(raw);
    expect(canonical).toBe('https://hh.ru/vacancy/12345');
  });

  it('generates consistent sha256 dedupe hash', () => {
    const hash1 = generateDedupeHash('hh', '12345', 'https://hh.ru/vacancy/12345/?utm_source=test');
    const hash2 = generateDedupeHash('hh', '12345', 'https://hh.ru/vacancy/12345');
    expect(hash1).toBe(hash2);
  });
});
