/**
 * Normalise a creator handle before it reaches the V3 API.
 *
 * The IG/TT lookup is case-sensitive and rejects URLs, so agents that pass a
 * capitalised handle ("Cristiano"), a profile URL ("instagram.com/cristiano"),
 * or an "@" prefix get a NOT_FOUND / VALIDATION_ERROR for a creator that in
 * fact exists. This made get_instagram_profile a top error tool in the
 * directory metrics. Normalising here turns those into successful lookups;
 * genuinely-missing handles still (correctly) return not-found.
 *
 * Idempotent: a clean lowercase handle passes through unchanged.
 */
export function normalizeHandle(raw: string): string {
  let h = (raw ?? '').trim();
  // A URL or any slashed form → take the last non-empty path segment,
  // after dropping any query string or fragment.
  if (h.includes('/')) {
    const path = h.split(/[?#]/)[0];
    const segments = path.split('/').filter(Boolean);
    if (segments.length) h = segments[segments.length - 1]!;
  }
  h = h.replace(/^@+/, ''); // strip a leading @ (or several)
  return h.toLowerCase();
}
