/* ============================================================
   Hollow Hub — servers.js
   Server list, live status sync engine, server cards, and the
   PvP tier board.

   ============================================================
   FIX #2 — servers "not syncing".
   The original code fired all ~90 status requests to mcsrvstat.us
   at once (Promise.all with no limit) on every 90s refresh. Public
   APIs like mcsrvstat rate-limit bursts like that, so most requests
   came back 429/blocked and servers were stuck on "loading"/"error".

   This version:
     1. Runs requests through a small concurrency-limited queue
        (6 at a time) instead of firing them all simultaneously.
     2. Skips re-fetching a server that was checked less than 45s
        ago, so refresh cycles don't restart work that's still fresh.
     3. Caches the last good result per-server in localStorage, so
        when you land on a *different page* of this multi-page site
        (servers.html, tiers.html, index.html are separate page
        loads, not one single-page app) you instantly see the last
        known status instead of a blank "loading" grid, while a
        background sync brings it fully up to date.
     4. On a failed request, keeps showing the last known-good data
        (marked stale) instead of wiping it to "error".
   ============================================================ */

const SCAPI = 'https://api.mcsrvstat.us/3';
/* Encode a "host" or "host:port" string for the status API path without
   escaping the colon — encodeURIComponent() turns ':' into %3A, and some
   reverse-proxy setups in front of the status API don't decode that back,
   so any address typed with a port ("1.2.3.4:25565") silently 404'd and
   showed as "couldn't reach that server" even when the server was fine. */
function mcAddrParam(addr){
  return addr.split(':').map(encodeURIComponent).join(':');
}
const SYNC_CONCURRENCY = 10;
const MIN_REFETCH_MS = 45000;      // don't re-hit a host more than once per 45s
const CACHE_KEY = 'hollow_srv_cache_v1';
const CACHE_MAX_AGE_MS = 15 * 60 * 1000; // ignore cache older than 15 min

