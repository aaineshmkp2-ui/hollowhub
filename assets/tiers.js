/* ============================================================
   Hollow Hub — tiers.js
   PvP Tiers: kit category nav + live player tier lookup.
   ============================================================ */

/* Real item icons (uploaded) for the 8 combat kits; Overall and LTMs
   don't correspond to a single item so they keep a simple drawn glyph. */
const KIT_IMG = {
  vanilla:'assets/icons/vanilla.svg',
  uhc:'assets/icons/uhc.svg',
  pot:'assets/icons/pot.svg',
  nethop:'assets/icons/nethop.svg',
  smp:'assets/icons/smp.svg',
  sword:'assets/icons/sword.svg',
  axe:'assets/icons/axe.svg',
  mace:'assets/icons/mace.svg',
};
const KIT_GLYPH = {
  overall: '<path d="M8 21h8M12 17v4M7 4h10v3a5 5 0 0 1-10 0V4z"/><path d="M7 5H4a2 2 0 0 0 2 4M17 5h3a2 2 0 0 1-2 4"/>',
  ltms:    '<circle cx="12" cy="13" r="7"/><path d="M12 9v4l2.5 2.5M9 2h6"/>',
};
const KIT_META = {
  overall: {label:'Overall', slug:'overall'},
  ltms:    {label:'LTMs',    slug:'ltm'},
  vanilla: {label:'Vanilla', slug:'vanilla'},
  uhc:     {label:'UHC',     slug:'uhc'},
  pot:     {label:'Pot',     slug:'pot'},
  nethop:  {label:'NethOP',  slug:'nethop'},
  smp:     {label:'SMP',     slug:'smp'},
  sword:   {label:'Sword',   slug:'sword'},
  axe:     {label:'Axe',     slug:'axe'},
  mace:    {label:'Mace',    slug:'mace'},
};
/* Some kit keys come back from the rankings API under slightly different
   names — map every known alias onto our canonical KIT_META key. */
const KIT_ALIASES = {
  overall:'overall',
  ltm:'ltms', ltms:'ltms', diapot:'ltms',
  vanilla:'vanilla',
  uhc:'uhc',
  pot:'pot', crystal:'pot',
  nethop:'nethop', nethpot:'nethop',
  smp:'smp',
  sword:'sword',
  axe:'axe',
  mace:'mace',
};
const KIT_ORDER = Object.keys(KIT_META);

function kitIcon(kitKey, size){
  size = size || 22;
  const norm = KIT_ALIASES[(kitKey||'').toLowerCase()] || null;
  if(norm && KIT_IMG[norm]) return `<img src="${KIT_IMG[norm]}" width="${size}" height="${size}" alt="" style="width:${size}px;height:${size}px;object-fit:contain">`;
  const d = norm ? KIT_GLYPH[norm] : '<circle cx="12" cy="12" r="8"/>';
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
}

function renderKitCategories(){
  const c = document.getElementById('kit-cat-row');
  if(!c) return;
  c.innerHTML = KIT_ORDER.map(k=>{
    const m = KIT_META[k];
    return `<a class="kit-cat-chip" href="https://mctiers.com/rankings/${m.slug}" target="_blank" rel="noopener"><span class="kcc-icon">${kitIcon(k,18)}</span>${m.label}</a>`;
  }).join('');
}

function tierInfo(v){
  if(v==null) return {text:'Unranked', cls:'tier-d'};
  const tierNum = v.tier ?? v;
  const cls = tierNum<=1?'tier-s':tierNum<=2?'tier-a':tierNum<=3?'tier-b':tierNum<=4?'tier-c':'tier-d';
  const pos = v.pos===0 ? 'High' : 'Low';
  const posShort = v.pos===0 ? 'HT' : 'LT';
  return {text:`${pos} Tier ${tierNum}`, short:`${posShort}${tierNum}`, cls};
}
const TIER_COLOR = {'tier-s':'#ff7eb3','tier-a':'#ff6b6b','tier-b':'#f7c56b','tier-c':'#74b9ff','tier-d':'#565d6e'};

