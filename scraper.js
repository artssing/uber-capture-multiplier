#!/usr/bin/env node
/**
 * HK Surge Map — local scraper
 *
 * Scrapes uber.com/en-HK every 60s and pushes surge.json to
 * the gh-pages branch via the GitHub Contents API.
 *
 * Setup:
 *   1. npm install
 *   2. npx puppeteer browsers install chrome   (first time only)
 *   3. export GITHUB_TOKEN=ghp_xxxxxxxxxxxx    (needs repo contents:write)
 *      export GITHUB_OWNER=artssing            (your GitHub username)
 *      export GITHUB_REPO=uber-capture-multiplier
 *   4. node scraper.js
 */

const puppeteer = require('puppeteer-extra');
const Stealth   = require('puppeteer-extra-plugin-stealth');
puppeteer.use(Stealth());

// ── Config ────────────────────────────────────────────────────────────────────
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const GITHUB_OWNER = process.env.GITHUB_OWNER || 'artssing';
const GITHUB_REPO  = process.env.GITHUB_REPO  || 'uber-capture-multiplier';
const GITHUB_BRANCH = 'gh-pages';
const GITHUB_FILE   = 'surge.json';
const INTERVAL_MS   = 60_000;
const DEBUG         = process.env.DEBUG === '1';

if (!GITHUB_TOKEN) {
  console.error('[error] GITHUB_TOKEN not set.');
  console.error('  export GITHUB_TOKEN=ghp_your_personal_access_token');
  process.exit(1);
}

// ── Districts ─────────────────────────────────────────────────────────────────
const DISTRICTS = [
  { id:'central_western', cn:'中西區',  lat:22.2839, lng:114.1521 },
  { id:'wan_chai',        cn:'灣仔區',  lat:22.2783, lng:114.1827 },
  { id:'eastern',         cn:'東區',    lat:22.2843, lng:114.2264 },
  { id:'southern',        cn:'南區',    lat:22.2468, lng:114.1584 },
  { id:'yau_tsim_mong',   cn:'油尖旺區',lat:22.3126, lng:114.1709 },
  { id:'sham_shui_po',    cn:'深水埗區',lat:22.3418, lng:114.1624 },
  { id:'kowloon_city',    cn:'九龍城區',lat:22.3277, lng:114.1918 },
  { id:'wong_tai_sin',    cn:'黃大仙區',lat:22.3508, lng:114.2026 },
  { id:'kwun_tong',       cn:'觀塘區',  lat:22.3165, lng:114.2263 },
  { id:'tsuen_wan',       cn:'荃灣區',  lat:22.3716, lng:114.1133 },
  { id:'kwai_tsing',      cn:'葵青區',  lat:22.3636, lng:114.1328 },
  { id:'tuen_mun',        cn:'屯門區',  lat:22.3910, lng:113.9777 },
  { id:'yuen_long',       cn:'元朗區',  lat:22.4445, lng:114.0222 },
  { id:'north',           cn:'北區',    lat:22.4942, lng:114.1388 },
  { id:'tai_po',          cn:'大埔區',  lat:22.4513, lng:114.1645 },
  { id:'sha_tin',         cn:'沙田區',  lat:22.3877, lng:114.1956 },
  { id:'sai_kung',        cn:'西貢區',  lat:22.3814, lng:114.2709 },
  { id:'islands',         cn:'離島區',  lat:22.2612, lng:113.9448 },
];

const DROPOFF = { lat:22.2870, lng:114.1600 }; // Central Ferry Piers

// Baseline prices for normalisation (populated on first scrape)
const basePrices = {};

// ── GitHub API ────────────────────────────────────────────────────────────────
async function githubGet(path) {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!res.ok) throw new Error(`GitHub GET ${path} → ${res.status}`);
  return res.json();
}

