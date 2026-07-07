/* ============================================================
   Hollow Hub — news.js
   Live news feed (Java, Bedrock, mods, servers) with pagination
   and auto-refresh so it always reflects the latest posts.
   ============================================================ */

const RSS_PROXY = 'https://api.rss2json.com/v1/api.json?rss_url=';
const RSS_PROXY_FALLBACK = 'https://api.allorigins.win/raw?url=';
const FEEDS = {
  all: [
    {name:'Minecraft', url:'https://www.reddit.com/r/Minecraft/new/.rss?limit=45', tag:'Java'},
    {name:'Minecraft Bedrock', url:'https://www.reddit.com/r/MCPE/new/.rss?limit=35', tag:'Bedrock'},
    {name:'Server Admins', url:'https://www.reddit.com/r/admincraft/new/.rss?limit=25', tag:'Servers'},
    {name:'Aternos Community', url:'https://www.reddit.com/r/aternos/new/.rss?limit=15', tag:'Servers'},
    {name:'Modded Minecraft', url:'https://www.reddit.com/r/feedthebeast/new/.rss?limit=25', tag:'Mods'},
    {name:'Fabric Modding', url:'https://www.reddit.com/r/fabricmc/new/.rss?limit=15', tag:'Mods'},
    {name:'Technical MC', url:'https://www.reddit.com/r/technicalminecraft/new/.rss?limit=15', tag:'Java'},
    {name:'Minecraft Builds', url:'https://www.reddit.com/r/minecraftbuilds/new/.rss?limit=15', tag:'Java'},
    {name:'Minecraft Commands', url:'https://www.reddit.com/r/MinecraftCommands/new/.rss?limit=12', tag:'Java'},
    {name:'Create Mod', url:'https://www.reddit.com/r/CreateMod/new/.rss?limit=15', tag:'Mods'},
    {name:'Minecraft Suggestions', url:'https://www.reddit.com/r/minecraftsuggestions/new/.rss?limit=10', tag:'Java'},
    {name:'All The Mods', url:'https://www.reddit.com/r/allthemods/new/.rss?limit=10', tag:'Mods'},
    {name:'Minecraft Help', url:'https://www.reddit.com/r/MinecraftHelp/new/.rss?limit=12', tag:'Java'},
    {name:'Minecraft Memes', url:'https://www.reddit.com/r/MinecraftMemes/new/.rss?limit=10', tag:'Java'},
  ],
  java: [
    {name:'Minecraft', url:'https://www.reddit.com/r/Minecraft/new/.rss?limit=45', tag:'Java'},
    {name:'Technical MC', url:'https://www.reddit.com/r/technicalminecraft/new/.rss?limit=20', tag:'Java'},
    {name:'Minecraft Builds', url:'https://www.reddit.com/r/minecraftbuilds/new/.rss?limit=20', tag:'Java'},
    {name:'Minecraft Commands', url:'https://www.reddit.com/r/MinecraftCommands/new/.rss?limit=15', tag:'Java'},
    {name:'Minecraft Suggestions', url:'https://www.reddit.com/r/minecraftsuggestions/new/.rss?limit=15', tag:'Java'},
    {name:'Minecraft Help', url:'https://www.reddit.com/r/MinecraftHelp/new/.rss?limit=15', tag:'Java'},
  ],
  bedrock: [
    {name:'Minecraft Bedrock', url:'https://www.reddit.com/r/MCPE/new/.rss?limit=45', tag:'Bedrock'},
  ],
  servers: [
    {name:'Server Admins', url:'https://www.reddit.com/r/admincraft/new/.rss?limit=40', tag:'Servers'},
    {name:'Aternos Community', url:'https://www.reddit.com/r/aternos/new/.rss?limit=20', tag:'Servers'},
  ],
  mods: [
    {name:'Modded Minecraft', url:'https://www.reddit.com/r/feedthebeast/new/.rss?limit=35', tag:'Mods'},
    {name:'Fabric Modding', url:'https://www.reddit.com/r/fabricmc/new/.rss?limit=20', tag:'Mods'},
    {name:'Create Mod', url:'https://www.reddit.com/r/CreateMod/new/.rss?limit=15', tag:'Mods'},
    {name:'All The Mods', url:'https://www.reddit.com/r/allthemods/new/.rss?limit=15', tag:'Mods'},
  ],
};

let newsCat = 'all';
let newsItems = [];
let newsPage = 1;
const NEWS_PP = 12;

const RSS_PROXY_2 = 'https://api.codetabs.com/v1/proxy?quest=';

