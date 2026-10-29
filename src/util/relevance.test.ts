import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canRank, profileFieldsFor, rankByMatches, wantedSignals } from './relevance.js';

const wanted = wantedSignals([
  { filterName: 'niches', op: 'in', value: ['id_canva_All', 'id_capcut_All', 'id_editing_All'] },
  { filterName: 'hashtags', op: 'in', value: ['#CapCutTutorial', 'editingtips'] },
  { filterName: 'country', op: '=', value: 'USA' },
]);

test('collects requested values per signal, normalizing hashtags', () => {
  assert.deepEqual([...wanted.niches], ['id_canva_All', 'id_capcut_All', 'id_editing_All']);
  assert.deepEqual([...wanted.hashtags], ['capcuttutorial', 'editingtips']);
  assert.deepEqual(profileFieldsFor(wanted), ['niches', 'hashtags']);
  assert.ok(canRank(wanted));
  assert.equal(canRank(wantedSignals([{ filterName: 'niches', op: '=', value: 'id_canva_All' }])), false);
});

test('ranks by match count, then hashtag use, then original order', () => {
  const pool = [
    { uniqueId: 'big', profile: { niches: ['id_canva_All'] } },
    { uniqueId: 'tagger', profile: { niches: ['id_canva_All'], hashtags: [{ name: '#capcuttutorial', contentCount: 9 }] } },
    { uniqueId: 'deep', profile: { niches: ['id_canva_All', 'id_capcut_All', 'id_editing_All'] } },
    { uniqueId: 'light', profile: { niches: ['id_canva_All'], hashtags: [{ name: '#editingtips', contentCount: 1 }] } },
    { uniqueId: 'none', profile: { niches: ['id_cooking_All'] } },
  ];
  const r = rankByMatches(pool, wanted);
  assert.deepEqual(r.map((x) => x.creator.uniqueId), ['deep', 'tagger', 'light', 'big', 'none']);
  assert.equal(r[0]!.matchCount, 3);
  assert.deepEqual(r[1]!.matched, ['id_canva_All', '#capcuttutorial']);
  assert.equal(r[4]!.matchCount, 0);
});