const SERVERS=[
{n:'Hypixel',h:'mc.hypixel.net',t:'Minigames',c:'US',pvp:true},
{n:'DonutSMP',h:'donutsmp.net',t:'SMP',c:'US',pvp:true},
{n:'2b2t',h:'2b2t.org',t:'Anarchy',c:'US',pvp:true},
{n:'CubeCraft',h:'play.cubecraft.net',t:'Minigames',c:'GB',pvp:true},
{n:'Wynncraft',h:'play.wynncraft.com',t:'MMORPG',c:'FR',pvp:false},
{n:'The Hive',h:'play.hivemc.com',t:'Minigames',c:'GB',pvp:true},
{n:'MCC Island',h:'mccisland.net',t:'Minigames',c:'US',pvp:true},
{n:'ManaCube',h:'manacube.com',t:'Mixed',c:'US',pvp:true},
{n:'Pika Network',h:'play.pika-network.net',t:'PvP',c:'DE',pvp:true},
{n:'Complex Gaming',h:'hub.mc-complex.com',t:'Mixed',c:'US',pvp:true},
{n:'Purple Prison',h:'purpleprison.net',t:'Prison',c:'US',pvp:false},
{n:'Mineplex',h:'us.mineplex.com',t:'Minigames',c:'US',pvp:true},
{n:'MassiveCraft',h:'massivecraft.com',t:'RPG',c:'US',pvp:true},
{n:'NetherGames',h:'play.nethergames.org',t:'Minigames',c:'SG',pvp:true},
{n:'Lifeboat Network',h:'lbsg.net',t:'Minigames',c:'US',pvp:true},
{n:'Galaxite',h:'galaxite.net',t:'Minigames',c:'GB',pvp:true},
{n:'MunchyMC',h:'play.munchymc.com',t:'Factions',c:'GB',pvp:true},
{n:'OPLegends',h:'oplegends.com',t:'PvP',c:'US',pvp:true},
{n:'InPvP Network',h:'mc.inpvp.net',t:'PvP',c:'US',pvp:true},
{n:'Minemen Club',h:'minemen.club',t:'PvP',c:'US',pvp:true},
{n:'Brawl',h:'brawl.gg',t:'Minigames',c:'US',pvp:true},
{n:'CivMC',h:'civmc.net',t:'Civilization',c:'US',pvp:true},
{n:'9b9t',h:'9b9t.com',t:'Anarchy',c:'US',pvp:true},
{n:'Constantiam',h:'constantiam.net',t:'Anarchy',c:'US',pvp:true},
{n:'TotalFreedom',h:'totalfreedom.me',t:'Anarchy',c:'US',pvp:false},
{n:'EarthMC',h:'play.earthmc.net',t:'Geopolitics',c:'DE',pvp:true},
{n:'LordOfTheCraft',h:'lotc.co',t:'Roleplay',c:'US',pvp:false},
{n:'WesterosCraft',h:'mc.westeroscraft.com',t:'Roleplay',c:'US',pvp:false},
{n:'Sirus Network',h:'sirus.su',t:'Survival',c:'RU',pvp:true},
{n:'Advancius Network',h:'play.advancius.net',t:'Mixed',c:'NL',pvp:false},
{n:'SimplyVanilla',h:'play.simplyvanilla.net',t:'Vanilla',c:'US',pvp:false},
{n:'MinecraftOnline',h:'minecraftonline.com',t:'Anarchy',c:'US',pvp:true},
{n:'BlocksMC',h:'mc.blocksmc.com',t:'Minigames',c:'US',pvp:true},
{n:'Jartex Network',h:'jartexnetwork.com',t:'Mixed',c:'NL',pvp:true},
{n:'CosmicMC',h:'cosmicmc.net',t:'Prison',c:'US',pvp:true},
{n:'PvPWars',h:'pvpwars.net',t:'PvP',c:'US',pvp:true},
{n:'Vanilla SMP+',h:'vsmp.gg',t:'SMP',c:'US',pvp:false},
{n:'GommeHD',h:'gommehd.net',t:'Minigames',c:'DE',pvp:true},
{n:'PixelmonMod',h:'play.pixelmonmod.com',t:'Pixelmon',c:'US',pvp:false},
{n:'Archon Network',h:'archon.gg',t:'Factions',c:'US',pvp:true},
{n:'Kingdoms MC',h:'play.kingdomsmc.net',t:'Roleplay',c:'US',pvp:true},
{n:'Skyblock.net',h:'skyblock.net',t:'Skyblock',c:'US',pvp:false},
{n:'AthionMC',h:'athionmc.net',t:'Prison',c:'US',pvp:false},
{n:'Vetum Network',h:'play.vetum.net',t:'Practice',c:'US',pvp:true},
{n:'BadLion Club',h:'badlion.net',t:'PvP',c:'US',pvp:true},
{n:'FrostRealms',h:'frostrealms.net',t:'Survival',c:'US',pvp:false},
{n:'ExtremeCraft',h:'play.extremecraft.net',t:'Mixed',c:'US',pvp:true},
{n:'Vault Hunters SMP',h:'play.vaulthunters.gg',t:'Modded',c:'US',pvp:false},
{n:'Herobrine.org',h:'herobrine.org',t:'Mixed',c:'US',pvp:true},
{n:'MineSuperior',h:'mineclub.pl',t:'Mixed',c:'PL',pvp:true},
{n:'CrafteD Network',h:'play.crafted.network',t:'Mixed',c:'NL',pvp:true},
{n:'Foxy Craft',h:'play.foxycraft.net',t:'Survival',c:'US',pvp:false},
{n:'ManaPvP',h:'pvp.manacube.com',t:'PvP',c:'US',pvp:true},
{n:'BlockDrop',h:'blockdrop.net',t:'Minigames',c:'US',pvp:true},
{n:'Zentran',h:'play.zentran.net',t:'Skyblock',c:'US',pvp:false},
{n:'Hoplite Network',h:'hoplite.gg',t:'PvP',c:'US',pvp:true},
{n:'AshCraft',h:'ashcraft.us',t:'Survival',c:'US',pvp:false},
{n:'Grande MC',h:'play.grandemc.com',t:'Roleplay',c:'US',pvp:true},
{n:'Nova Skies',h:'play.novaskies.net',t:'Skyblock',c:'US',pvp:false},
{n:'PlayHive Bedrock',h:'geo.hivebedrock.network',t:'Minigames',c:'GB',pvp:true},
{n:'JoinMC',h:'joinmc.gg',t:'Mixed',c:'US',pvp:true},
{n:'RavenCraft',h:'ravencraft.gg',t:'Factions',c:'US',pvp:true},
{n:'BypassMC',h:'bypassmc.com',t:'Cracked',c:'US',pvp:true},
{n:'Fadecloud',h:'play.fadecloud.com',t:'Practice',c:'US',pvp:true},
{n:'Anti-World Government',h:'awg.gg',t:'Anarchy',c:'US',pvp:true},
{n:'Minehut Hub',h:'minehut.com',t:'Hosting Hub',c:'US',pvp:false},
{n:'Chunk',h:'chunk.gg',t:'Anarchy',c:'US',pvp:true},
{n:'Griefergames',h:'griefergames.net',t:'Anarchy',c:'DE',pvp:true},
{n:'Origin Realms',h:'originrealms.com',t:'SMP',c:'US',pvp:true},
{n:'Minr',h:'minr.org',t:'Survival',c:'US',pvp:true},
{n:'Vortex Network',h:'vortexnetwork.net',t:'Practice',c:'US',pvp:true},
{n:'Sylphs Network',h:'sylphs.co',t:'Practice',c:'US',pvp:true},
{n:'CosmicPvP',h:'cosmicpvp.com',t:'Practice',c:'US',pvp:true},
{n:'OG Network',h:'og-network.net',t:'Cracked',c:'US',pvp:true},
{n:'FunCraft',h:'play.funcraft.net',t:'Minigames',c:'DE',pvp:true},
{n:'MineYourMind',h:'play.mineyourmind.net',t:'Mixed',c:'GB',pvp:true},
{n:'Craftrise',h:'craftrise.com.tr',t:'Mixed',c:'TR',pvp:true},
{n:'Minewind',h:'minewind.com',t:'Anarchy',c:'US',pvp:true},
{n:'Meepcraft',h:'meepcraft.com',t:'Prison',c:'US',pvp:true},
{n:'CraftersLand',h:'play.craftersland.net',t:'Mixed',c:'RO',pvp:true},
];
SERVERS.forEach(s=>{s.data=null;s.lastSync=null;s.latency=null;s.status='loading'});

