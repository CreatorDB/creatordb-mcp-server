import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pastDayRangeSchema } from './search.js';

test('performance-history day range is sent as a number', () => {
  assert.equal(pastDayRangeSchema.parse(90), 90);
  assert.equal(pastDayRangeSchema.parse('90'), 90);
  assert.equal(pastDayRangeSchema.parse(1), 1);
  assert.equal(pastDayRangeSchema.parse(365), 365);
});

test('performance-history day range rejects values outside 1-365', () => {
  for (const bad of [0, 366, -7, 7.5, '0', '366', 'ninety', '', null]) {
    assert.equal(pastDayRangeSchema.safeParse(bad).success, false, String(bad));
  }
});
