/**
 * Tests for the taxonomy paging/search helper. Uses the Node built-in test runner,
 * so there is no test dependency to install: `npm test`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paginateTaxonomy, scoreName, tokenize, type TaxonomyItem } from './taxonomy.js';

const items: TaxonomyItem[] = [
  { id: 'a', name: 'Vlog', category: 'People Blogs', channelCount: 6763 },
  { id: 'b', name: 'StreetFood', category: 'Food', channelCount: 900 },
  { id: 'c', name: 'Minecraft', category: 'Gaming', channelCount: 5294 },
  { id: 'd', name: 'JapanTravel', category: 'Travel', channelCount: 120 },
  { id: 'e', name: 'Skincare', category: 'Beauty', channelCount: 41813 },
  { id: 'f', name: 'Tok', category: 'All', channelCount: 5 },
];
const page = (q: Partial<Parameters<typeof paginateTaxonomy>[1]> = {}) =>
  paginateTaxonomy(items, { pageSize: 100, offset: 0, ...q });

test('defaults to creator count descending', () => {
  const r = page();
  assert.equal(r.total, 6);
  assert.equal(r.matched, 6);
  assert.deepEqual(r.items.map((i) => i.name), ['Skincare', 'Vlog', 'Minecraft', 'StreetFood', 'JapanTravel', 'Tok']);
});

test('pages with offset and reports what is left', () => {
  const r = page({ pageSize: 2, offset: 2 });
  assert.deepEqual(r.items.map((i) => i.name), ['Minecraft', 'StreetFood']);
  assert.equal(r.returned, 2);
  assert.match(r.hint ?? '', /2 more entries match/);
});

test('last page carries no hint', () => {
  assert.equal(page({ pageSize: 100 }).hint, undefined);
});

test('CamelCase names are searchable by their parts', () => {
  assert.deepEqual(page({ search: 'street food' }).items.map((i) => i.name), ['StreetFood']);
  assert.deepEqual(page({ search: 'japan' }).items.map((i) => i.name), ['JapanTravel']);
});

test('stems fold query variants onto catalog form', () => {
  assert.deepEqual(page({ search: 'vloggers' }).items.map((i) => i.name), ['Vlog']);
  assert.deepEqual(page({ search: 'japanese travel' }).items.map((i) => i.name), ['JapanTravel']);
});

test('matching is whole-word, not substring', () => {
  // "skin" must not reach "Skincare" — the reason substring matching was rejected.
  assert.equal(page({ search: 'skin' }).matched, 0);
  assert.equal(page({ search: 'skincare' }).matched, 1);
});

test('a full phrase hit outranks a partial one', () => {
  const extra = [...items, { name: 'Food', channelCount: 10 }];
  const r = paginateTaxonomy(extra, { search: 'street food', pageSize: 100, offset: 0 });
  // StreetFood matches both tokens (150) and beats single-token Food (100) despite fewer creators.
  assert.deepEqual(r.items.map((i) => i.name), ['StreetFood', 'Food']);
});

test('zero matches explain the whole-word rule', () => {
  const r = page({ search: 'skin' });
  assert.equal(r.returned, 0);
  assert.match(r.hint ?? '', /whole-word/);
});

test('a stop-word-only query browses instead of returning nothing', () => {
  const r = page({ search: 'find me all the creators' });
  assert.equal(r.matched, 6);
  assert.equal(r.items[0]?.name, 'Skincare');
});

test('category filter is case-insensitive', () => {
  assert.deepEqual(page({ category: 'gaming' }).items.map((i) => i.name), ['Minecraft']);
});

test('minChannelCount drops the long tail', () => {
  const r = page({ minChannelCount: 1000 });
  assert.deepEqual(r.items.map((i) => i.name), ['Skincare', 'Vlog', 'Minecraft']);
});

test('filters compose, and total stays the unfiltered size', () => {
  const r = page({ category: 'Beauty', minChannelCount: 1000, search: 'skincare' });
  assert.equal(r.total, 6);
  assert.equal(r.matched, 1);
});

test('short tokens and platform names are ignored as query terms', () => {
  // "Tok" is length 3 so it survives tokenizing, but "tiktok" is a stop-word.
  assert.deepEqual(tokenize('tiktok tok'), ['tok']);
  assert.equal(scoreName(new Set(['tok']), 'Tok'), 100);
});