const COUNTRY_NAMES = {US:'United States',GB:'United Kingdom',FR:'France',DE:'Germany',NL:'Netherlands',RU:'Russia',PL:'Poland',SG:'Singapore',CA:'Canada',AU:'Australia',BR:'Brazil',MX:'Mexico',ES:'Spain',IT:'Italy',NZ:'New Zealand',ZA:'South Africa',EG:'Egypt',AE:'United Arab Emirates',UA:'Ukraine',PH:'Philippines',SE:'Sweden',NO:'Norway',FI:'Finland',DK:'Denmark',JP:'Japan',KR:'South Korea',HK:'Hong Kong',IN:'India',TR:'Turkey',RO:'Romania'};

/* ---------- flag rendering ----------
   Flag emoji don't render as pictures on Windows (no system font for
   them there — you just get plain letters), so flags use real image
   icons from flagcdn instead, which work identically everywhere. */
function flagImg(cc, size){
  if(!cc) return '';
  size = size || 18;
  const code = cc.toLowerCase();
  return `<img class="sc-flag-img" src="https://flagcdn.com/${size===18?'20x15':'28x21'}/${code}.png" width="${size===18?20:28}" alt="${esc(cc)}" title="${esc(COUNTRY_NAMES[cc]||cc)}" onerror="this.style.display='none'">`;
}

