import { createHash } from 'node:crypto';

/**
 * Normalizes URLs to a canonical format by stripping tracking query params, trailing slashes,
 * protocol differences, and hash anchors.
 */
export function normalizeCanonicalUrl(url: string): string {
  try {
    const parsed = new URL(url.trim());
    // Strip common tracking params
    const trackingParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'from', 'hhtmFrom'];
    trackingParams.forEach((param) => parsed.searchParams.delete(param));
    
    // Sort remaining params for consistency
    parsed.searchParams.sort();
    
    let canonical = `${parsed.origin}${parsed.pathname}`;
    if (canonical.endsWith('/')) {
      canonical = canonical.slice(0, -1);
    }
    if (parsed.searchParams.toString()) {
      canonical += `?${parsed.searchParams.toString()}`;
    }
    return canonical.toLowerCase();
  } catch {
    return url.trim().toLowerCase().replace(/\/+$/, '');
  }
}

/**
 * Generates a unique deduplication hash from source name and external ID or canonical URL.
 */
export function generateDedupeHash(source: string, externalId: string, url: string): string {
  const canonical = normalizeCanonicalUrl(url);
  const rawKey = `${source.toLowerCase()}:${externalId.trim()}:${canonical}`;
  return createHash('sha256').update(rawKey).digest('hex');
}
