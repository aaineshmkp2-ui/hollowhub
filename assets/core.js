/* ============================================================
   Hollow Hub — core.js
   Shared utilities used on every page: toasts, modal, Modrinth
   API helpers, card rendering, pagination, and the download fix.
   ============================================================ */

const MAPI = 'https://api.modrinth.com/v2';
const POP_DL = 400000;
let debT = null;

/* ---------- small helpers ---------- */
function esc(s){
  s = s==null ? '' : String(s);
  return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
/* Safe for embedding untrusted text inside an inline event-handler's JS string,
   e.g. onclick="foo('${jsStr(x)}')". HTML-attribute-escaping alone (esc()) is
   NOT enough here — the browser HTML-decodes the attribute value before
   parsing it as JS, so an apostrophe encoded as &#39; would decode back to a
   real quote and still break out of the string. This escapes backslashes and
   quotes for the JS layer, then quotes for the HTML-attribute layer. */
function jsStr(s){
  s = s==null ? '' : String(s);
  return s.replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
/* Only allow http/https through to an href/src — blocks javascript:, data:,
   and similar schemes that a compromised or malicious feed/API response
   could otherwise smuggle in to run on click. */
function safeUrl(u){
  try{
    const parsed = new URL(u, location.href);
    return (parsed.protocol==='http:'||parsed.protocol==='https:') ? parsed.href : '#';
  }catch(e){ return '#'; }
}
function fmt(n){if(n==null)return'—';if(n>=1e6)return(n/1e6).toFixed(1).replace(/\.0$/,'')+'M';if(n>=1e3)return(n/1e3).toFixed(1).replace(/\.0$/,'')+'k';return n.toString()}
function timeAgo(t){if(!t)return'—';const s=Math.floor((Date.now()-t)/1000);if(s<5)return'now';if(s<60)return s+'s ago';if(s<3600)return Math.floor(s/60)+'m ago';return Math.floor(s/3600)+'h ago'}
function pingC(p){if(p==null)return'';return p<80?'ping-good':p<150?'ping-ok':'ping-bad'}
function debounced(fn,d){clearTimeout(debT);debT=setTimeout(fn,d||350)}

/* ---------- nav active-state (flat multi-page site, no SPA routing) ---------- */
(function highlightNav(){
  let file=(location.pathname.split('/').pop()||'').toLowerCase();
  if(file===''||file==='index.html') file='home.html';
  document.querySelectorAll('nav.primary a').forEach(a=>{
    const href=(a.getAttribute('href')||'').toLowerCase();
    if(href===file) a.classList.add('active');
  });
})();

/* ---------- toasts ---------- */
function toast(m,k){
  k=k||'default';const c={default:'var(--text)',mint:'var(--mint)',red:'var(--red)'};
  const w=document.getElementById('toast-wrap');if(!w)return;
  const e=document.createElement('div');e.className='toast glass';e.style.color=c[k]||c.default;e.innerHTML=m;
  w.appendChild(e);setTimeout(()=>{e.classList.add('fade');setTimeout(()=>e.remove(),300)},2600);
}

/* ---------- modal ---------- */
function closeModal(){const o=document.getElementById('modal-overlay');if(o)o.classList.remove('open')}
document.addEventListener('DOMContentLoaded',()=>{
  const ov=document.getElementById('modal-overlay');
  if(ov)ov.addEventListener('click',e=>{if(e.target.id==='modal-overlay')closeModal()});
});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal()});

/* ---------- copy IP ---------- */
function copyIP(ip){
  const done=()=>toast(`Copied <span class="mono">${esc(ip)}</span>`,'mint');
  if(navigator.clipboard&&window.isSecureContext){navigator.clipboard.writeText(ip).then(done).catch(()=>fallbackCopy(ip,done))}
  else fallbackCopy(ip,done);
}
function fallbackCopy(text,done){
  const ta=document.createElement('textarea');ta.value=text;ta.style.position='fixed';ta.style.opacity='0';
  document.body.appendChild(ta);ta.select();
  try{document.execCommand('copy');done&&done()}catch(e){toast('Copy failed — select manually','red')}
  ta.remove();
}

