/**
 * Server instructions, sent to every client at initialize. They explain how the data works and
 * the search method that returns the most relevant creators: gather candidates broadly with
 * several searches, then keep only those whose own content shows they fit. Shared by the stdio
 * entry and the hosted connector so both say the same thing.
 */
export const SERVER_INSTRUCTIONS = [
  'CreatorDB indexes YouTube, Instagram and TikTok creators. Notes for finding the right ones:',
  '- Find creators with search_youtube, search_instagram and search_tiktok. This is the default for every creator request, including plain-language ones: turn the request into filters yourself. Filters are exact and combined with AND.',
  '- Do not call search_creators_nls unless the user explicitly asks for natural-language search (NLS) by name. Not as a first step, not alongside structured searches, and not as a fallback when searches return few or no results: it converts a sentence into filters in one pass and never checks the results, so they are often loose. When structured searches come up short, broaden or change the filters instead.',
  '- Apply only the requirements the user stated. Do not add a country, language, follower or engagement threshold the user did not ask for; if you assume one, say so.',
  '- Topic signals: `niches` (all platforms) and `topics` (YouTube) are AI classifications and take IDs from list_*_niches / list_youtube_topics (display names are converted automatically). `hashtags` match exact tags a creator used. No single signal captures a topic well, so one narrow search misses good creators.',
  '- Location is country-level (ISO 3166-1 alpha-3, e.g. "USA"). There is no state or city data; tell the user instead of approximating it.',
  'Search method: cast a wide net, then filter.',
  '1. Gather candidates with at least four searches (pageSize 30 each), each using a different signal for the topic: one whose `niches` filter lists many related niche IDs at once (an "in" filter matches any of them; include close variants and related niches, not just the literal term), one with related hashtags, and on YouTube one with topics.',
  '2. Do not let follower count decide who you see: sort at least one search by engagement rate and one by recent growth, not only by followers. If the request gives a size range, split it into 2-3 follower bands and search each band.',
  '3. Pass `fields` on these searches so each result shows what the creator actually posts, e.g. {"profile":["bio","niches","country","mainLanguage"],"content-detail":{"recentVideos":3}} (Instagram: recentReels or recentImages).',
  '4. Pool the results, drop duplicates, and keep only creators whose bio or recent content clearly shows the topic and who meet every stated requirement. Prefer creators that several searches found. If too few remain, search again with other terms.',
  'Keeping the user informed:',
  '- Before searching, tell the user your plan in one line and that a thorough search takes about 1-2 minutes.',
  '- After gathering candidates, send one short progress note (how many candidates, and that you are checking which fit).',
  '- If the user asks for results quickly ("quick", "fast", "just a few", "right away"), skip the full method: run one or two searches with `fields`, keep the clear fits, answer within a few tool calls, say it was a quick pass, and offer the thorough search.',
  '- If the user asks for results partway through, share the best candidates found so far and say which have been checked.',
  '- When you answer, say what you searched for, any assumptions you made, and which parts of the request the data cannot check.',
  '- Every tool description states its credit cost. `fields` enrichment is billed per result returned (about 0.7 credits per result for the example above), so a thorough search typically uses 50-150 credits.',
].join('\n');
