/* ============================================================
   Hollow Hub — listing.js
   One generic controller reused by every Modrinth listing page
   (mods, modpacks, datapacks, plugins, textures, shaders): search,
   sort, category filters (with an "All" option), pagination, and
   a shared "items per page" control that stays in sync across
   every page of the site via localStorage.
   ============================================================ */

function initListing(cfg){
  const type = cfg.type;
  const state = {page:1, total:0, acat:null, ares:null};

  function buildCatChips(items){
    const c = document.getElementById(type+'-filters');
    if(!c) return;
    const l = c.querySelector('.label'); c.innerHTML=''; if(l) c.appendChild(l);
    const allBtn = document.createElement('button');
    allBtn.className = 'chip' + (state.acat===null ? ' active' : '');
    allBtn.textContent = 'All';
    allBtn.onclick = ()=>{ state.acat=null; refreshChipStates(); loadPage(1) };
    c.appendChild(allBtn);
    items.slice(0,14).forEach(i=>{
      const b=document.createElement('button');
      b.className='chip'+(i===state.acat?' active':'');
      b.textContent=i;
      b.onclick=()=>{ state.acat=(state.acat===i)?null:i; refreshChipStates(); loadPage(1) };
      c.appendChild(b);
    });
  }
  function refreshChipStates(){
    const c = document.getElementById(type+'-filters');
    if(!c) return;
    [...c.children].forEach(b=>{
      if(b.tagName!=='BUTTON') return;
      const isAll = b.textContent==='All';
      b.classList.toggle('active', isAll ? state.acat===null : b.textContent===state.acat);
    });
  }

  async function loadCats(){
    const items = await loadCatsFor(cfg.pt);
    if(items.length) buildCatChips(items);
    if(cfg.hasResolution){
      try{
        const all = await mFetch(MAPI+'/tag/category');
        const res = all.filter(c=>c.project_type==='resourcepack'&&c.header==='resolutions').map(c=>c.name);
        buildChips(type+'-res-filters', res, state.ares, c=>{state.ares=(state.ares===c)?null:c; loadPage(1)}, true);
      }catch(e){}
    }
  }

  async function loadPage(page, silent){
    if(page!==undefined) state.page = page;
    const grid = document.getElementById(type+'-grid');
    const pag = document.getElementById(type+'-pagination');
    if(!grid) return;
    const pp = getPageSize();
    if(!silent){ grid.innerHTML = skel(pp>=20?9:6); if(pag) pag.innerHTML=''; }
    const q = document.getElementById(type+'-search')?.value?.trim() || '';
    const sort = document.getElementById(type+'-sort')?.value || 'downloads';
    try{
      const d = await mSearch({query:q, projectType:cfg.pt, category:state.acat, resolution:state.ares, sort, limit:pp, offset:(state.page-1)*pp});
      state.total = d.total_hits ?? d.hits.length;
      const cnt = document.getElementById(type+'-count'); if(cnt) cnt.textContent = state.total.toLocaleString();
      grid.innerHTML = d.hits.length
        ? d.hits.map(i=>cardHTML(i,type)).join('')
        : `<div class="empty"><b>No ${cfg.label||type} found</b>Try a different search term or clear filters.</div>`;
      renderPg(type+'-pagination', state.total, state.page, pp, p=>loadPage(p));
      state.lastSync = Date.now();
      const syncEl = document.getElementById(type+'-sync'); if(syncEl) syncEl.textContent = 'synced '+timeAgo(state.lastSync);
    }catch(e){
      if(!silent) grid.innerHTML = errS('', ()=>loadPage(state.page));
    }
  }

  document.getElementById(type+'-search')?.addEventListener('input', ()=>debounced(()=>loadPage(1)));
  document.getElementById(type+'-sort')?.addEventListener('change', ()=>loadPage(1));
  initPageSizeControl(type+'-pagesize', ()=>loadPage(1));

  loadCats();
  loadPage(1);
  pollContentNotifications(cfg.pt);
  setInterval(()=>pollContentNotifications(cfg.pt), 90000);

  // Background auto-refresh — quietly re-checks the current page every 2 minutes so listings
  // stay current, but skips the redraw while the visitor is actively hovering the grid or
  // has typed a search, so it never yanks content out from under someone mid-browse.
  setInterval(()=>{
    const grid = document.getElementById(type+'-grid');
    const q = document.getElementById(type+'-search')?.value?.trim();
    if(!grid || grid.matches(':hover') || document.hidden || q) return;
    loadPage(state.page, true);
  }, 120000);
}