/* ============================================================
   FIX #1 — real file downloads.
   The <a download> attribute is silently ignored by browsers for
   cross-origin URLs (Modrinth's CDN is a different origin), so it
   was just navigating to the file / opening a blank tab with the
   filename instead of saving it. We now fetch the file ourselves
   and save it as a Blob, which forces a real download every time,
   with a same-tab fallback only if the fetch is blocked.
   ============================================================ */
async function forceDownload(url, filename, btn){
  const originalHTML = btn ? btn.innerHTML : null;
  if(btn){btn.classList.add('busy');btn.innerHTML='⬇ Starting…'}
  try{
    const res = await fetchWithTimeout(url, {mode:'cors'}, 30000);
    if(!res.ok) throw new Error('HTTP '+res.status);

    // Stream the body ourselves so we can show real progress — the previous
    // version just awaited res.blob() with no feedback at all, so on
    // anything bigger than a couple MB the button sat on "Downloading…"
    // looking stalled for a while before anything visibly happened.
    const total = parseInt(res.headers.get('content-length')||'0', 10);
    let loaded = 0;
    const chunks = [];
    if(res.body && res.body.getReader){
      const reader = res.body.getReader();
      while(true){
        const {done, value} = await reader.read();
        if(done) break;
        chunks.push(value);
        loaded += value.length;
        if(btn){
          btn.innerHTML = total ? `⬇ ${Math.round((loaded/total)*100)}%` : `⬇ ${(loaded/1048576).toFixed(1)}MB`;
        }
      }
    }
    const blob = chunks.length ? new Blob(chunks) : await res.blob();
    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objUrl;
    a.download = filename || 'download';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(()=>URL.revokeObjectURL(objUrl), 5000);
    toast(`Downloaded <span class="mono">${esc(filename||'file')}</span>`,'mint');
  }catch(e){
    // Last-resort fallback: open the direct CDN link so the user can still get the file
    toast('Direct download blocked — opening file link','red');
    window.open(url, '_blank', 'noopener');
  }finally{
    if(btn){btn.classList.remove('busy');if(originalHTML)btn.innerHTML=originalHTML}
  }
}

/* ---------- Modrinth fetch/search ---------- */
/* Every network call in the site should go through this instead of raw
   fetch() — a plain fetch() has no timeout at all, so one slow/unresponsive
   host (a dead server, an overloaded API) can hang for a very long time and
   make the whole page feel stuck. This aborts and lets the caller's
   catch/fallback logic take over instead. */
async function fetchWithTimeout(url, opts, ms){
  const ctrl = new AbortController();
  const id = setTimeout(()=>ctrl.abort(), ms||10000);
  try{
    return await fetch(url, {...(opts||{}), signal: ctrl.signal});
  }finally{
    clearTimeout(id);
  }
}
async function mFetch(u){
  const r = await fetchWithTimeout(u, {headers:{Accept:'application/json'}}, 12000);
  if(!r.ok) throw new Error('HTTP '+r.status);
  return r.json();
}
async function mSearch({query='',projectType,category,resolution,sort='downloads',limit=20,offset=0}){
  const f=[['project_type:'+projectType]];
  if(category)f.push(['categories:'+category]);
  if(resolution)f.push(['categories:'+resolution]);
  const p=new URLSearchParams({query,limit:String(limit),offset:String(offset),index:sort,facets:JSON.stringify(f)});
  return mFetch(MAPI+'/search?'+p);
}

let gameVerCache = [];
async function loadGV(){
  if(gameVerCache.length)return;
  try{
    const a = await mFetch(MAPI+'/tag/game_version');
    gameVerCache = a.filter(v=>v.version_type==='release').sort((a,b)=>{
      const an=parseFloat(a.version.replace(/[^0-9.]/g,''))||0, bn=parseFloat(b.version.replace(/[^0-9.]/g,''))||0;
      return bn-an;
    });
  }catch(e){}
}
function verOpts(){
  let h='<option value="">All versions</option>';
  gameVerCache.slice(0,35).forEach(v=>{h+=`<option value="${v.version}">${v.version}</option>`});
  return h;
}

