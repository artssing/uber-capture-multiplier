#!/usr/bin/env node
/**
 * HK Surge Map — local scraper (Plan B)
 *
 * Scrapes uber.com/en-HK every 60s and pushes surge.json to
 * the gh-pages branch via the GitHub Contents API.
 *
 * Setup:
 *   npm install
 *   npx puppeteer browsers install chrome          # first time only
 *   export GITHUB_TOKEN=ghp_xxxxxxxxxxxx
 *   node scraper.js
 *
 * Debug single district:
 *   DEBUG=1 node scraper.js --test
 */

const puppeteer = require('puppeteer-extra');
const Stealth   = require('puppeteer-extra-plugin-stealth');
puppeteer.use(Stealth());

// ── Config ────────────────────────────────────────────────────────────────────
const GITHUB_TOKEN  = process.env.GITHUB_TOKEN || '';
const GITHUB_OWNER  = process.env.GITHUB_OWNER  || 'artssing';
const GITHUB_REPO   = process.env.GITHUB_REPO   || 'uber-capture-multiplier';
const GITHUB_BRANCH = 'gh-pages';
const INTERVAL_MS   = 60_000;
const DEBUG         = process.env.DEBUG === '1';
const TEST_MODE     = process.argv.includes('--test'); // scrape one district & exit

if (!GITHUB_TOKEN && !TEST_MODE) {
  console.error('[error] GITHUB_TOKEN not set.\n  export GITHUB_TOKEN=ghp_your_token');
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

// Central Ferry Piers — fixed drop-off for all queries
const DROPOFF = { lat:22.2870, lng:114.1600 };

// Baseline prices for ratio normalisation (populated on first successful scrape)
const basePrices = {};

// ── GitHub API ────────────────────────────────────────────────────────────────
async function githubGetSha() {
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${GITHUB_BRANCH === 'gh-pages' ? '' : ''}surge.json?ref=${GITHUB_BRANCH}`;
  const res = await fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/surge.json?ref=${GITHUB_BRANCH}`,
    { headers: { Authorization:`Bearer ${GITHUB_TOKEN}`, Accept:'application/vnd.github+json', 'X-GitHub-Api-Version':'2022-11-28' } }
  );
  if (res.status === 404) return undefined; // new file
  if (!res.ok) throw new Error(`GitHub GET surge.json → ${res.status}`);
  return (await res.json()).sha;
}