function parseFeedXml(text){
  const doc = new DOMParser().parseFromString(text, 'text/xml');
  return [...doc.querySelectorAll('entry, item')].map(n=>({
    title: n.querySelector('title')?.textContent || '',
    link: n.querySelector('link')?.getAttribute('href') || n.querySelector('link')?.textContent || '',
    pubDate: n.querySelector('published, pubDate')?.textContent || '',
    author: (n.querySelector('author name')?.textContent || n.querySelector('author')?.textContent || '').replace(/^\/u\//,''),
    description: n.querySelector('content, description')?.textContent || '',
    thumbnail: null,
  }));
}

let newsRenderGen = 0;
async function loadNewsFeed(){
  const myGen = ++newsRenderGen;
  const requestedCat = newsCat;
  const grid = document.getElementById('news-grid');
  grid.innerHTML = skel(9);
  let providerFailures = 0;
  let items = [];

  // Primary path: our own Cloudflare Pages Function (/functions/api/news.js).
  // It fetches Reddit server-side at the edge instead of the browser bouncing
  // through public CORS proxies — those proxy IPs are so widely used/abused
  // that Reddit's anti-bot systems increasingly throttle them regardless of
  // which specific proxy service it is, which is what made "all providers
  // failed" happen more than it should have.
  let usedEdgeFunction = false;
  try{
    const r = await fetchWithTimeout(`/api/news?cat=${encodeURIComponent(requestedCat)}&_=${Date.now()}`, null, 10000);
    if(r.ok){
      const d = await r.json();
      if(d && Array.isArray(d.items) && d.items.length){
        items = d.items;
        providerFailures = d.failures || 0;
        usedEdgeFunction = true;
      }
    }
  }catch(e){ /* fall through to the client-side proxy chain below */ }

  if(!usedEdgeFunction){
    const feeds = FEEDS[requestedCat] || FEEDS.all;
    const bust = Date.now(); // cache-bust so no proxy in the chain serves a stale cached copy
    try{
      const results = await Promise.all(feeds.map(async f=>{
        const busted = f.url + (f.url.includes('?')?'&':'?') + '_=' + bust;
        // Three independent providers, tried in order, as a fallback for
        // deployments where the edge function above isn't available.
        try{
          const r = await fetchWithTimeout(RSS_PROXY_FALLBACK + encodeURIComponent(busted), null, 8000);
          const parsed = parseFeedXml(await r.text());
          if(parsed.length) return {feed:f, items:parsed};
          throw new Error('empty');
        }catch(e1){
          try{
            const r2 = await fetchWithTimeout(RSS_PROXY + encodeURIComponent(f.url) + '&_=' + bust, null, 8000);
            const d = await r2.json();
            if(d && d.items && d.items.length) return {feed:f, items:d.items};
            throw new Error('empty');
          }catch(e2){
            try{
              const r3 = await fetchWithTimeout(RSS_PROXY_2 + encodeURIComponent(busted), null, 8000);
              const parsed = parseFeedXml(await r3.text());
              if(parsed.length) return {feed:f, items:parsed};
              throw new Error('empty');
            }catch(e3){ providerFailures++; return {feed:f, items:[]} }
          }
        }
      }));
      results.forEach(r=>r.items.forEach(it=>items.push({...it, sourceTag:r.feed.tag, sourceName:r.feed.name})));
    }catch(e){
      if(myGen !== newsRenderGen || requestedCat !== newsCat) return;
      grid.innerHTML = errS('Something went wrong loading news. Try again in a moment.', loadNewsFeed);
      return;
    }
  }

  try{
    items.sort((a,b)=> new Date(b.pubDate) - new Date(a.pubDate));

    // If the category was switched again (or another refresh kicked off)
    // while these requests were in flight, this response is stale — showing
    // it now would silently swap in the wrong category's articles, which is
    // exactly what made category switching feel like it was "sometimes
    // showing the wrong thing."
    if(myGen !== newsRenderGen || requestedCat !== newsCat) return;

    newsItems = items;
    newsPage = 1;
    if(!items.length){
      grid.innerHTML = errS(usedEdgeFunction
        ? 'No recent posts came back just now — this is usually temporary. Try again in a moment.'
        : 'All three fallback news providers timed out or were unreachable just now — this is usually temporary. Try again in a moment.', loadNewsFeed);
      return;
    }
    renderNewsPage();
    const synced = document.getElementById('news-sync');
    if(synced) synced.textContent = 'updated '+timeAgo(Date.now())+(providerFailures?` (${providerFailures} source${providerFailures===1?'':'s'} skipped)`:'');
  }catch(e){
    if(myGen !== newsRenderGen || requestedCat !== newsCat) return;
    grid.innerHTML = errS('Something went wrong loading news. Try again in a moment.', loadNewsFeed);
  }
}

let newsPageItems = [];
function renderNewsPage(){
  const grid = document.getElementById('news-grid');
  const start = (newsPage-1)*NEWS_PP;
  const pageItems = newsItems.slice(start, start+NEWS_PP);
  newsPageItems = pageItems;
  grid.innerHTML = pageItems.map((it,i)=>newsCardHTML(it,i)).join('');
  renderPg('news-pagination', newsItems.length, newsPage, NEWS_PP, p=>{ newsPage=p; renderNewsPage(); window.scrollTo({top:document.getElementById('news-grid').offsetTop-80, behavior:'smooth'}); });
}

function newsCardHTML(it, idx){
  const img = extractNewsImage(it);
  const isVideo = isVideoPost(it);
  // Description text has the same entity-escaping as the image markup — decode
  // before stripping tags, or the raw "&lt;img..." markup shows up as visible
  // text in the preview instead of being removed.
  const desc = decodeHtmlEntities(it.description||'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim().slice(0,140);
  const slideContent = img
    ? `<img src="${esc(safeUrl(img))}" loading="lazy" style="width:100%;height:100%;object-fit:cover" alt="">${isVideo?`<div class="video-badge">▶</div>`:''}`
    : `<div class="card-slide-empty"><span class="cse-icon">${isVideo?'🎬':'💬'}</span><span class="cse-label">${esc(it.sourceTag)}</span></div>`;
  return `<a class="card glass" href="javascript:void(0)" onclick="openNewsModal(${idx})"><div class="card-slider">${slideContent}</div><div class="card-body"><div class="card-name">${esc(it.title)}</div><div class="card-author">${esc(it.sourceName)} · ${esc(it.author||'')}</div><div class="card-desc">${esc(desc)}</div><div class="card-tags"><span class="tag">${esc(it.sourceTag)}</span></div><div class="card-foot"><div class="card-stat">${new Date(it.pubDate).toLocaleDateString()}</div><span class="dl-btn">Preview</span></div></div></a>`;
}
function openNewsModal(idx){
  const it = newsPageItems[idx];
  if(!it) return;
  const body = document.getElementById('modal-body');
  const overlay = document.getElementById('modal-overlay');
  if(!body || !overlay) return;
  const img = extractNewsImage(it);
  const fullDesc = decodeHtmlEntities(it.description||'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim().slice(0,600) || 'No preview text available for this post.';
  body.innerHTML = `
    ${img?`<div class="modal-gallery" style="border-radius:14px;margin-bottom:16px"><img src="${esc(safeUrl(img))}" style="width:100%;height:100%;object-fit:cover" alt=""></div>`:''}
    <div class="card-tags" style="margin-bottom:10px"><span class="tag">${esc(it.sourceTag)}</span></div>
    <div style="font-family:'Space Grotesk';font-weight:600;font-size:17px;line-height:1.35;margin-bottom:8px">${esc(it.title)}</div>
    <div class="card-author" style="margin-bottom:14px">${esc(it.sourceName)}${it.author?' · '+esc(it.author):''} · ${new Date(it.pubDate).toLocaleDateString()}</div>
    <p style="color:var(--text-dim);font-size:13px;line-height:1.65;margin-bottom:20px">${esc(fullDesc)}${fullDesc.length>=600?'…':''}</p>
    <a href="${esc(safeUrl(it.link))}" target="_blank" rel="noopener noreferrer" class="chip" style="padding:10px 16px;font-size:12px;display:inline-flex">Read full post ↗</a>
  `;
  overlay.classList.add('open');
}
function extractNewsImage(it){
  if(it.thumbnail) return decodeHtmlEntities(it.thumbnail);
  if(it.enclosure && it.enclosure.link) return decodeHtmlEntities(it.enclosure.link);
  if(it.enclosure && it.enclosure.thumbnail) return decodeHtmlEntities(it.enclosure.thumbnail);
  const raw = it.content || it.description || '';
  // Reddit's feed wraps embedded markup as escaped entities, e.g.
  // "&lt;img src=&quot;https://...&quot;&gt;" — searching for a literal
  // "<img" against that raw text never matches anything, which is why
  // images (and video-post thumbnails, which use this same path) never
  // showed up. Decode first, then look for the tag.
  const decoded = decodeHtmlEntities(raw);
  const m = decoded.match(/<img[^>]+src=["']([^"']+)["']/i);
  return m ? decodeHtmlEntities(m[1]) : null;
}
function isVideoPost(it){
  const text = ((it.link||'') + ' ' + (it.description||'')).toLowerCase();
  return text.includes('v.redd.it') || text.includes('/video/') || text.includes('gfycat') || text.includes('redgifs') || text.includes('youtube.com') || text.includes('youtu.be');
}
/* Image URLs pulled out of raw feed HTML (via regex above) still contain the
   feed's own HTML-entity encoding, e.g. "&amp;" for a literal "&" in a query
   string. Re-escaping that with esc() for our own output turned it into
   "&amp;amp;" and broke the URL — decode first so esc()/safeUrl() see the
   real address. */
function decodeHtmlEntities(s){
  if(!s) return s;
  const ta = document.createElement('textarea');
  ta.innerHTML = s;
  return ta.value;
}

function setNewsCat(cat, btn){
  newsCat = cat;
  document.querySelectorAll('#news-cat-filters .chip').forEach(b=>b.classList.remove('active'));
  if(btn) btn.classList.add('active');
  loadNewsFeed();
}

document.addEventListener('DOMContentLoaded', ()=>{
  loadNewsFeed();
  setInterval(loadNewsFeed, 2 * 60000); // re-check every 2 minutes
});