/* ---------- skeletons / error states ---------- */
function skel(n){
  let h='';
  for(let i=0;i<n;i++)h+=`<div class="glass skeleton-card"><div class="skel skel-img"></div><div style="padding:14px 16px"><div class="skel" style="height:14px;width:70%;margin-bottom:8px;border-radius:4px"></div><div class="skel" style="height:10px;width:40%;margin-bottom:10px;border-radius:4px"></div><div class="skel" style="height:10px;width:100%;margin-bottom:6px;border-radius:4px"></div><div class="skel" style="height:10px;width:80%;border-radius:4px"></div></div></div>`;
  return h;
}
function errS(m,fn){
  const id='r_'+Math.random().toString(36).slice(2);
  window[id]=fn;
  return `<div class="error-state"><b>Couldn't load this</b>${esc(m||'The API did not respond. Check your connection and try again.')}<br><button class="retry-btn" onclick="${id}()">Retry</button></div>`;
}

/* ---------- pagination ---------- */
function renderPg(cid,total,cur,pp,fn){
  const c=document.getElementById(cid);if(!c)return;c.innerHTML='';
  const tp=Math.ceil(total/pp);if(tp<=1)return;
  const mv=5;let s=Math.max(1,cur-Math.floor(mv/2)),e=Math.min(tp,s+mv-1);if(e-s<mv-1)s=Math.max(1,e-mv+1);
  const mk=(t,p,d,a)=>{const b=document.createElement('button');b.className='pg-btn'+(a?' active':'');b.textContent=t;b.disabled=!!d;if(!d)b.onclick=()=>fn(p);c.appendChild(b)};
  mk('‹',cur-1,cur===1);
  if(s>1){mk('1',1);if(s>2){const d=document.createElement('span');d.className='pg-ellipsis';d.textContent='…';c.appendChild(d)}}
  for(let i=s;i<=e;i++)mk(String(i),i,false,i===cur);
  if(e<tp){if(e<tp-1){const d=document.createElement('span');d.className='pg-ellipsis';d.textContent='…';c.appendChild(d)}mk(String(tp),tp)}
  mk('›',cur+1,cur===tp);
}

/* ---------- category chips ---------- */
function buildChips(id,items,active,onSel,small){
  const c=document.getElementById(id);if(!c||!items.length)return;
  const l=c.querySelector('.label');c.innerHTML='';if(l)c.appendChild(l);
  items.slice(0,12).forEach(i=>{
    const b=document.createElement('button');
    b.className='chip'+(small?' small':'')+(i===active?' active':'');
    b.textContent=i;b.onclick=()=>onSel(i);c.appendChild(b);
  });
}
async function loadCatsFor(pt,ck){
  try{
    const all = await mFetch(MAPI+'/tag/category');
    return all.filter(c=>c.project_type===pt&&c.header!=='resolutions').map(c=>c.name);
  }catch(e){return []}
}

/* ---------- image gallery / card rendering ---------- */
function getImages(item){return(item.gallery&&item.gallery.length)?item.gallery.slice(0,5):(item.icon_url?[item.icon_url]:[])}