async function githubPut(path, body) {
  const res = await fetch(`https://api.github.com${path}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`GitHub PUT ${path} → ${res.status}: ${txt.slice(0,200)}`);
  }
  return res.json();
}

async function pushSurgeJson(payload) {
  const filePath = `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${GITHUB_FILE}`;
  const content  = Buffer.from(JSON.stringify(payload, null, 2)).toString('base64');

  // Get current SHA (needed for updates)
  let sha;
  try {
    const existing = await githubGet(`${filePath}?ref=${GITHUB_BRANCH}`);
    sha = existing.sha;
  } catch (_) {
    // File doesn't exist yet — first create
  }

  await githubPut(filePath, {
    message: `surge: update ${new Date().toISOString()}`,
    content,
    branch: GITHUB_BRANCH,
    ...(sha ? { sha } : {}),
  });
  console.log(`[github] surge.json pushed to ${GITHUB_BRANCH} ✓`);
}

// ── Scraping helpers ──────────────────────────────────────────────────────────
function clamp(m) {
  if (m == null || isNaN(m)) return null;
  return Math.round(Math.max(1.0, Math.min(3.5, m)) * 10) / 10;
}

async function scrapeOne(browser, district) {
  const page = await browser.newPage();

  await page.setUserAgent(
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) ' +
    'AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1'
  );
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'zh-HK,zh;q=0.9,en;q=0.8' });
  await page.setViewport({ width:390, height:844, isMobile:true, hasTouch:true, deviceScaleFactor:3 });

  // Block images/fonts to speed up
  await page.setRequestInterception(true);
  page.on('request', req => {
    if (['image','media','font','stylesheet'].includes(req.resourceType())) req.abort();
    else req.continue();
  });

  let apiSurge = null, apiPrice = null;

  page.on('response', async resp => {
    if (apiSurge !== null) return;
    if (!(resp.headers()['content-type'] || '').includes('json')) return;
    if (!resp.url().includes('uber')) return;
    try {
      const text = await resp.text();
      // Scan for surge_multiplier anywhere in the JSON blob
      const sm = text.match(/"surge_multiplier"\s*:\s*([\d.]+)/);
      const lp = text.match(/"low_estimate"\s*:\s*([\d.]+)/);
      if (sm) { apiSurge = parseFloat(sm[1]); if (DEBUG) console.log(`  [net] surge=${apiSurge}`); }
      if (lp) { apiPrice = parseFloat(lp[1]); }
    } catch (_) {}
  });

  const urls = [
    `https://www.uber.com/en-HK/price-estimate/?pickup_lat=${district.lat}&pickup_lng=${district.lng}&dropoff_lat=${DROPOFF.lat}&dropoff_lng=${DROPOFF.lng}`,
    `https://www.uber.com/global/en/price-estimate/?pickup_lat=${district.lat}&pickup_lng=${district.lng}&dropoff_lat=${DROPOFF.lat}&dropoff_lng=${DROPOFF.lng}`,
  ];

  let loaded = false;
  for (const url of urls) {
    try {
      await page.goto(url, { waitUntil:'domcontentloaded', timeout:18000 });
      await page.waitForTimeout(5000);
      const finalUrl = page.url();
      if (!finalUrl.startsWith('chrome-error')) { loaded = true; break; }
    } catch (_) {}
  }

  let domSurge = null, domPrice = null;
  if (loaded) {
    const r = await page.evaluate(() => {
      const text = document.body.innerText;
      const sm   = text.match(/(\d+\.\d+)\s*[x×X]/i);
      const hk   = text.match(/HK\$\s*(\d+(?:\.\d+)?)/);
      const scripts = [...document.querySelectorAll('script')]
        .map(s => s.textContent).join('');
      const ssm = scripts.match(/"surge_multiplier"\s*:\s*([\d.]+)/);
      const slp = scripts.match(/"low_estimate"\s*:\s*([\d.]+)/);
      return {
        surge:  ssm ? parseFloat(ssm[1]) : (sm ? parseFloat(sm[1]) : null),
        price:  slp ? parseFloat(slp[1]) : (hk ? parseFloat(hk[1]) : null),
      };
    });
    domSurge = r.surge;
    domPrice = r.price;
    if (DEBUG) console.log(`  [dom] surge=${domSurge} price=${domPrice}`);
  }

  await page.close();

  let multiplier = null;
  let price      = apiPrice ?? domPrice;
  let source     = 'error';

  if (apiSurge != null) {
    multiplier = clamp(apiSurge); source = 'api';
  } else if (domSurge != null) {
    multiplier = clamp(domSurge); source = 'dom';
  } else if (price != null) {
    if (!basePrices[district.id]) {
      basePrices[district.id] = price;
      multiplier = 1.0; source = 'baseline';
    } else {
      const ratio = price / basePrices[district.id];
      multiplier = clamp(ratio); source = 'ratio';
    }
  }

  return { multiplier, price, source };
}

// ── Main scrape cycle ─────────────────────────────────────────────────────────
async function runCycle() {
  console.log(`\n[scraper] ── Cycle ${new Date().toLocaleTimeString('zh-HK')} ──`);

  const result = {
    updatedAt: new Date().toISOString(),
    status: 'ok',
    liveCount: 0,
    total: DISTRICTS.length,
    data: {},
  };

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      ignoreHTTPSErrors: true,
      args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage',
             '--disable-blink-features=AutomationControlled','--lang=zh-HK'],
    });

    for (let i = 0; i < DISTRICTS.length; i++) {
      const d = DISTRICTS[i];
      process.stdout.write(`  ${i+1}/${DISTRICTS.length} ${d.cn} ... `);
      try {
        const r = await scrapeOne(browser, d);
        result.data[d.id] = {
          multiplier: r.multiplier,
          source:     r.source,
          updatedAt:  new Date().toISOString(),
        };
        if (r.multiplier !== null) result.liveCount++;
        console.log(`${r.multiplier ?? 'n/a'}x [${r.source}]`);
      } catch (e) {
        result.data[d.id] = { multiplier: null, source: 'error' };
        console.log(`error: ${e.message.slice(0,50)}`);
      }
      if (i < DISTRICTS.length - 1) await new Promise(r => setTimeout(r, 2800));
    }
  } catch (e) {
    result.status = 'error';
    console.error('[scraper] Fatal:', e.message);
  } finally {
    if (browser) { try { await browser.close(); } catch (_) {} }
  }

  if (result.liveCount === 0) result.status = 'simulated';
  console.log(`[scraper] ${result.liveCount}/${result.total} live data points`);

  // Push to GitHub Pages
  try {
    await pushSurgeJson(result);
  } catch (e) {
    console.error('[github] Push failed:', e.message);
  }
}

// ── Boot ──────────────────────────────────────────────────────────────────────
console.log('╔════════════════════════════════════════╗');
console.log('║   HK Surge Map — Local Scraper         ║');
console.log('╚════════════════════════════════════════╝');
console.log(`Repo:   ${GITHUB_OWNER}/${GITHUB_REPO}  branch: ${GITHUB_BRANCH}`);
console.log(`Output: https://${GITHUB_OWNER}.github.io/${GITHUB_REPO}/`);
console.log(`Interval: ${INTERVAL_MS / 1000}s\n`);

(async () => {
  await runCycle();
  setInterval(runCycle, INTERVAL_MS);
})();
