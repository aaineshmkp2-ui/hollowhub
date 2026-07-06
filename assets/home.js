/* ============================================================
   Hollow Hub — home.js
   Homepage: live pulse panel, trending mods, top servers, stats.
   ============================================================ */

async function loadTrendingMods(){
  const grid = document.getElementById('home-mods-grid');
  try{
    const d = await mSearch({projectType:'mod', sort:'downloads', limit:9});
    grid.innerHTML = d.hits.map(i=>cardHTML(i,'mods')).join('');
    if(d.hits[0]) document.getElementById('stat-downloads').textContent = fmt(d.hits[0].downloads);
  }catch(e){
    grid.innerHTML = errS('', loadTrendingMods);
  }
}

function loadHomeServers(){
  const grid = document.getElementById('home-servers-grid');
  const hs = SERVERS.slice(0,4);
  grid.innerHTML = hs.map(s=>srvHTML(s)).join('');
}

function goSearch(){
  const q = document.getElementById('hero-search').value.trim();
  if(!q) return;
  location.href = 'mods.html?q=' + encodeURIComponent(q);
}

document.addEventListener('DOMContentLoaded', ()=>{
  grid_init();
});

function grid_init(){
  loadGV();
  loadTrendingMods();
  loadHomeServers();
  pollContentNotifications('mod');
  setInterval(()=>pollContentNotifications('mod'), 90000);
  initServerSync({onData: ()=>{
    loadHomeServers();
    renderPulse();
    updateStats();
    const clock=document.getElementById('pulse-clock'); if(clock) clock.textContent='synced '+timeAgo(Date.now());
  }});
}