function cardHTML(item,type,detailUrl){
  const imgs=getImages(item);const sid='cs_'+item.project_id;const isPop=item.downloads>=POP_DL;
  const tagL=(item.categories&&item.categories[0])||item.display_categories?.[0]||type.slice(0,-1);
  const icon=item.icon_url?`<img src="${esc(item.icon_url)}" alt="" loading="lazy">`:(item.title||'?').charAt(0).toUpperCase();
  const link=detailUrl||('project.html?type='+encodeURIComponent(type)+'&id='+encodeURIComponent(item.project_id));
  return `<a class="card glass" href="${esc(link)}" onclick="event.preventDefault();openProjectModal('${jsStr(item.project_id)}','${jsStr(type)}')"><div class="card-slider" id="${sid}" data-idx="0" data-count="${imgs.length}"><div class="card-icon">${icon}</div>${imgs.length?`<div class="card-slides" style="width:${imgs.length*100}%">${imgs.map(u=>`<img src="${esc(u)}" loading="lazy" alt="" style="width:${100/imgs.length}%">`).join('')}</div>${imgs.length>1?`<button type="button" class="card-nav prev" onclick="event.preventDefault();event.stopPropagation();sldP('${sid}',-1)">‹</button><button type="button" class="card-nav next" onclick="event.preventDefault();event.stopPropagation();sldP('${sid}',1)">›</button><div class="card-dots">${imgs.map((_,i)=>`<button type="button" class="${i===0?'active':''}" onclick="event.preventDefault();event.stopPropagation();goP('${sid}',${i})"></button>`).join('')}</div>`:''}`:`<div class="card-slide-empty">no preview</div>`}</div><div class="card-body"><div class="card-name">${esc(item.title)}${isPop?'<span class="popular-tag">🔥 Popular</span>':''}</div><div class="card-author">by ${esc(item.author||'unknown')} · ${fmt(item.downloads)} dl</div><div class="card-desc">${esc(item.description)}</div><div class="card-tags"><span class="tag">${esc(tagL)}</span>${item.latest_version?`<span class="tag mono">${esc(item.latest_version)}</span>`:''}</div><div class="card-foot"><div class="card-stat"><b>${fmt(item.downloads)}</b> dl</div><span class="dl-btn">↓ Get</span></div></div></a>`;
}

function sldP(sid,d){const el=document.getElementById(sid);if(!el)return;const n=parseInt(el.dataset.count);let i=parseInt(el.dataset.idx)+d;if(i<0)i=n-1;if(i>=n)i=0;goP(sid,i)}
function goP(sid,i){const el=document.getElementById(sid);if(!el)return;el.dataset.idx=i;el.querySelector('.card-slides').style.transform=`translateX(-${(100/parseInt(el.dataset.count))*i}%)`;el.querySelectorAll('.card-dots button').forEach((d,j)=>d.classList.toggle('active',j===i))}
setInterval(()=>{document.querySelectorAll('.card-slider[data-count]').forEach(el=>{if(parseInt(el.dataset.count)>1&&!el.matches(':hover'))sldP(el.id,1)})},5000);

/* ---------- shared header year / footer bits ---------- */
document.addEventListener('DOMContentLoaded',()=>{
  const y=document.getElementById('foot-year');if(y)y.textContent=new Date().getFullYear();
  // Cloudflare Pages (and similar hosts) serve clean URLs like "/home"
  // instead of "/home.html" — strip the extension on both sides so the
  // active nav link still gets detected correctly either way.
  const here = (location.pathname.split('/').pop() || 'home.html').replace(/\.html$/,'') || 'home';
  document.querySelectorAll('#main-nav a').forEach(a=>{
    const target = (a.getAttribute('href')||'').replace(/\.html$/,'');
    if(target === here) a.classList.add('active');
  });

  // Mobile drawer — built from the same links already in the desktop nav,
  // so there's only ever one list of pages to keep in sync.
  const drawerNav = document.getElementById('mobile-drawer-nav');
  const ICONS = {'home':'🏠','datapacks':'📦','modpacks':'🧩','mods':'🔧','plugins':'🔌','servers':'🌐','shaders':'✨','textures':'🎨','tiers':'⚔️','news':'📰'};
  if(drawerNav){
    document.querySelectorAll('#main-nav a').forEach(a=>{
      const href = a.getAttribute('href')||'';
      const key = href.replace(/\.html$/,'');
      const link = document.createElement('a');
      link.href = href;
      link.innerHTML = `<span class="mdn-icon">${ICONS[key]||'▸'}</span>${a.textContent}`;
      if(a.classList.contains('active')) link.classList.add('active');
      link.addEventListener('click', closeMobileDrawer);
      drawerNav.appendChild(link);
    });
  }
});

