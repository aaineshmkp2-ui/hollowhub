/* ============================================================
   Hollow Hub — project.js
   Project detail rendering — used both by the standalone page
   (project.html?type=mods&id=...) for direct/shared links, and as
   an in-page popup from any listing page (openProjectModal), so
   clicking a mod/pack/texture card doesn't navigate away at all.
   Version rows use forceDownload() from core.js instead of a plain
   cross-origin <a download>, which is what actually fixes
   "downloads just open a new page".
   ============================================================ */

const TYPE_META = {
  mods:{pt:'mod', backLabel:'Mods'},
  modpacks:{pt:'modpack', backLabel:'Modpacks'},
  datapacks:{pt:'datapack', backLabel:'Data Packs'},
  plugins:{pt:'plugin', backLabel:'Plugins'},
  textures:{pt:'resourcepack', backLabel:'Textures'},
  shaders:{pt:'shader', backLabel:'Shaders'},
};

function qparam(name){return new URLSearchParams(location.search).get(name)}

function buildProjectHTML(p, kind, id){
  const isMod = kind==='mod' || kind==='plugin';
  const gal = (p.gallery||[]).slice().sort((a,b)=>(b.featured===true)-(a.featured===true));
  const sideLabel = v => v==='required'?'Required':v==='optional'?'Optional':v==='unsupported'?'Unsupported':'Unknown';
  const links = [
    p.source_url && {label:'Source', url:p.source_url},
    p.issues_url && {label:'Issues', url:p.issues_url},
    p.wiki_url && {label:'Wiki', url:p.wiki_url},
    p.discord_url && {label:'Discord', url:p.discord_url},
    ...(p.donation_urls||[]).map(d=>({label:d.platform||'Donate', url:d.url})),
  ].filter(Boolean);

  return `
      ${gal.length?`
      <div class="proj-gallery">
        <div class="pg-viewport" id="pg-viewport">
          ${gal.map((g,i)=>`<div class="pg-slide ${i===0?'active':''}" data-i="${i}"><img src="${esc(g.url)}" alt="${esc(g.title||'')}" loading="${i===0?'eager':'lazy'}"></div>`).join('')}
          ${gal.length>1?`<button class="pg-nav pg-prev" onclick="pgMove(-1)" aria-label="Previous image">‹</button><button class="pg-nav pg-next" onclick="pgMove(1)" aria-label="Next image">›</button>`:''}
          ${gal.length>1?`<div class="pg-counter" id="pg-counter">1 / ${gal.length}</div>`:''}
        </div>
        ${gal.length>1?`<div class="pg-dots">${gal.map((_,i)=>`<button class="pg-dot ${i===0?'active':''}" onclick="pgGoTo(${i})" aria-label="Image ${i+1}"></button>`).join('')}</div>`:''}
      </div>`:''}
      <div style="display:flex;gap:14px;align-items:flex-start;margin-bottom:18px">
        <div class="card-icon" style="position:static;width:56px;height:56px;border:none;border-radius:14px">${p.icon_url?`<img src="${esc(p.icon_url)}" style="width:100%;height:100%;object-fit:cover">`:esc(p.title).charAt(0)}</div>
        <div>
          <div class="card-name" style="font-size:20px">${esc(p.title)}</div>
          <div class="card-author">by ${esc(p.author||'unknown')} · updated ${new Date(p.updated).toLocaleDateString()} · ${fmt(p.followers)} follows · ${fmt(p.downloads)} downloads</div>
        </div>
      </div>
      <p style="color:var(--text-dim);font-size:13.5px;line-height:1.6;margin-bottom:16px">${esc(p.description)}</p>
      <div class="card-tags" style="margin-bottom:18px">${(p.categories||[]).slice(0,10).map(c=>`<span class="tag">${esc(c)}</span>`).join('')}</div>

      <div class="proj-meta-grid">
        <div class="pm-item"><div class="pm-label">Published</div><div class="pm-val">${p.published?new Date(p.published).toLocaleDateString():'—'}</div></div>
        <div class="pm-item"><div class="pm-label">Last updated</div><div class="pm-val">${p.updated?new Date(p.updated).toLocaleDateString():'—'}</div></div>
        <div class="pm-item"><div class="pm-label">License</div><div class="pm-val">${p.license?.name ? esc(p.license.name) : (p.license?.id ? esc(p.license.id) : '—')}</div></div>
        <div class="pm-item"><div class="pm-label">Status</div><div class="pm-val" style="text-transform:capitalize">${esc(p.status||'—')}</div></div>
        <div class="pm-item"><div class="pm-label">Client side</div><div class="pm-val">${sideLabel(p.client_side)}</div></div>
        <div class="pm-item"><div class="pm-label">Server side</div><div class="pm-val">${sideLabel(p.server_side)}</div></div>
      </div>

      ${links.length?`<div style="display:flex;flex-wrap:wrap;gap:8px;margin:16px 0">${links.map(l=>`<a class="chip" href="${esc(safeUrl(l.url))}" target="_blank" rel="noopener nofollow noreferrer">${esc(l.label)} ↗</a>`).join('')}</div>`:''}

      <div style="font-family:'Space Grotesk';font-weight:600;font-size:13px;margin-bottom:10px;margin-top:22px;color:var(--text-dim)">Download a version</div>
      <div class="ver-selectors">
        <select id="m-gv">${verOpts()}</select>
        ${isMod?`<select id="m-ld"><option value="">All loaders</option><option value="fabric">Fabric</option><option value="forge">Forge</option><option value="quilt">Quilt</option><option value="neoforge">NeoForge</option><option value="bukkit">Bukkit</option><option value="spigot">Spigot</option><option value="paper">Paper</option></select>`:''}
        <button class="chip" style="padding:8px 12px" onclick="loadVers('${id}',${isMod})">Filter</button>
      </div>
      <div id="m-vb"><div class="ver-loading"><div class="ver-spinner"></div>Loading versions…</div></div>
      <div style="margin-top:18px"><a href="https://modrinth.com/${kind}/${p.slug}" target="_blank" rel="noopener" class="chip" style="padding:10px 16px;font-size:12px">View on Modrinth ↗</a></div>
    `;
}