async function pushSurgeJson(payload) {
  const content = Buffer.from(JSON.stringify(payload, null, 2)).toString('base64');
  let sha;
  try { sha = await githubGetSha(); } catch (e) { console.error('[github] GET sha failed:', e.message); }

  const res = await fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/surge.json`,
    {
      method: 'PUT',
      headers: { Authorization:`Bearer ${GITHUB_TOKEN}`, Accept:'application/vnd.github+json', 'X-GitHub-Api-Version':'2022-11-28', 'Content-Type':'application/json' },
      body: JSON.stringify({ message:`surge: ${new Date().toISOString()}`, content, branch:GITHUB_BRANCH, ...(sha ? { sha } : {}) }),
    }
  );
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`GitHub PUT → ${res.status}: ${txt.slice(0,200)}`);
  }
  console.log('[github] surge.json pushed ✓');
}

// ── Browser launch ────────────────────────────────────────────────────────────
function launchBrowser() {
  return puppeteer.launch({
    headless: true,
    ignoreHTTPSErrors: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled',
      '--lang=zh-HK',
      '--window-size=390,844',
    ],
  });
}

// ── Scrape one district ───────────────────────────────────────────────────────
async function scrapeOne(browser, district) {
  const page = await browser.newPage();

  await page.setUserAgent(
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) ' +
    'AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1'
  );
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'zh-HK,zh;q=0.9,en-US;q=0.8,en;q=0.7',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  });
  await page.setViewport({ width:390, height:844, isMobile:true, hasTouch:true, deviceScaleFactor:3 });

  // Abort heavyweight assets
  await page.setRequestInterception(true);
  page.on('request', req => {
    if (['image','media','font'].includes(req.resourceType())) req.abort();
    else req.continue();
  });

  // Capture ALL JSON responses from Uber endpoints
  let apiSurge = null, apiPrice = null;
  const capturedUrls = [];

  page.on('response', async resp => {
    const respUrl = resp.url();
    const ct = resp.headers()['content-type'] || '';
    if (!ct.includes('json')) return;
    // Capture all JSON — Uber uses cn-geo1.uber.com, api.uber.com, etc.
    capturedUrls.push(respUrl);
    try {
      const text = await resp.text();
      if (DEBUG) console.log(`  [net] ${resp.status()} ${respUrl.slice(0,90)}`);
      if (DEBUG && text.length < 2000) console.log(`       ${text.slice(0,300)}`);
      const sm = text.match(/"surge_multiplier"\s*:\s*([\d.]+)/);
      const lp = text.match(/"low_estimate"\s*:\s*([\d.]+)/);
      const hk = text.match(/"value"\s*:\s*"?([\d.]+)"?/);
      if (sm) { apiSurge = parseFloat(sm[1]); console.log(`  [net] ✓ surge_multiplier=${apiSurge}`); }
      if (lp) { apiPrice = parseFloat(lp[1]); }
      else if (hk && !apiPrice) { apiPrice = parseFloat(hk[1]); }
    } catch (e) {
      if (DEBUG) console.log(`  [net] parse error: ${e.message}`);
    }
  });

  // Try URLs in order — show every error explicitly
  const urls = [
    `https://www.uber.com/en-HK/price-estimate/?pickup_lat=${district.lat}&pickup_lng=${district.lng}&dropoff_lat=${DROPOFF.lat}&dropoff_lng=${DROPOFF.lng}`,
    `https://www.uber.com/global/en/price-estimate/?pickup_lat=${district.lat}&pickup_lng=${district.lng}&dropoff_lat=${DROPOFF.lat}&dropoff_lng=${DROPOFF.lng}`,
    `https://m.uber.com/looking`,
  ];

  let loaded = false;
  let lastError = '';
  let pageTitle = '';
  let finalUrl = '';

  for (const url of urls) {
    try {
      if (DEBUG) console.log(`  [goto] ${url.slice(0,80)}`);
      const resp = await page.goto(url, { waitUntil:'domcontentloaded', timeout:20000 });
      const status = resp ? resp.status() : 0;
      finalUrl = page.url();
      pageTitle = await page.title();
      if (DEBUG) console.log(`  [page] status=${status} title="${pageTitle}" url=${finalUrl.slice(0,70)}`);

      if (finalUrl.startsWith('chrome-error')) {
        lastError = `chrome-error (SSL/network): ${finalUrl}`;
        continue;
      }
      if (status === 403 || status === 429) {
        lastError = `HTTP ${status} (blocked)`;
        continue;
      }

      // Page loaded — now click "See prices" to trigger the estimate API
      await new Promise(r => setTimeout(r, 2000)); // wait for hydration

      const clicked = await page.evaluate(() => {
        // Find button by visible text
        const btns = [...document.querySelectorAll('button, [role="button"], a')];
        const target = btns.find(b => /see prices|get estimate|查看價格|估算/i.test(b.textContent));
        if (target) { target.click(); return target.textContent.trim(); }
        return null;
      });

      if (DEBUG) console.log(`  [click] button found: ${clicked}`);
      if (!clicked) {
        // Try submitting the form directly if button not found
        await page.evaluate(() => {
          const form = document.querySelector('form');
          if (form) form.submit();
        });
        if (DEBUG) console.log('  [click] no button, tried form submit');
      }

      // Wait for the price estimate API response to arrive
      await new Promise(r => setTimeout(r, 6000));
      loaded = true;
      break;
    } catch (e) {
      lastError = e.message;
      if (DEBUG) console.log(`  [goto] error: ${e.message}`);
    }
  }

  if (!loaded) {
    await page.close();
    return { multiplier:null, price:null, source:'error', error:lastError };
  }

  // DOM fallback: scan body text and inline scripts for price/surge data
  let domSurge = null, domPrice = null;
  try {
    const r = await page.evaluate(() => {
      const text = document.body.innerText || '';
      const scripts = [...document.querySelectorAll('script')]
        .map(s => s.textContent).join('\n');
      const all = text + '\n' + scripts;

      const smMatch  = all.match(/"?surge_multiplier"?\s*[=:]\s*([\d.]+)/);
      const surgeX   = text.match(/(\d+\.\d+)\s*[x×X×]/i);
      // HK$ price range: "HK$45", "HK$45-60", "HK$45 – HK$60"
      const hkPrice  = text.match(/HK\$\s*(\d+(?:\.\d+)?)/);
      const lowEst   = all.match(/"low_estimate"\s*:\s*([\d.]+)/);
      // Upfront fare format
      const upfront  = all.match(/"upfront_fare_enabled"\s*:\s*true/);
      const fareVal  = all.match(/"fare_value"\s*:\s*([\d.]+)/);

      return {
        surge: smMatch  ? parseFloat(smMatch[1])  : (surgeX ? parseFloat(surgeX[1]) : null),
        price: lowEst   ? parseFloat(lowEst[1])
             : fareVal  ? parseFloat(fareVal[1])
             : hkPrice  ? parseFloat(hkPrice[1]) : null,
        snippet: text.slice(0, 400).replace(/\s+/g, ' '),
      };
    });
    domSurge = r.surge;
    domPrice = r.price;
    if (DEBUG) console.log(`  [dom] surge=${domSurge} price=${domPrice}`);
    if (DEBUG) console.log(`  [dom] body: ${r.snippet}`);
  } catch (e) {
    if (DEBUG) console.log(`  [dom] evaluate error: ${e.message}`);
  }

  await page.close();

  // Pick best data source
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
      multiplier = clamp(price / basePrices[district.id]); source = 'ratio';
    }
  }

  return { multiplier, price, source, pageTitle, finalUrl, capturedUrls: capturedUrls.length };
}