function toggleMobileDrawer(){
  const isOpen = document.body.classList.contains('drawer-open');
  isOpen ? closeMobileDrawer() : openMobileDrawer();
}
function openMobileDrawer(){
  document.body.classList.add('drawer-open');
  document.getElementById('mobile-drawer')?.setAttribute('aria-hidden','false');
}
function closeMobileDrawer(){
  document.body.classList.remove('drawer-open');
  document.getElementById('mobile-drawer')?.setAttribute('aria-hidden','true');
}
document.addEventListener('keydown', e=>{ if(e.key==='Escape') closeMobileDrawer(); });

/* ============================================================
   Notifications — bell icon in the header.
   Entries are generated automatically from real content activity
   (new items added today, existing items updated today) across
   mods, modpacks, data packs, plugins, textures and shaders.
   Stored in localStorage so the unread count is consistent no
   matter which page you're on — no manual step involved.
   ============================================================ */
const NOTIF_KEY = 'hollow_notifs_v1';

function getNotifs(){
  try{ return JSON.parse(localStorage.getItem(NOTIF_KEY) || '[]') }catch(e){ return [] }
}
function saveNotifs(arr){
  try{ localStorage.setItem(NOTIF_KEY, JSON.stringify(arr.slice(0,60))) }catch(e){}
}
function addNotification(text){
  const arr = getNotifs();
  // avoid spamming duplicate messages back-to-back
  if(arr[0] && arr[0].text === text && (Date.now()-arr[0].ts) < 5*60000) return;
  arr.unshift({id:'n'+Date.now()+Math.random().toString(36).slice(2,6), text, ts:Date.now(), read:false});
  saveNotifs(arr);
  renderNotifs();
}
function markAllReadNotifs(){ const arr=getNotifs(); arr.forEach(n=>n.read=true); saveNotifs(arr); renderNotifs(); }
function clearAllNotifs(){ saveNotifs([]); renderNotifs(); }

function renderNotifs(){
  const list = document.getElementById('notif-list');
  const badge = document.getElementById('notif-badge');
  if(!list || !badge) return;
  const arr = getNotifs();
  const unread = arr.filter(n=>!n.read).length;
  if(unread>0){ badge.style.display='flex'; badge.textContent = unread>9?'9+':String(unread) }
  else{ badge.style.display='none' }
  list.innerHTML = arr.length
    ? arr.map(n=>`<div class="notif-item ${n.read?'read':'unread'}"><div class="n-dot"></div><div class="n-body">${n.text}<div class="n-time">${timeAgo(n.ts)}</div></div></div>`).join('')
    : `<div class="notif-empty">You're all caught up — nothing new yet.</div>`;
}
function toggleNotifPanel(e){
  e && e.stopPropagation();
  const p = document.getElementById('notif-panel');
  if(!p) return;
  const willOpen = !p.classList.contains('open');
  p.classList.toggle('open');
  if(willOpen) markAllReadOnView();
}
function markAllReadOnView(){
  // mark read shortly after opening, so the badge clears but items stay visible as "seen"
  setTimeout(()=>{ const arr=getNotifs(); let changed=false; arr.forEach(n=>{if(!n.read){n.read=true;changed=true}}); if(changed){saveNotifs(arr); renderNotifs()} }, 1200);
}
document.addEventListener('click', e=>{
  const wrap = document.getElementById('notif-btn')?.closest('.notif-wrap');
  const panel = document.getElementById('notif-panel');
  if(panel && panel.classList.contains('open') && wrap && !wrap.contains(e.target)) panel.classList.remove('open');
});
document.addEventListener('DOMContentLoaded', ()=>{
  const arr = getNotifs();
  if(!arr.length){
    saveNotifs([{id:'welcome', text:'Welcome to <b>Hollow</b> — you\'ll see new and updated mods, packs and shaders here automatically.', ts:Date.now(), read:false}]);
  }
  renderNotifs();
});

