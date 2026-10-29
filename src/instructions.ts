/**
 * Server instructions, sent to every client at initialize. They explain how the data works so
 * any agent can search well, rather than prescribing a fixed workflow. Shared by the stdio
 * entry and the hosted connector so both say the same thing.
 */
export const SERVER_INSTRUCTIONS = [
  'CreatorDB indexes YouTube, Instagram and TikTok creators. Notes for finding the right ones:',
  '- Find creators with search_youtube, search_instagram and search_tiktok. Filters are exact and combined with AND. Do not use search_creators_nls to build a result list: it turns a sentence into filters in one pass and never checks the results, so they are often loose.',
  '- Apply only the requirements the user stated. Do not add a country, language, follower or engagement threshold the user did not ask for; if you assume one, say so.',
  '- Topic signals: `niches` (all platforms) and `topics` (YouTube) are AI classifications and take IDs from list_*_niches / list_youtube_topics (display names are converted automatically). `hashtags` match exact tags a creator used. Several searches with different signals usually find more good matches than one narrow search.',
  '- Location is country-level (ISO 3166-1 alpha-3, e.g. "USA"). There is no state or city data; tell the user instead of approximating it.',
  '- Check fit before presenting creators: pass `fields` on a search to add a short bio, niches, country and a few recent content items to each result, then drop creators that do not meet the request. If too few remain, search again with other terms.',
  '- When you answer, say what you searched for, any assumptions you made, and which parts of the request the data cannot check.',
  '- Every tool description states its credit cost. Search enrichment is billed per result returned, so keep pageSize modest when using `fields`.',
].join('\n');