/* ---------- localStorage cache (shared across pages) ---------- */
function loadServerCache(){
  try{
    const raw = localStorage.getItem(CACHE_KEY);
    if(!raw)return;
    const obj = JSON.parse(raw);
    if(!obj||!obj.data)return;
    const stale = (Date.now()-obj.ts) > CACHE_MAX_AGE_MS;
    SERVERS.forEach(s=>{
      const c = obj.data[s.h];
      // Stale cache means "we don't know yet, a fresh check is about to run" —
      // not "this server is broken". Marking it 'error' here made the default
      // view (which hides non-online/non-loading servers) go blank until every
      // single server finished re-syncing. 'loading' keeps it visible in the
      // meantime, same as a first-ever visit.
      if(c){s.data=c.data;s.status=stale?'loading':c.status;s.latency=c.latency;s.lastSync=stale?null:c.lastSync}
    });
  }catch(e){}
}
function saveServerCache(){
  try{
    const data={};
    SERVERS.forEach(s=>{data[s.h]={data:s.data,status:s.status,latency:s.latency,lastSync:s.lastSync}});
    localStorage.setItem(CACHE_KEY, JSON.stringify({ts:Date.now(),data}));
  }catch(e){}
}

/* ---------- concurrency-limited task runner ---------- */
async function pMapLimit(items, limit, fn){
  let idx=0;
  const workers = new Array(Math.min(limit, items.length)).fill(0).map(async()=>{
    while(idx < items.length){
      const cur = idx++;
      try{ await fn(items[cur], cur) }catch(e){}
    }
  });
  await Promise.all(workers);
}

/* ---------- single-server fetch with graceful fallback ---------- */
async function fetchSrv(s, force){
  const now = Date.now();
  if(!force && s.lastSync && (now - s.lastSync) < MIN_REFETCH_MS && s.status!=='loading') return;
  const t0 = performance.now();
  try{
    const r = await fetchWithTimeout(SCAPI+'/'+mcAddrParam(s.h), null, 7000);
    const lat = Math.round(performance.now()-t0);
    if(r.status===429){ s.lastSync=now; return; }
    if(!r.ok) throw new Error('HTTP '+r.status);
    const data = await r.json();
    s.data = data;
    s.latency = lat;
    s.status = data.online ? 'online' : 'offline';
    s.lastSync = now;
  }catch(e){
    s.status = s.data ? s.status : 'error';
    s.lastSync = now;
  }
}

async function syncAllServers(force){
  await pMapLimit(SERVERS, SYNC_CONCURRENCY, s=>fetchSrv(s, force));
  saveServerCache();
}