function clamp(m) {
  if (m == null || isNaN(m)) return null;
  return Math.round(Math.max(1.0, Math.min(3.5, m)) * 10) / 10;
}

// ── --test mode: diagnose a single district ───────────────────────────────────
async function runTest() {
  console.log('=== TEST MODE (中西區) ===');
  const browser = await launchBrowser();
  try {
    const r = await scrapeOne(browser, DISTRICTS[0]);
    console.log('\n=== RESULT ===');
    console.log(JSON.stringify(r, null, 2));
  } finally {
    await browser.close();
  }
}

// ── Full scrape cycle ─────────────────────────────────────────────────────────
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
    browser = await launchBrowser();

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
        const tag = r.multiplier !== null ? `${r.multiplier}x [${r.source}]` : `null [${r.source}] ${r.error || ''}`;
        console.log(tag);
      } catch (e) {
        result.data[d.id] = { multiplier:null, source:'error', updatedAt:new Date().toISOString() };
        console.log(`EXCEPTION: ${e.message}`);
      }
      if (i < DISTRICTS.length - 1) await new Promise(r => setTimeout(r, 2800));
    }
  } catch (e) {
    result.status = 'error';
    console.error('[scraper] Fatal launch error:', e.message);
  } finally {
    if (browser) { try { await browser.close(); } catch (_) {} }
    result.status = result.liveCount > 0 ? 'ok' : 'simulated';
    result.nextUpdate = new Date(Date.now() + INTERVAL_MS).toISOString();
    console.log(`[scraper] Done — ${result.liveCount}/${result.total} live`);
  }

  if (GITHUB_TOKEN) {
    try { await pushSurgeJson(result); }
    catch (e) { console.error('[github] Push failed:', e.message); }
  } else {
    console.log('[github] Skipped (no GITHUB_TOKEN)');
    console.log(JSON.stringify(result, null, 2));
  }
}

// ── Boot ──────────────────────────────────────────────────────────────────────
console.log('╔════════════════════════════════════════╗');
console.log('║   HK Surge Map — Local Scraper         ║');
console.log('╚════════════════════════════════════════╝');
if (TEST_MODE) {
  runTest().catch(console.error);
} else {
  console.log(`Map:  https://${GITHUB_OWNER}.github.io/${GITHUB_REPO}/`);
  console.log(`Tip:  Run with DEBUG=1 for verbose output`);
  console.log(`Tip:  Run with --test to diagnose one district\n`);
  (async () => {
    await runCycle();
    setInterval(runCycle, INTERVAL_MS);
  })();
}
