import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkTaxonomyIds } from './taxonomy-ids.js';

test('accepts taxonomy IDs', () => {
  assert.equal(
    checkTaxonomyIds('youtube', [
      { filterName: 'niches', value: ['id_canva_Education', 'id_canva_HowtoStyle'] },
      { filterName: 'topics', value: 'id_fashion_HowtoStyle_youtube' },
      { filterName: 'country', value: 'USA' },
    ]),
    null,
  );
});

test('rejects niche names and points to the right list tool', () => {
  const msg = checkTaxonomyIds('tiktok', [{ filterName: 'niches', value: ['College', 'id_college_All'] }]);
  assert.ok(msg);
  assert.match(msg, /"College"/);
  assert.doesNotMatch(msg, /id_college_All"/);
  assert.match(msg, /list_tiktok_niches/);
});

test('topic names point to list_youtube_topics', () => {
  const msg = checkTaxonomyIds('youtube', [{ filterName: 'topics', value: 'Fashion' }]);
  assert.match(msg ?? '', /list_youtube_topics/);
});

test('ignores other string filters', () => {
  assert.equal(checkTaxonomyIds('instagram', [{ filterName: 'hashtags', value: ['canva'] }]), null);
});