/* ---------- rendering ---------- */
function srvHTML(s){
  const d=s.data, on=s.status==='online';
  const pl=on&&d&&d.players?d.players.online:null, mx=on&&d&&d.players?d.players.max:null;
  const pct=(pl!=null&&mx)?Math.round((pl/mx)*100):0;
  const ver=on&&d?(d.version||'—'):'—';
  const motd=on&&d&&d.motd&&d.motd.clean?d.motd.clean.join(' ').trim():(s.status==='error'?'Unavailable right now':'Offline');
  const icon=on&&d&&d.icon?`<img src="${esc(d.icon)}" alt="">`:`<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-family:'Space Grotesk';font-weight:600;color:var(--text-faint);font-size:12px">${esc(s.n.charAt(0))}</div>`;
  const isPop=on&&pl>=100;
  return `<div class="server-card glass ${on?'':'offline'}" data-host="${esc(s.h)}" onclick="openServerModal('${jsStr(s.h)}')"><div class="sc-top"><div><div class="sc-name-row">${flagImg(s.c)}<div class="sc-icon">${icon}</div><div><div class="sc-name-row"><span class="status-dot ${on?'':'off'}"></span><span class="sc-name">${esc(s.n)}</span>${isPop?'<span class="popular-tag">🔥 Popular</span>':''}</div><div class="sc-meta">${esc(s.t)}</div></div></div></div><div class="sc-sync">${s.status==='loading'?'…':(s.status==='error'?'<span style="color:var(--red)">unreachable</span>':timeAgo(s.lastSync))}</div></div><div class="sc-metrics"><div class="metric-box"><div class="metric-label">Players</div><div class="metric-value">${pl!=null?pl:'—'}<small>${mx?'/'+mx:''}</small></div></div><div class="metric-box"><div class="metric-label">Version</div><div class="metric-value mono" style="font-size:12px">${esc(ver)}</div></div><div class="metric-box"><div class="metric-label">Status</div><div class="metric-value" style="color:${on?'var(--mint)':'var(--text-faint)'};font-size:11px">${on?'Online':'Offline'}</div></div></div>${on?`<div class="players-bar-wrap"><div class="players-bar-labels"><span>capacity</span><span>${pct}%</span></div><div class="players-bar"><div class="players-bar-fill" style="width:${pct}%"></div></div></div>`:''}<div class="motd-line">${esc(motd)}</div><div class="sc-foot"><div class="ip-copy"><span class="mono">${esc(s.h)}</span><button onclick="event.stopPropagation();copyIP('${jsStr(s.h)}')">Copy</button></div></div></div>`;
}

/* ---------- click a server card to see a full popup with player list, MOTD, etc ---------- */
/* Custom-lookup results aren't part of the curated SERVERS list, so they're
   cached here by host too — this is what makes clicking a custom search
   result actually open its popup instead of silently doing nothing. */
const customServerCache = {};

function openServerModal(host){
  const s = SERVERS.find(x=>x.h===host) || customServerCache[host];
  if(!s || !s.data){ return; }
  renderServerModal(s);
}

