import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lookupHandle, vetCard } from './vet.js';

test('lookupHandle adds @ for YouTube only', () => {
  assert.equal(lookupHandle('youtube', 'brandname'), '@brandname');
  assert.equal(lookupHandle('youtube', '@brandname'), '@brandname');
  assert.equal(lookupHandle('instagram', '@brandname'), 'brandname');
  assert.equal(lookupHandle('tiktok', ' brandname '), 'brandname');
});

test('vetCard summarises an enriched Instagram result', () => {
  const card = vetCard('instagram', {
    uniqueId: 'creator.one',
    displayName: 'Creator One',
    totalFollowers: 120000,
    profile: { bio: 'Cooking   studio\nand classes', country: 'USA', mainLanguage: 'eng' },
    performance: {
      contentCountByDays: { '30d': 12 },
      contentsPerformanceRecent: {
        likes: { median: 900 },
        engagement: { avgEngagementRate: 0.0312, engagementConsistency: { consistencyLevel: 'high' } },
      },
    },
    audience: {
      audienceLocations: [{ country: 'USA', share: 0.6 }, { country: 'CAN', share: 0.1 }],
      audienceGender: { femaleRatio: 0.71 },
      audienceAvgAge: 29,
    },
    'content-detail': { recentReels: [{ description: 'Weeknight pasta' }] },
    sponsorship: { sponsorList: [{ brandName: 'Brand A', sponsoredPosts: [{}, {}] }] },
  });
  assert.equal(card.bio, 'Cooking studio and classes');
  assert.equal(card.engagementRate, '3.12%');
  assert.equal(card.medianLikes, 900);
  assert.equal(card.posts30d, 12);
  assert.deepEqual(card.audienceTop, ['USA 60%', 'CAN 10%']);
  assert.equal(card.audienceFemale, '71%');
  assert.deepEqual(card.sponsors, ['Brand A (2)']);
  assert.deepEqual(card.recent, ['Weeknight pasta']);
});

test('vetCard reads TikTok performance and marks sponsors unavailable', () => {
  const card = vetCard('tiktok', {
    uniqueId: 'creator.two',
    totalFollowers: 50000,
    performance: { videosPerformanceRecent: { views: { median: 30000 } } },
  });
  assert.equal(card.medianViews, 30000);
  assert.equal(card.sponsors, 'not available on TikTok');
  assert.equal(card.engagementRate, null);
});
