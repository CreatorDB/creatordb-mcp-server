/**
 * Server instructions, sent to every client at initialize. They explain how the data works and
 * the search method that returns the most relevant creators: gather candidates broadly with
 * several searches, then keep only those whose own content shows they fit. Shared by the stdio
 * entry and the hosted connector so both say the same thing.
 *
 * Some clients show a model only the first 4,096 characters of server instructions, so the text
 * stays under INSTRUCTIONS_MAX_LENGTH. Guidance that belongs to one tool goes in that tool's
 * description.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * The package version, read from this package's own package.json (one directory up from dist/),
 * so the instructions always name the version that is actually running.
 */
export const SERVER_VERSION: string = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json'), 'utf8'),
).version;

/** Longest instructions text that every client passes to the model in full. */
export const INSTRUCTIONS_MAX_LENGTH = 4096;

export const SERVER_INSTRUCTIONS = [
  `This is CreatorDB MCP server version ${SERVER_VERSION}. If the user asks which version they are using, give this number.`,
  'CreatorDB indexes YouTube, Instagram and TikTok creators.',
  '- Find creators with search_youtube, search_instagram and search_tiktok: turn the request into filters yourself (filters are exact and combined with AND). Use search_creators_nls only when the user asks for natural-language search (NLS) by name, never as a first step or a fallback. When searches come up short, broaden or change the filters.',
  '- Apply only the requirements the user stated. Do not add a country, language, follower or engagement threshold of your own; if you assume one, say so.',
  '- Topic signals: `niches` and `topics` are AI classifications and take IDs from list_*_niches / list_*_topics. `hashtags` match exact tags a creator used. No single signal captures a topic well, so one narrow search misses good creators.',
  '- Location is country-level (ISO 3166-1 alpha-3, e.g. "USA"). There is no state or city data; tell the user instead of approximating it.',
  '- Past work with a brand ("has worked with X"): first run a creator search with the brand\'s own hashtags (e.g. #brandname or #brandnamepartner) in `hashtags`. Then, if you need more, use content search (search_*_content) on those hashtags, starting with the default 30-day window.',
  'Search method: cast a wide net, then filter.',
  '1. Tell the user your plan in one line and that a thorough search takes about 1-2 minutes.',
  '2. Run at least four searches (pageSize 30) together in one turn, each on a different signal for the topic: a `niches` "in" filter listing many related niche IDs (close variants too), related hashtags, and on YouTube topics. Sort one by engagement rate and one by recent growth, not only by followers. Split a stated size range into 2-3 follower bands and search each.',
  '3. Pass `fields` on these searches so each result shows what the creator actually posts, e.g. {"profile":["bio","niches","country","mainLanguage"],"content-detail":{"recentVideos":3}} (Instagram: recentReels or recentImages).',
  '4. When the first results are back, share a preview of up to 5 creators that clearly fit, labelled as a preview, and say you are still checking more.',
  '5. Pool the results, drop duplicates, and keep only creators whose bio or recent content clearly shows the topic and who meet every stated requirement. Prefer creators that several searches found. To check what search results do not show (audience, engagement, sponsors), call vet_creators ONCE with the whole shortlist, not get_* tools per creator.',
  '6. List only clear fits; do not pad the list. If the user asked for a number of creators, stop once you have that many. Say how many clear fits you found and what limited it. If too few remain, search again with other terms.',
  'Quick requests ("quick", "fast", "just a few"): in one turn call list_<platform>_niches for every requested platform; in the next turn run two searches per platform with `fields` (one on all related niche IDs, one on related hashtags sorted by engagement rate); keep the clear fits. Search one more round only if fewer than 3 per platform remain. Say it was a quick pass and offer the thorough search.',
  'Presenting creators: give platform, display name, @handle, a profile link (Instagram https://www.instagram.com/<handle>, TikTok https://www.tiktok.com/@<handle>, YouTube https://www.youtube.com/@<handle>, or https://www.youtube.com/channel/<channelId> when there is no handle), the follower or subscriber count and one line on why they fit. Handles may come back with a leading @; never double it. Say what you searched for, any assumptions you made, and which parts of the request the data cannot check.',
  'Credits: every tool description states its cost. `fields` enrichment is billed per result returned (about 0.7 credits per result for the example above), so a thorough search typically uses 50-150 credits.',
].join('\n');