function renderServerModal(s){
  const d = s.data, on = s.status==='online';
  const pl = on&&d.players?d.players.online:null, mx = on&&d.players?d.players.max:null;
  const motd = on&&d.motd&&d.motd.clean ? d.motd.clean.join(' ').trim() : 'Offline';
  let plHTML = '';
  if(on && d.players && d.players.list && d.players.list.length>0){
    plHTML = `<div class="sc-players"><div class="sc-players-head">Players online (${d.players.list.length}${pl>d.players.list.length?' of '+pl:''})</div><div class="sc-players-list">${d.players.list.map(p=>`<span class="sc-player-chip"><img src="https://crafatar.com/avatars/${encodeURIComponent(p.uuid||p.name)}?size=16&overlay" onerror="this.style.display='none'">${esc(p.name)}</span>`).join('')}</div></div>`;
  }else if(on && pl>0){
    plHTML = `<div class="sc-players"><div class="sc-no-players">${pl.toLocaleString()} player${pl===1?'':'s'} online — this server doesn't publish individual names.</div></div>`;
  }else if(on){
    plHTML = `<div class="sc-players"><div class="sc-no-players">No players online right now</div></div>`;
  }

  // Pull in every extra field mcsrvstat actually gives us for this server —
  // most servers won't expose all of these, so each row only shows if present.
  const metaRows = [];
  if(on && d.software) metaRows.push(['Software', d.software]);
  if(on && d.protocol) metaRows.push(['Protocol', d.protocol.name || d.protocol.version || '—']);
  if(on && d.map && (d.map.clean||d.map.raw)) metaRows.push(['Map', d.map.clean||d.map.raw]);
  if(on && d.hostname) metaRows.push(['Hostname', d.hostname]);
  if(on && d.port) metaRows.push(['Port', d.port]);
  if(on && d.gamemode) metaRows.push(['Gamemode', d.gamemode]);
  if(on && d.eula_blocked) metaRows.push(['EULA', 'Blocked ⚠']);
  const metaHTML = metaRows.length ? `<div class="proj-meta-grid" style="margin-bottom:14px">${metaRows.map(([l,v])=>`<div class="pm-item"><div class="pm-label">${esc(l)}</div><div class="pm-val">${esc(String(v))}</div></div>`).join('')}</div>` : '';

  const pluginNames = on && d.plugins && d.plugins.names ? d.plugins.names : null;
  const modNames = on && d.mods && d.mods.names ? d.mods.names : null;
  const listChips = (label, names) => names && names.length ? `<div style="margin-bottom:12px"><div class="pm-label" style="margin-bottom:6px">${esc(label)} (${names.length})</div><div class="card-tags">${names.slice(0,30).map(n=>`<span class="tag">${esc(typeof n==='string'?n:(n.name||''))}</span>`).join('')}${names.length>30?`<span class="tag">+${names.length-30} more</span>`:''}</div></div>` : '';

  const overlay = document.getElementById('modal-overlay');
  const body = document.getElementById('modal-body');
  if(!overlay || !body) return;
  body.innerHTML = `
    <div style="display:flex;align-items:center;gap:14px;margin-bottom:16px">
      <div style="width:52px;height:52px;border-radius:12px;overflow:hidden;background:rgba(255,255,255,.05);flex-shrink:0">${on&&d.icon?`<img src="${esc(d.icon)}" style="width:100%;height:100%;object-fit:cover">`:`<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-family:'Space Grotesk';font-weight:600;color:var(--text-faint)">${esc(s.n.charAt(0))}</div>`}</div>
      <div>
        <div style="display:flex;align-items:center;gap:7px"><span class="status-dot ${on?'':'off'}"></span><span style="font-family:'Space Grotesk';font-weight:600;font-size:17px">${esc(s.n)}</span>${s.c?flagImg(s.c,18):''}</div>
        <div class="card-author">${esc(s.t)} · v${esc(d.version||'—')}</div>
      </div>
    </div>
    <div class="sc-metrics" style="margin-bottom:14px">
      <div class="metric-box"><div class="metric-label">Players</div><div class="metric-value">${pl!=null?pl:'—'}<small>${mx?'/'+mx:''}</small></div></div>
      <div class="metric-box"><div class="metric-label">Version</div><div class="metric-value mono" style="font-size:12px">${esc(d.version||'—')}</div></div>
      <div class="metric-box"><div class="metric-label">Status</div><div class="metric-value" style="color:${on?'var(--mint)':'var(--text-faint)'};font-size:11px">${on?'Online':'Offline'}</div></div>
    </div>
    <div class="motd-line" style="margin-bottom:14px;white-space:normal">${esc(motd)}</div>
    ${metaHTML}
    ${listChips('Plugins', pluginNames)}
    ${listChips('Mods', modNames)}
    ${plHTML}
    <div class="sc-foot" style="margin-top:14px"><div class="ip-copy"><span class="mono">${esc(s.h)}</span><button onclick="copyIP('${jsStr(s.h)}')">Copy</button></div></div>
  `;
  overlay.classList.add('open');
}

/* ---------- pulse (home page top-5) ---------- */
function renderPulse(){
  const rows=document.getElementById('pulse-rows');if(!rows)return;
  const sorted=[...SERVERS].filter(s=>s.status==='online').sort((a,b)=>(b.data?.players?.online||0)-(a.data?.players?.online||0)).slice(0,5);
  if(!sorted.length){rows.innerHTML='<div style="text-align:center;padding:24px 0;color:var(--text-faint);font-size:11px">Syncing live servers…</div>';return}
  rows.innerHTML=sorted.map(s=>{
    const d=s.data,p=d.players?.online||0;
    return `<div class="prow"><div class="prow-l">${d.icon?`<img src="${esc(d.icon)}" alt="">`:`<div style="width:22px;height:22px;border-radius:5px;background:rgba(255,255,255,.05);display:flex;align-items:center;justify-content:center;font-size:9px;color:var(--text-faint)">${esc(s.n.charAt(0))}</div>`}<div><div class="prow-name">${esc(s.n)}</div><div class="prow-region">${esc(s.t)}</div></div></div><div class="prow-r"><span class="players-tag">${p}</span><span class="ping-tag ping-good">${esc(d.version||'')}</span></div></div>`;
  }).join('');
}

/* ---------- shared stats bar (home + servers page ONLY, per request) ---------- */
function updateStats(){
  let t=0,o=0;
  SERVERS.forEach(s=>{if(s.status==='online'&&s.data){t+=(s.data.players?.online||0);o++}});
  const set=(id,val)=>{const el=document.getElementById(id);if(el)el.textContent=val};
  set('servers-online-total', t.toLocaleString());
  set('servers-count', String(o));
  set('stat-online', t.toLocaleString());
  set('stat-servers', String(SERVERS.length));
  set('nav-live-count', t.toLocaleString());
}

/* ---------- custom server lookup ---------- */
async function queryCustom(){
  const input=document.getElementById('custom-ip'), res=document.getElementById('custom-result');
  let ip=input.value.trim().replace(/^https?:\/\//i,'').replace(/\/+$/,'');
  if(!ip){toast('Enter a server address','red');return}
  res.innerHTML=`<div style="color:var(--text-faint);font-size:11.5px;display:flex;align-items:center;gap:6px"><div class="ver-spinner" style="width:13px;height:13px;border-width:2px"></div>Querying ${esc(ip)}…</div>`;
  try{
    const t0=performance.now();
    const r=await fetchWithTimeout(SCAPI+'/'+mcAddrParam(ip), null, 10000);
    const lat=Math.round(performance.now()-t0);
    if(!r.ok)throw new Error('The status service returned an error (HTTP '+r.status+')');
    const data=await r.json();
    if(data.online===false && data.debug && data.debug.error){
      throw new Error("That address doesn't look reachable — double check the IP or domain and port.");
    }
    const fake={n:data.motd?.clean?.[0]||ip,h:ip,t:'Custom server',c:null,data,latency:lat,status:data.online?'online':'offline',lastSync:Date.now(),pvp:false};
    customServerCache[ip] = fake;
    res.innerHTML=srvHTML(fake);
    toast(data.online?'Found — server is online':'Found — server is offline',data.online?'mint':'default');
  }catch(e){
    const msg = e.name==='AbortError' ? 'The status service took too long to respond — try again in a moment.' : e.message;
    res.innerHTML=`<div style="padding:12px;border-radius:10px;background:rgba(242,114,92,.08);border:1px solid rgba(242,114,92,.15);text-align:center"><span style="color:var(--red);font-size:12px">Couldn't reach that server</span><br><span style="color:var(--text-faint);font-size:10px">${esc(msg)}</span></div>`;
  }
}

