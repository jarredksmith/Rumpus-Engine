// Publishes a community-level submission (a GitHub issue from submit-level.yml) into community/.
// Run by .github/workflows/publish-level.yml when the maintainer labels the issue `approved`.
// Import-safe: the test suite imports parseIssue/validateSubmission directly; main() only runs in CI.
import { readFileSync, writeFileSync } from 'fs';
import { appendFileSync } from 'fs';

const LIMITS = { json: 400_000, name: 60, author: 40, desc: 200 };

// The issue-form body renders as "### <field label>\n\n<value>" sections; the JSON textarea
// (render: json) arrives fenced. Returns { name, author, desc, json } (raw strings, untrimmed sizes capped later).
export function parseIssue(body){
  const out = { name:'', author:'', desc:'', json:'' };
  const sections = String(body||'').split(/^### +/m).slice(1);
  for(const s of sections){
    const nl = s.indexOf('\n');
    const head = (nl<0 ? s : s.slice(0,nl)).trim().toLowerCase();
    let val = (nl<0 ? '' : s.slice(nl+1)).trim();
    if(val === '_No response_') val = '';
    if(head.startsWith('level name')) out.name = val;
    else if(head.startsWith('your name')) out.author = val;
    else if(head.startsWith('description')) out.desc = val;
    else if(head.startsWith('level json')){
      const fence = val.match(/^```[a-z]*\s*\n([\s\S]*?)\n?```\s*$/);
      out.json = (fence ? fence[1] : val).trim();
    }
  }
  return out;
}

const _plain = (s, max)=>String(s||'').replace(/[<>`*_[\]#|]/g,'').replace(/\s+/g,' ').trim().slice(0,max);

// Validates a parsed submission. Returns { ok:true, entry, level } or { ok:false, reason }.
export function validateSubmission(parsed, issueNumber){
  const name = _plain(parsed.name, LIMITS.name);
  const author = _plain(parsed.author, LIMITS.author);
  const desc = _plain(parsed.desc, LIMITS.desc);
  if(!name) return { ok:false, reason:'the **Level name** field is empty' };
  if(!author) return { ok:false, reason:'the **Your name** field is empty' };
  if(!parsed.json) return { ok:false, reason:'the **Level JSON** field is empty — in the game: editor → Save tab → Submit to community library copies it' };
  if(parsed.json.length > LIMITS.json) return { ok:false, reason:`the level JSON is ${parsed.json.length.toLocaleString()} bytes — the library caps levels at ${LIMITS.json.toLocaleString()}` };
  let level;
  try{ level = JSON.parse(parsed.json); }
  catch(e){ return { ok:false, reason:'the level JSON does not parse ('+e.message.slice(0,120)+') — paste it exactly as the game copied it' }; }
  if(!level || typeof level!=='object' || Array.isArray(level) || (!level.props && !level.world))
    return { ok:false, reason:'that JSON is not a BREACH level (no `props`/`world` keys) — use Submit to community library or Export .json' };
  // build 854: the game embeds a screenshot as `thumb` — lift it into the gallery index and strip it
  // from the level file itself (players fetch the index constantly; the level only on Play).
  const thumb = (typeof level.thumb==='string' && /^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(level.thumb) && level.thumb.length <= 100_000) ? level.thumb : '';
  delete level.thumb;
  const sketchfab = JSON.stringify(level).includes('sketchfab:');   // those models need the player's own token
  const slug = (name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,40) || 'level') + '-' + issueNumber;
  const entry = {
    file: slug + '.json',
    name, author,
    ...(desc ? { desc } : {}),
    objective: (level.game && level.game.objective) || 'eliminate',
    date: new Date().toISOString().slice(0,10),
    ...(sketchfab ? { sketchfab: true } : {}),
    ...(thumb ? { thumb } : {}),
  };
  return { ok:true, entry, level };
}

function main(){
  const issueNumber = parseInt(process.env.ISSUE_NUMBER, 10);
  const body = process.env.ISSUE_BODY || '';
  const setOut = (k,v)=>appendFileSync(process.env.GITHUB_OUTPUT, `${k}<<__EOV__\n${v}\n__EOV__\n`);
  const res = validateSubmission(parseIssue(body), issueNumber);
  if(!res.ok){ setOut('ok','false'); setOut('reason', res.reason); console.log('rejected:', res.reason); return; }
  writeFileSync('community/levels/' + res.entry.file, JSON.stringify(res.level));
  const idx = JSON.parse(readFileSync('community/index.json','utf8'));
  idx.levels = [res.entry, ...(idx.levels||[]).filter(l=>l.file!==res.entry.file)];
  idx.updated = res.entry.date;
  writeFileSync('community/index.json', JSON.stringify(idx, null, 2) + '\n');
  setOut('ok','true'); setOut('name', res.entry.name); setOut('file', res.entry.file);
  console.log('published:', res.entry.file);
}

if(process.env.GITHUB_ACTIONS === 'true') main();
