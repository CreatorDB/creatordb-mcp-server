import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BIO_CHARS, DESCRIPTION_CHARS, compactSearchEnrichment } from './compact.js';

test('shortens long descriptions and bios, leaves short ones and other fields alone', () => {
  const long = 'x'.repeat(DESCRIPTION_CHARS + 50);
  const data = {
    creatorList: [
      {
        uniqueId: 'a',
        profile: { bio: 'b'.repeat(BIO_CHARS + 10), niches: ['id_canva_All'] },
        'content-detail': { recentVideos: [{ title: 'T', description: long, views: 10 }, { title: 'U', description: 'short' }] },
      },
      { uniqueId: 'b' },
    ],
  };
  assert.equal(compactSearchEnrichment(data), 2);
  const c = data.creatorList[0]!;
  assert.equal((c.profile!.bio as string).length, BIO_CHARS + 1);
  assert.ok((c['content-detail']!.recentVideos[0]!.description as string).endsWith('…'));
  assert.equal(c['content-detail']!.recentVideos[0]!.views, 10);
  assert.equal(c['content-detail']!.recentVideos[1]!.description, 'short');
  assert.deepEqual(c.profile!.niches, ['id_canva_All']);
});

test('ignores responses without a creator list', () => {
  assert.equal(compactSearchEnrichment(null), 0);
  assert.equal(compactSearchEnrichment({ items: [] }), 0);
});
