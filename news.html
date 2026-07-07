/* ============================================================
   Cloudflare Pages Function — /api/news
   Runs server-side on Cloudflare's edge, not in the visitor's
   browser. Fetches Reddit's RSS feeds directly (with a proper
   descriptive User-Agent, which Reddit's own docs ask for) and
   returns clean JSON to the client.

   Why this exists: the old approach had the browser hop through
   public CORS proxies (allorigins, rss2json, codetabs) to reach
   Reddit. Those proxy IPs are extremely widely used/abused, and
   Reddit's anti-bot systems increasingly throttle or block them
   outright — which is why ALL THREE could fail at once even
   though each one is a genuinely different company/service. A
   same-origin edge function making its own direct request doesn't
   have that shared-reputation problem.

   This also means Reddit only ever sees traffic from Cloudflare's
   edge (cacheable, rate-limit-friendly) instead of every single
   visitor's browser hitting Reddit individually.
   ============================================================ */

const FEEDS = {
  all: [
    { name: 'Minecraft', url: 'https://www.reddit.com/r/Minecraft/new/.rss?limit=45', tag: 'Java' },
    { name: 'Minecraft Bedrock', url: 'https://www.reddit.com/r/MCPE/new/.rss?limit=35', tag: 'Bedrock' },
    { name: 'Server Admins', url: 'https://www.reddit.com/r/admincraft/new/.rss?limit=25', tag: 'Servers' },
    { name: 'Aternos Community', url: 'https://www.reddit.com/r/aternos/new/.rss?limit=15', tag: 'Servers' },
    { name: 'Modded Minecraft', url: 'https://www.reddit.com/r/feedthebeast/new/.rss?limit=25', tag: 'Mods' },
    { name: 'Fabric Modding', url: 'https://www.reddit.com/r/fabricmc/new/.rss?limit=15', tag: 'Mods' },
    { name: 'Technical MC', url: 'https://www.reddit.com/r/technicalminecraft/new/.rss?limit=15', tag: 'Java' },
    { name: 'Minecraft Builds', url: 'https://www.reddit.com/r/minecraftbuilds/new/.rss?limit=15', tag: 'Java' },
    { name: 'Minecraft Commands', url: 'https://www.reddit.com/r/MinecraftCommands/new/.rss?limit=12', tag: 'Java' },
    { name: 'Create Mod', url: 'https://www.reddit.com/r/CreateMod/new/.rss?limit=15', tag: 'Mods' },
    { name: 'Minecraft Suggestions', url: 'https://www.reddit.com/r/minecraftsuggestions/new/.rss?limit=10', tag: 'Java' },
    { name: 'All The Mods', url: 'https://www.reddit.com/r/allthemods/new/.rss?limit=10', tag: 'Mods' },
    { name: 'Minecraft Help', url: 'https://www.reddit.com/r/MinecraftHelp/new/.rss?limit=12', tag: 'Java' },
    { name: 'Minecraft Memes', url: 'https://www.reddit.com/r/MinecraftMemes/new/.rss?limit=10', tag: 'Java' },
  ],
  java: [
    { name: 'Minecraft', url: 'https://www.reddit.com/r/Minecraft/new/.rss?limit=45', tag: 'Java' },
    { name: 'Technical MC', url: 'https://www.reddit.com/r/technicalminecraft/new/.rss?limit=20', tag: 'Java' },
    { name: 'Minecraft Builds', url: 'https://www.reddit.com/r/minecraftbuilds/new/.rss?limit=20', tag: 'Java' },
    { name: 'Minecraft Commands', url: 'https://www.reddit.com/r/MinecraftCommands/new/.rss?limit=15', tag: 'Java' },
    { name: 'Minecraft Suggestions', url: 'https://www.reddit.com/r/minecraftsuggestions/new/.rss?limit=15', tag: 'Java' },
    { name: 'Minecraft Help', url: 'https://www.reddit.com/r/MinecraftHelp/new/.rss?limit=15', tag: 'Java' },
  ],
  bedrock: [
    { name: 'Minecraft Bedrock', url: 'https://www.reddit.com/r/MCPE/new/.rss?limit=45', tag: 'Bedrock' },
  ],
  servers: [
    { name: 'Server Admins', url: 'https://www.reddit.com/r/admincraft/new/.rss?limit=40', tag: 'Servers' },
    { name: 'Aternos Community', url: 'https://www.reddit.com/r/aternos/new/.rss?limit=20', tag: 'Servers' },
  ],
  mods: [
    { name: 'Modded Minecraft', url: 'https://www.reddit.com/r/feedthebeast/new/.rss?limit=35', tag: 'Mods' },
    { name: 'Fabric Modding', url: 'https://www.reddit.com/r/fabricmc/new/.rss?limit=20', tag: 'Mods' },
    { name: 'Create Mod', url: 'https://www.reddit.com/r/CreateMod/new/.rss?limit=15', tag: 'Mods' },
    { name: 'All The Mods', url: 'https://www.reddit.com/r/allthemods/new/.rss?limit=15', tag: 'Mods' },
  ],
};

