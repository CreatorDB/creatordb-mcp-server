/* Verify the GET->POST fractional switch against a target V3 API.
 * Usage: CREATORDB_API_BASE=<dev-url> CREATORDB_API_KEY=<dev-key> node scripts/verify-fractional.mjs
 * Optional test-id overrides: YT_ID, IG_ID, TT_ID.
 * Reads BASE_URL from the SAME built api-client the MCP uses (honors CREATORDB_API_BASE). */
const { callApi, BASE_URL } = await import('../dist/util/api-client.js');
const key = process.env.CREATORDB_API_KEY;
if (!key) { console.error('Set CREATORDB_API_KEY'); process.exit(1); }
const YT = process.env.YT_ID || 'UCX6OQ3DkcsbYNE6H8uQQuVA';        // MrBeast
const IG = process.env.IG_ID || 'cristiano';
const TT = process.env.TT_ID || 'mrbeast';
const PREFIX = process.env.CREATORDB_API_PREFIX || '';
console.log('Target BASE_URL:', BASE_URL, '| path prefix:', PREFIX || '(none)', '\n');

// [label, path, method, body|params]
const migrated = [
  ['YT profile','/youtube/profile','POST',{channelId:YT}],
  ['YT contact','/youtube/contact','POST',{channelId:YT}],
  ['YT performance','/youtube/performance','POST',{channelId:YT}],
  ['YT audience','/youtube/audience','POST',{channelId:YT}],
  ['YT content-detail','/youtube/content-detail','POST',{channelId:YT}],
  ['YT sponsorship','/youtube/sponsorship','POST',{channelId:YT}],
  ['IG profile','/instagram/profile','POST',{uniqueId:IG}],
  ['IG contact','/instagram/contact','POST',{uniqueId:IG}],
  ['IG performance','/instagram/performance','POST',{uniqueId:IG}],
  ['IG audience','/instagram/audience','POST',{uniqueId:IG}],
  ['IG content-detail','/instagram/content-detail','POST',{uniqueId:IG}],
  ['IG sponsorship','/instagram/sponsorship','POST',{uniqueId:IG}],
  ['TT profile','/tiktok/profile','POST',{uniqueId:TT}],
  ['TT contact','/tiktok/contact','POST',{uniqueId:TT}],
  ['TT performance','/tiktok/performance','POST',{uniqueId:TT}],
  ['TT audience','/tiktok/audience','POST',{uniqueId:TT}],
  ['TT content-detail','/tiktok/content-detail','POST',{uniqueId:TT}],
];
const controls = [
  ['YT perf-history (GET, unchanged)','/youtube/performance-history','GET',{channelId:YT,pastDayRange:'30'}],
];
const fractional = [
  ['YT profile fields=[country]','/youtube/profile','POST',{channelId:YT,fields:['country']}],
  ['YT profile fields=[country,mainLanguage]','/youtube/profile','POST',{channelId:YT,fields:['country','mainLanguage']}],
  ['IG profile fields=[country]','/instagram/profile','POST',{uniqueId:IG,fields:['country']}],
  ['TT profile fields=[country]','/tiktok/profile','POST',{uniqueId:TT,fields:['country']}],
];

async function run([label,path,method,payload]){
  try {
    const opts = method==='GET' ? {method,params:Object.fromEntries(Object.entries(payload).map(([k,v])=>[k,String(v)]))} : {method,body:payload};
    const r = await callApi(key, PREFIX + path, opts);
    const ok = r && r.success;
    console.log(`  ${ok?'PASS':'FAIL'}  ${label.padEnd(34)} success=${r?.success} creditsUsed=${r?.creditsUsed ?? '-'} err=${r?.errorCode||r?.error||''}`);
  } catch(e){ console.log(`  ERROR ${label.padEnd(34)} ${e.message}`); }
}
console.log('== MIGRATED (must be POST, expect success) =='); for(const t of migrated) await run(t);
console.log('\n== CONTROL (still GET) =='); for(const t of controls) await run(t);
console.log('\n== FRACTIONAL fields (dev has it live) =='); for(const t of fractional) await run(t);
