import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveTaxonomyFilters, type Filter, type TaxonomyLoader } from './taxonomy-ids.js';
import type { TaxonomyItem } from './taxonomy.js';

const YT: TaxonomyItem[] = [
  { id: 'id_canva_Education', name: 'Canva', category: 'Education', channelCount: 196 },
  { id: 'id_canva_HowtoStyle', name: 'Canva', category: 'Howto Style', channelCount: 163 },
  { id: 'id_videoediting_Education', name: 'VideoEditing', category: 'Education', channelCount: 400 },
  { id: 'id_editing_Education', name: 'Editing', category: 'Education', channelCount: 300 },
];
const TOPICS: TaxonomyItem[] = [{ id: 'id_fashion_HowtoStyle_youtube', name: 'Fashion', channelCount: 29458 }];

function loader(calls: string[] = []): TaxonomyLoader {
  return async (path) => {
    calls.push(path);
    return { items: path === '/youtube/topics' ? TOPICS : YT, creditsUsed: 1 };
  };
}

test('passes ID filters through without a lookup', async () => {
  const calls: string[] = [];
  const filters: Filter[] = [
    { filterName: 'niches', op: 'in', value: ['id_canva_Education'] },
    { filterName: 'country', op: '=', value: 'USA' },
  ];
  const r = await resolveTaxonomyFilters('youtube', filters, loader(calls));
  assert.ok(r.ok);
  assert.deepEqual(r.filters, filters);
  assert.deepEqual(r.notes, []);
  assert.deepEqual(calls, []);
});

test('maps a name to every matching ID and notes it', async () => {
  const r = await resolveTaxonomyFilters('youtube', [{ filterName: 'niches', op: '=', value: 'canva' }], loader());
  assert.ok(r.ok);
  assert.deepEqual(r.filters[0], { filterName: 'niches', op: 'in', value: ['id_canva_Education', 'id_canva_HowtoStyle'] });
  assert.match(r.notes.join('\n'), /"canva" → id_canva_Education, id_canva_HowtoStyle/);
  assert.match(r.notes.join('\n'), /1 credit/);
});

test('ignores case, spaces and punctuation, and keeps IDs mixed with names', async () => {
  const r = await resolveTaxonomyFilters(
    'youtube',
    [{ filterName: 'niches', op: 'in', value: ['Video Editing', 'id_editing_Education'] }],
    loader(),
  );
  assert.ok(r.ok);
  assert.deepEqual(r.filters[0]!.value, ['id_videoediting_Education', 'id_editing_Education']);
});

test('resolves topics against the topic taxonomy', async () => {
  const calls: string[] = [];
  const r = await resolveTaxonomyFilters('youtube', [{ filterName: 'topics', op: 'in', value: ['fashion'] }], loader(calls));
  assert.ok(r.ok);
  assert.deepEqual(r.filters[0]!.value, ['id_fashion_HowtoStyle_youtube']);
  assert.deepEqual(calls, ['/youtube/topics']);
});

test('does not guess: an unmatched name returns the closest entries', async () => {
  const r = await resolveTaxonomyFilters('youtube', [{ filterName: 'niches', op: 'in', value: ['Editing Tips'] }], loader());
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.match(r.message, /No niches entry is named "Editing Tips"/);
    assert.match(r.message, /id_editing_Education/);
    assert.match(r.message, /No search was run/);
  }
});

test('reports a lookup failure with the list tool to use', async () => {
  const r = await resolveTaxonomyFilters('tiktok', [{ filterName: 'niches', op: 'in', value: ['College'] }], async () => null);
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.message, /list_tiktok_niches/);
});