async function afterProjectRender(p, kind, id){
  const gal = p.gallery || [];
  if(gal.length>1) initGallerySwipe();
  if(!gameVerCache.length){ await loadGV(); const sel=document.getElementById('m-gv'); if(sel) sel.innerHTML = verOpts(); }
  loadVers(id, kind==='mod'||kind==='plugin');
}

/* ---------- standalone page: project.html?type=mods&id=... ---------- */
async function initProjectPage(){
  const root = document.getElementById('project-root');
  if(!root) return; // this script is also loaded on listing pages for the popup — nothing to do there
  const type = qparam('type') || 'mods';
  const id = qparam('id');
  const meta = TYPE_META[type] || TYPE_META.mods;
  const backLink = document.getElementById('back-link');
  if(backLink){backLink.href = type+'.html'; backLink.textContent = '← Back to '+meta.backLabel}

  if(!id){
    root.innerHTML = `<div class="empty"><b>No project specified</b>Go back and pick something to view.</div>`;
    return;
  }

  root.innerHTML = `<div class="skel" style="height:18px;width:50%;margin-bottom:10px;border-radius:4px"></div><div class="skel" style="height:10px;width:100%;border-radius:4px"></div>`;

  try{
    const p = await mFetch(MAPI+'/project/'+encodeURIComponent(id));
    document.title = p.title + ' — Hollow';
    root.innerHTML = buildProjectHTML(p, meta.pt, id);
    afterProjectRender(p, meta.pt, id);
  }catch(e){
    root.innerHTML = errS('', initProjectPage);
  }
}

