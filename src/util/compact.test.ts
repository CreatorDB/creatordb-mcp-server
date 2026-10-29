import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BIO_CHARS, DESCRIPTION_CHARS, compactSearchEnrichment } from './compact.js';

const creator = (i: number) => ({
  uniqueId: `c${i}`,
  profile: {
    bio: 'b'.repeat(BIO_CHARS + 10),
    niches: Array.from({ length: 15 }, (_, j) => `id_n${j}_All`),
    hashtags: Array.from({ length: 40 }, (_, j) => ({ name: `#t${j}`, contentCount: j })),
  },
  'content-detail': { recentVideos: [{ title: 'T', description: 'x'.repeat(1000), views: 10 }, { title: 'U', description: 'short' }] },
});

test('always shortens long descriptions and bios, leaves short ones and other fields alone', () => {
  const data = { creatorList: [creator(0), { uniqueId: 'plain' }] };
  const note = compactSearchEnrichment(data, 1e9);
  assert.match(note ?? '', /descriptions shortened to 200/);
  const c = data.creatorList[0] as ReturnType<typeof creator>;
  assert.equal((c.profile.bio as string).length, BIO_CHARS + 1);
  assert.equal((c['content-detail'].recentVideos[0]!.description as string).length, DESCRIPTION_CHARS + 1);
  assert.equal(c['content-detail'].recentVideos[0]!.views, 10);
  assert.equal(c['content-detail'].recentVideos[1]!.description, 'short');
  assert.equal(c.profile.hashtags.length, 40, 'within budget: lists untouched');
});

test('goes further only as far as needed to fit the budget', () => {
  const data = { creatorList: Array.from({ length: 30 }, (_, i) => creator(i)) };
  const note = compactSearchEnrichment(data, 40_000);
  assert.ok(JSON.stringify(data).length <= 40_000);
  assert.match(note ?? '', /top 10/);
  const tags = data.creatorList[0]!.profile!.hashtags as Array<{ contentCount: number }>;
  assert.equal(tags.length, 10);
  assert.equal(tags[0]!.contentCount, 39, 'keeps the most used hashtags');
});

test('removes descriptions as a last resort and says when it is still large', () => {
  const data = { creatorList: Array.from({ length: 30 }, (_, i) => creator(i)) };
  const note = compactSearchEnrichment(data, 3_000);
  assert.match(note ?? '', /descriptions removed/);
  assert.match(note ?? '', /Still large/);
  assert.equal(data.creatorList[0]!['content-detail']!.recentVideos[0]!.title, 'T');
});

test('ignores responses without a creator list', () => {
  assert.equal(compactSearchEnrichment(null), null);
  assert.equal(compactSearchEnrichment({ items: [] }), null);
});