/* ============================================================
   Shared "items per page" control — one setting, every page.
   Stored in localStorage so changing it anywhere carries over
   the next time any listing page loads.
   ============================================================ */
const PAGE_SIZE_KEY = 'hollow_page_size';
function getPageSize(){ const v=parseInt(localStorage.getItem(PAGE_SIZE_KEY)); return [10,20,30,50].includes(v)?v:20 }
function setPageSize(n){ try{ localStorage.setItem(PAGE_SIZE_KEY, String(n)) }catch(e){} }
function initPageSizeControl(containerId, onChange){
  const c = document.getElementById(containerId);
  if(!c) return;
  const cur = getPageSize();
  c.innerHTML = `<span>Show</span><select id="${containerId}-sel">${[10,20,30,50].map(n=>`<option value="${n}" ${n===cur?'selected':''}>${n}</option>`).join('')}</select><span>per page</span>`;
  document.getElementById(containerId+'-sel').addEventListener('change', e=>{
    const n = parseInt(e.target.value);
    setPageSize(n);
    onChange(n);
  });
}

/* ============================================================
   Content notifications — mods/modpacks/datapacks/plugins/
   textures/shaders only. Servers do not generate notifications.
   Checks the newest + most recently updated items for each content
   type and raises a notification the first time something within
   the last 24 hours is seen, so the feed always reflects genuinely
   new activity with no manual step involved.
   ============================================================ */
const SEEN_CONTENT_KEY = 'hollow_seen_content_v1';
function getSeenContent(){ try{ return JSON.parse(localStorage.getItem(SEEN_CONTENT_KEY)||'{}') }catch(e){ return {} } }
function saveSeenContent(obj){
  // Prune anything older than 3 days so this doesn't grow forever and so
  // dedup keys are naturally scoped to "have we shown this today", not
  // "have we ever shown this" — see note in pollContentNotifications below.
  const cutoff = Date.now() - 3*24*60*60*1000;
  Object.keys(obj).forEach(k=>{ if(obj[k] < cutoff) delete obj[k]; });
  try{ localStorage.setItem(SEEN_CONTENT_KEY, JSON.stringify(obj)) }catch(e){}
}
const CONTENT_LABELS = {mod:'mod', modpack:'modpack', datapack:'data pack', plugin:'plugin', resourcepack:'texture pack', shader:'shader'};

async function pollContentNotifications(pt){
  try{
    const label = CONTENT_LABELS[pt] || pt;
    const seen = getSeenContent();
    const dayMs = 24*60*60*1000;
    const today = new Date().toISOString().slice(0,10); // YYYY-MM-DD
    const [newest, updated] = await Promise.all([
      mSearch({projectType:pt, sort:'newest', limit:8}),
      mSearch({projectType:pt, sort:'updated', limit:8}),
    ]);
    (newest.hits||[]).forEach(hit=>{
      // Scoped to today's date, not just the project ID — a permanent
      // per-project flag meant a project could only ever notify once in its
      // entire lifetime, which is why this quietly ran dry over time and
      // skewed toward whatever handful of projects were newest on day one.
      const key = 'new:'+hit.project_id+':'+today;
      const isRecent = (Date.now() - new Date(hit.date_created).getTime()) < dayMs;
      if(isRecent && !seen[key]){
        addNotification(`New ${label} added today: <b>${esc(hit.title)}</b>`);
        seen[key] = Date.now();
      }
    });
    (updated.hits||[]).forEach(hit=>{
      const key = 'upd:'+hit.project_id+':'+today;
      const isRecent = (Date.now() - new Date(hit.date_modified).getTime()) < dayMs;
      if(isRecent && !seen[key]){
        addNotification(`${esc(hit.title)} was updated today`);
        seen[key] = Date.now();
      }
    });
    saveSeenContent(seen);
  }catch(e){}
}