async function lookupPlayer(){
  const input = document.getElementById('mct-username');
  const resultBox = document.getElementById('mct-result');
  const name = input.value.trim();
  if(!name){ toast('Enter a Minecraft username','red'); return; }
  resultBox.style.display = 'block';
  resultBox.innerHTML = `<div class="ver-loading"><div class="ver-spinner"></div>Looking up ${esc(name)}…</div>`;
  try{
    const pd = await mFetchRaw(`https://playerdb.co/api/player/minecraft/${encodeURIComponent(name)}`);
    if(!pd || !pd.success || !pd.data || !pd.data.player) throw new Error('Player not found');
    const player = pd.data.player;
    const uuid = (player.id || player.raw_id || '').replace(/-/g,'');
    const avatar = player.avatar || `https://crafatar.com/avatars/${uuid}?overlay`;

    const ranks = await mFetchRaw(`https://mctiers.com/api/rankings/${uuid}`);
    let badgesHTML = '';
    let entriesCount = 0;
    let overallLine = '';
    if(ranks && typeof ranks === 'object' && Object.keys(ranks).length){
      const entries = Object.entries(ranks).sort((a,b)=>{
        const ka = KIT_ALIASES[a[0].toLowerCase()] || a[0].toLowerCase(), kb = KIT_ALIASES[b[0].toLowerCase()] || b[0].toLowerCase();
        const ia = KIT_ORDER.indexOf(ka), ib = KIT_ORDER.indexOf(kb);
        return (ia===-1?99:ia) - (ib===-1?99:ib);
      });
      entriesCount = entries.length;

      // Overall gets pulled out into its own "position" strip, like mctiers does,
      // instead of being just another badge in the row.
      const overallEntry = entries.find(([k])=> (KIT_ALIASES[k.toLowerCase()]||k.toLowerCase())==='overall');
      if(overallEntry && overallEntry[1]){
        const ov = overallEntry[1];
        const parts = [];
        if(ov.pos!=null || ov.position!=null) parts.push('#'+(ov.pos ?? ov.position));
        if(ov.points!=null) parts.push(ov.points+' points');
        overallLine = `<div class="player-position"><span class="pp-icon">🏆</span><span class="pp-label">Overall</span>${parts.length?`<span class="pp-val">${parts.join(' · ')}</span>`:''}</div>`;
      }

      badgesHTML = entries.filter(([k])=> (KIT_ALIASES[k.toLowerCase()]||k.toLowerCase())!=='overall').map(([kit, v])=>{
        const t = tierInfo(v);
        const retired = v && v.retired;
        const norm = KIT_ALIASES[kit.toLowerCase()];
        const label = norm ? KIT_META[norm].label : kit;
        const color = TIER_COLOR[t.cls];
        return `<div class="tier-cell ${retired?'retired':''}" title="${esc(label)} — ${esc(t.text)}${retired?' (retired)':''}">
          <div class="tc-icon-ring" style="border-color:${color}">${kitIcon(kit,26)}</div>
          <div class="tc-code" style="color:${color};background:${color}1f">${t.short}</div>
          <div class="tc-label">${esc(label)}</div>
        </div>`;
      }).join('');
    }

    resultBox.innerHTML = `
      <div class="player-result">
        <div class="player-head">
          <img src="${avatar}" onerror="this.style.display='none'" alt="">
          <div>
            <div class="p-name">${esc(player.username||name)}</div>
            <div class="card-author">${entriesCount} ranked kit${entriesCount===1?'':'s'}</div>
          </div>
          <a class="chip namemc-link" href="https://namemc.com/profile/${encodeURIComponent(player.username||name)}" target="_blank" rel="noopener">NameMC ↗</a>
        </div>
        ${overallLine}
        ${badgesHTML ? `<div class="tier-board">${badgesHTML}</div>` : `<div class="empty" style="padding:24px"><b>No ranked kits yet</b>This player hasn't been tier-tested, or has no public ranking data.</div>`}
        <div style="margin-top:16px;text-align:center"><a href="https://mctiers.com/player/${uuid}" target="_blank" rel="noopener" class="chip" style="display:inline-flex">View full profile ↗</a></div>
      </div>`;
  }catch(e){
    resultBox.innerHTML = `<div class="empty"><b>Couldn't find that player</b>Double check the username, or they may not have a ranking yet.</div>`;
  }
}

async function mFetchRaw(url){
  const r = await fetchWithTimeout(url, null, 9000);
  if(!r.ok) throw new Error('HTTP '+r.status);
  return r.json();
}

function initTiersPage(){
  renderKitCategories();
  document.getElementById('mct-lookup-btn')?.addEventListener('click', lookupPlayer);
  document.getElementById('mct-username')?.addEventListener('keydown', e=>{ if(e.key==='Enter') lookupPlayer(); });
}
document.addEventListener('DOMContentLoaded', initTiersPage);