/* ---------- servers page: filter, sort, hide-offline, pagination ---------- */
let activeSrvType=null, srvPage=1, srvSort='players_desc', showOffline=false;

function getFiltered(){
  let l = SERVERS;
  if(activeSrvType) l = l.filter(s=>s.t===activeSrvType);
  if(!showOffline) l = l.filter(s=>s.status==='online' || s.status==='loading');
  const online = (s)=> s.data?.players?.online || 0;
  switch(srvSort){
    case 'players_asc': l=[...l].sort((a,b)=>online(a)-online(b)); break;
    case 'name_asc': l=[...l].sort((a,b)=>a.n.localeCompare(b.n)); break;
    case 'name_desc': l=[...l].sort((a,b)=>b.n.localeCompare(a.n)); break;
    case 'popular': l=[...l].filter(s=>online(s)>=100).sort((a,b)=>online(b)-online(a)); break;
    case 'recently_synced': l=[...l].sort((a,b)=>(b.lastSync||0)-(a.lastSync||0)); break;
    case 'players_desc': default: l=[...l].sort((a,b)=>online(b)-online(a)); break;
  }
  return l;
}
function buildSrvFilter(){
  const c=document.getElementById('server-type-filters');if(!c)return;
  c.innerHTML='<span class="label">Type</span>';
  const types=[...new Set(SERVERS.map(s=>s.t))].sort();
  const all=document.createElement('button');all.className='chip'+(activeSrvType===null?' active':'');all.textContent='All';all.onclick=()=>{activeSrvType=null;loadServersPage(1)};c.appendChild(all);
  types.forEach(t=>{const b=document.createElement('button');b.className='chip small'+(activeSrvType===t?' active':'');b.textContent=t;b.onclick=()=>{activeSrvType=t;loadServersPage(1)};c.appendChild(b)});
}
function offlineCount(){ return SERVERS.filter(s=>s.status!=='online'&&s.status!=='loading').length }
function toggleShowOffline(cb){ showOffline = cb.checked; loadServersPage(1) }
function setSrvSort(v){ srvSort = v; loadServersPage(1) }
let srvRenderGen = 0;
async function loadServersPage(page){
  if(page!==undefined)srvPage=page;
  const myGen = ++srvRenderGen;
  const grid=document.getElementById('servers-grid');if(!grid)return;
  const pgEl=document.getElementById('servers-pagination');if(pgEl)pgEl.innerHTML='';
  buildSrvFilter();
  const offToggleLabel = document.getElementById('offline-toggle-label');
  if(offToggleLabel) offToggleLabel.textContent = `Show offline (${offlineCount()})`;
  const filtered=getFiltered(); const pp=getPageSize(); const start=(srvPage-1)*pp; const pageList=filtered.slice(start,start+pp);
  grid.innerHTML = pageList.length ? pageList.map(s=>srvHTML(s)).join('') : `<div class="empty"><b>${showOffline?'No servers match':'All matching servers are offline right now'}</b>${showOffline?'Try a different filter.':'Tick "show offline" to see them anyway.'}</div>`;
  renderPg('servers-pagination',filtered.length,srvPage,pp,p=>loadServersPage(p));
  updateStats();
  await pMapLimit(pageList, SYNC_CONCURRENCY, s=>fetchSrv(s));
  saveServerCache();
  // If the user paged/filtered/sorted again while this sync was still running,
  // this result is stale — applying it now would silently replace whatever
  // they're currently looking at with the wrong page's servers.
  if(myGen !== srvRenderGen) return;
  const refreshed = getFiltered().slice(start,start+pp);
  grid.innerHTML = refreshed.length ? refreshed.map(s=>srvHTML(s)).join('') : `<div class="empty"><b>${showOffline?'No servers match':'All matching servers are offline right now'}</b>${showOffline?'Try a different filter.':'Tick "show offline" to see them anyway.'}</div>`;
  updateStats();
}

async function refreshServers(){
  const btn = document.getElementById('refresh-btn');
  const original = btn ? btn.innerHTML : null;
  if(btn){ btn.disabled = true; btn.innerHTML = '<span class="ver-spinner" style="width:12px;height:12px;border-width:2px;margin:0 6px 0 0;display:inline-block;vertical-align:middle"></span>Syncing…' }
  await syncAllServers(true);
  renderPulse();updateStats();
  if(document.getElementById('servers-grid')) loadServersPage(srvPage);
  const clock=document.getElementById('pulse-clock');if(clock)clock.textContent='synced now';
  const onlineCount = SERVERS.filter(s=>s.status==='online').length;
  toast(`Synced — ${onlineCount} of ${SERVERS.length} servers online`, 'mint');
  if(btn){ btn.disabled = false; btn.innerHTML = original }
}

/* ---------- boot sequence shared by every page that needs server data ---------- */
function initServerSync(opts){
  opts = opts || {};
  loadServerCache();
  if(opts.onData) opts.onData();
  syncAllServers(false).then(()=>{ if(opts.onData) opts.onData(); });
  setInterval(()=>{ syncAllServers(false).then(()=>{ if(opts.onData) opts.onData(); }); }, 60000);
}
