import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { callApi } from '../util/api-client.js';

type Platform = 'youtube' | 'instagram' | 'tiktok';

/** Creators per lookup request: one search request takes up to 100 values in an `in` filter. */
export const VET_BATCH = 50;

const RECENT_CONTENT: Record<Platform, Record<string, number>> = {
  youtube: { recentVideos: 3 },
  instagram: { recentReels: 3 },
  tiktok: { recentVideos: 3 },
};

type Json = Record<string, any>;

const clip = (s: unknown, n: number): string => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
};
const pct = (x: unknown): string | null => (typeof x === 'number' ? `${Math.round(x * 10000) / 100}%` : null);

/**
 * The value a search `uniqueId` filter matches: YouTube handles carry a leading @, Instagram and
 * TikTok handles do not.
 */
export function lookupHandle(platform: Platform, handle: string): string {
  const bare = handle.trim().replace(/^@/, '');
  return platform === 'youtube' ? `@${bare}` : bare;
}

/** One creator from an enriched search result, reduced to what is needed to judge fit and quality. */
export function vetCard(platform: Platform, c: Json): Json {
  const perf = c.performance ?? {};
  const recent = perf.contentsPerformanceRecent ?? perf.videosPerformanceRecent ?? {};
  const audience = c.audience ?? {};
  const items: Json[] = Object.values(c['content-detail'] ?? {}).flat() as Json[];
  return {
    platform,
    handle: c.uniqueId,
    ...(c.channelId ? { channelId: c.channelId } : {}),
    name: c.displayName,
    followers: c.totalSubscribers ?? c.totalFollowers ?? null,
    country: c.profile?.country ?? null,
    language: c.profile?.mainLanguage ?? null,
    bio: clip(c.profile?.bio, 160),
    recent: items.map((x) => clip(x.title ?? x.description ?? x.caption, 80)).filter(Boolean).slice(0, 3),
    engagementRate: pct(recent.engagement?.avgEngagementRate),
    medianViews: recent.views?.median ?? null,
    medianLikes: recent.likes?.median ?? null,
    posts30d: perf.contentCountByDays?.['30d'] ?? null,
    consistency: recent.engagement?.engagementConsistency?.consistencyLevel ?? null,
    audienceTop: ((audience.audienceLocations ?? []) as Json[]).slice(0, 3).map((x) => `${x.country} ${pct(x.share)}`),
    audienceFemale: pct(audience.audienceGender?.femaleRatio),
    audienceAvgAge: audience.audienceAvgAge ?? null,
    sponsors:
      platform === 'tiktok'
        ? 'not available on TikTok'
        : ((c.sponsorship?.sponsorList ?? []) as Json[]).map(
            (s) => `${s.brandName} (${(s.sponsoredVideos ?? s.sponsoredPosts ?? []).length})`,
          ),
  };
}

export function registerVetTools(server: McpServer, apiKey: string) {
  server.tool(
    'vet_creators',
    'Check many creators in ONE call instead of calling profile, performance, audience and sponsorship ' +
      'per creator. For each creator returns: followers, country, language, bio, 3 recent post titles, ' +
      'recent engagement rate, median views or likes, posts in the last 30 days, engagement consistency, ' +
      'top audience countries, female audience share, average audience age, and recent sponsor brands ' +
      '(YouTube and Instagram). Pass handles as returned by search (YouTube: the @handle). Up to 150 ' +
      'creators per call. Billed as an enriched search per platform, per creator found: about 13 credits ' +
      '(Instagram, TikTok) to 17 (YouTube), about the same as the separate per-creator calls it replaces.',
    {
      creators: z
        .array(
          z.object({
            platform: z.enum(['youtube', 'instagram', 'tiktok']),
            handle: z.string().min(1).describe('Handle as returned by search. YouTube: the @handle, not the channel ID.'),
          }),
        )
        .min(1)
        .max(150)
        .describe('Creators to check, on any mix of platforms.'),
    },
    async ({ creators }) => {
      const byPlatform = new Map<Platform, string[]>();
      for (const c of creators) {
        const list = byPlatform.get(c.platform) ?? [];
        const h = lookupHandle(c.platform, c.handle);
        if (!list.includes(h)) list.push(h);
        byPlatform.set(c.platform, list);
      }
      const cards: Json[] = [];
      const notes: string[] = [];
      let credits = 0;
      let remaining: number | null = null;
      const requests: Promise<void>[] = [];
      for (const [platform, handles] of byPlatform) {
        for (let i = 0; i < handles.length; i += VET_BATCH) {
          const part = handles.slice(i, i + VET_BATCH);
          const fields: Json = {
            profile: ['bio', 'country', 'mainLanguage'],
            performance: [],
            audience: [],
            'content-detail': RECENT_CONTENT[platform],
          };
          if (platform !== 'tiktok') fields.sponsorship = { sponsorList: 5 };
          requests.push(
            callApi(apiKey, `/${platform}/search`, {
              method: 'POST',
              body: { filters: [{ filterName: 'uniqueId', op: 'in', value: part }], pageSize: part.length, offset: 0, fields },
            }).then((r) => {
              if (!r.success) {
                notes.push(`${platform}: ${r.errorCode || r.error || 'error'} ${r.message ?? r.errorDescription ?? ''}`.trim());
                return;
              }
              credits += r.creditsUsed ?? 0;
              remaining = r.creditsAvailable ?? remaining;
              const list = ((r.data as Json)?.creatorList ?? []) as Json[];
              const found = new Set(list.map((c) => String(c.uniqueId).toLowerCase()));
              for (const c of list) cards.push(vetCard(platform, c));
              const missing = part.filter((h) => !found.has(h.toLowerCase()));
              if (missing.length) notes.push(`${platform}: not found ${missing.join(', ')}`);
            }),
          );
        }
      }
      await Promise.all(requests);
      const text = JSON.stringify({ creators: cards, ...(notes.length ? { notes } : {}) });
      const footer = `Credits used: ${Math.round(credits * 100) / 100}${remaining != null ? ` | Remaining: ${remaining}` : ''}`;
      return {
        ...(cards.length === 0 && notes.length ? { isError: true } : {}),
        content: [
          { type: 'text' as const, text },
          { type: 'text' as const, text: footer },
        ],
      };
    },
  );
}