/* ---------- popup: called from any listing page's card click ---------- */
async function openProjectModal(id, type){
  const overlay = document.getElementById('modal-overlay');
  const body = document.getElementById('modal-body');
  if(!overlay || !body) return;
  const meta = TYPE_META[type] || TYPE_META.mods;
  body.innerHTML = `<div class="skel" style="height:18px;width:50%;margin-bottom:10px;border-radius:4px"></div><div class="skel" style="height:10px;width:100%;border-radius:4px"></div>`;
  overlay.classList.add('open');
  try{
    const p = await mFetch(MAPI+'/project/'+encodeURIComponent(id));
    body.innerHTML = buildProjectHTML(p, meta.pt, id);
    afterProjectRender(p, meta.pt, id);
  }catch(e){
    body.innerHTML = errS('', ()=>openProjectModal(id, type));
  }
}

let pgIndex = 0, pgTotal = 0;
function pgGoTo(i){
  const slides = document.querySelectorAll('.pg-slide');
  const dots = document.querySelectorAll('.pg-dot');
  pgTotal = slides.length;
  if(!pgTotal) return;
  pgIndex = ((i % pgTotal) + pgTotal) % pgTotal;
  slides.forEach((s,idx)=>s.classList.toggle('active', idx===pgIndex));
  dots.forEach((d,idx)=>d.classList.toggle('active', idx===pgIndex));
  const counter = document.getElementById('pg-counter');
  if(counter) counter.textContent = (pgIndex+1)+' / '+pgTotal;
}
function pgMove(delta){ pgGoTo(pgIndex + delta); }
function initGallerySwipe(){
  const vp = document.getElementById('pg-viewport');
  if(!vp) return;
  let sx = 0;
  vp.addEventListener('touchstart', e=>{ sx = e.touches[0].clientX; }, {passive:true});
  vp.addEventListener('touchend', e=>{
    const dx = e.changedTouches[0].clientX - sx;
    if(Math.abs(dx) > 40) pgMove(dx > 0 ? -1 : 1);
  }, {passive:true});
  document.addEventListener('keydown', e=>{
    if(!document.getElementById('pg-viewport')) return;
    if(e.key==='ArrowLeft') pgMove(-1);
    if(e.key==='ArrowRight') pgMove(1);
  });
}

async function loadVers(id, isMod){
  const box = document.getElementById('m-vb');
  if(!box) return;
  const gv = document.getElementById('m-gv')?.value || '';
  const ld = isMod ? (document.getElementById('m-ld')?.value || '') : '';
  box.innerHTML = '<div class="ver-loading"><div class="ver-spinner"></div>Loading versions…</div>';
  try{
    const p = new URLSearchParams();
    if(gv) p.set('game_versions', JSON.stringify([gv]));
    if(ld) p.set('loaders', JSON.stringify([ld]));
    const qs = p.toString() ? '?'+p.toString() : '';
    const vers = await mFetch(MAPI+'/project/'+id+'/version'+qs);
    if(!vers.length){ box.innerHTML = `<div class="ver-empty"><b>No versions match those filters</b></div>`; return; }
    box.innerHTML = `<div class="ver-list">${vers.slice(0,40).map(v=>{
      const pf = v.files.find(f=>f.primary) || v.files[0];
      if(!pf) return '';
      const sz = (pf.size/1024/1024).toFixed(1);
      const gvs = v.game_versions ? v.game_versions.slice(-3).join(', ') : '';
      const lds = v.loaders ? v.loaders.join(', ') : '';
      const btnId = 'dl_'+Math.random().toString(36).slice(2);
      return `<div class="ver-row"><div class="ver-info"><div class="ver-num">${esc(v.version_number||v.name)}</div><div class="ver-meta">${esc(gvs)}${v.game_versions?.length>3?'…':''} · ${esc(lds)} · ${sz}MB</div></div><button id="${btnId}" class="ver-dl-btn" onclick="forceDownload('${jsStr(pf.url)}','${jsStr(pf.filename||'file')}',document.getElementById('${btnId}'))">⬇ Download</button></div>`;
    }).join('')}${vers.length>40?`<div style="text-align:center;color:var(--text-faint);font-size:10px;padding-top:5px">Showing 40 of ${vers.length}</div>`:''}</div>`;
  }catch(e){
    box.innerHTML = `<div class="ver-empty"><b>Failed to load versions</b>${esc(e.message)}</div>`;
  }
}

document.addEventListener('DOMContentLoaded', initProjectPage);