function stripCdata(s) {
  if (!s) return '';
  const m = s.match(/<!\[CDATA\[([\s\S]*?)\]\]>/);
  return (m ? m[1] : s).trim();
}

function getTag(block, tag) {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const m = block.match(re);
  return m ? m[1] : '';
}

function getInnerText(block, tag) {
  const inner = getTag(block, tag);
  if (!inner) return '';
  // Atom <author> wraps the actual name in a nested <name> tag — pull that
  // out instead of returning the whole "<name>x</name><uri>y</uri>" blob.
  const nameMatch = inner.match(/<name[^>]*>([\s\S]*?)<\/name>/i);
  return nameMatch ? nameMatch[1] : inner;
}

/* Minimal, dependency-free RSS/Atom parser — Cloudflare's Worker runtime
   has no DOMParser, so this pulls out just the fields we need with regex
   rather than pulling in a full XML parsing library for it. */
function parseFeed(xml) {
  const items = [];
  const blockRe = /<(item|entry)\b[^>]*>([\s\S]*?)<\/\1>/g;
  let m;
  while ((m = blockRe.exec(xml))) {
    const block = m[2];
    let link = getTag(block, 'link');
    if (!link) {
      const linkAttr = block.match(/<link[^>]*href=["']([^"']+)["'][^>]*\/?>/i);
      link = linkAttr ? linkAttr[1] : '';
    }
    const author = stripCdata(getInnerText(block, 'author')).replace(/^\/u\//, '');
    items.push({
      title: stripCdata(getTag(block, 'title')),
      link,
      pubDate: getTag(block, 'published') || getTag(block, 'pubDate'),
      author,
      description: stripCdata(getTag(block, 'content') || getTag(block, 'description')),
      thumbnail: null,
    });
  }
  return items;
}

export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const cat = url.searchParams.get('cat') || 'all';
  const feeds = FEEDS[cat] || FEEDS.all;

  const results = await Promise.all(feeds.map(async (f) => {
    try {
      const r = await fetch(f.url, {
        headers: {
          // Reddit's own API docs explicitly ask for a descriptive UA —
          // generic/absent ones are far more likely to get throttled.
          'User-Agent': 'HollowHub/1.0 (Minecraft content hub; +https://hollowhub.pages.dev)',
          'Accept': 'application/rss+xml, application/atom+xml, text/xml, */*',
        },
        cf: { cacheTtl: 90, cacheEverything: true },
      });
      if (!r.ok) return { feed: f, items: [] };
      const text = await r.text();
      return { feed: f, items: parseFeed(text) };
    } catch (e) {
      return { feed: f, items: [] };
    }
  }));

  let items = [];
  let failures = 0;
  results.forEach(r => {
    if (!r.items.length) failures++;
    r.items.forEach(it => items.push({ ...it, sourceTag: r.feed.tag, sourceName: r.feed.name }));
  });
  items.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));

  return new Response(JSON.stringify({ items, failures, totalFeeds: feeds.length }), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=20',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
