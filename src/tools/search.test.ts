import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pastDayRangeSchema } from './search.js';

test('performance-history day range is sent as a number', () => {
  assert.equal(pastDayRangeSchema.parse(90), 90);
  assert.equal(pastDayRangeSchema.parse('90'), 90);
  assert.equal(pastDayRangeSchema.parse(1), 1);
  assert.equal(pastDayRangeSchema.parse(400), 400);
});

test('performance-history day range rejects values outside 1-400', () => {
  for (const bad of [0, 401, -7, 7.5, '0', '401', 'ninety', '', null]) {
    assert.equal(pastDayRangeSchema.safeParse(bad).success, false, String(bad));
  }
});
