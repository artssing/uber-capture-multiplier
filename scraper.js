#!/usr/bin/env node
/**
 * HK Surge Map — local scraper (Plan B)
 *
 * First-time setup (solve CAPTCHA once, saves cookies):
 *   node scraper.js --setup
 *
 * Normal operation (uses saved cookies):
 *   GITHUB_TOKEN=ghp_xxx node scraper.js
 *
 * Debug single district:
 *   DEBUG=1 node scraper.js --test
 */

const puppeteer  = require('puppeteer-extra');
const Stealth    = require('puppeteer-extra-plugin-stealth');
const fs         = require('fs');
const path       = require('path');
puppeteer.use(Stealth());

// ── Config ────────────────────────────────────────────────────────────────────
const GITHUB_TOKEN  = process.env.GITHUB_TOKEN || '';
const GITHUB_OWNER  = process.env.GITHUB_OWNER  || 'artssing';
const GITHUB_REPO   = process.env.GITHUB_REPO   || 'uber-capture-multiplier';
const GITHUB_BRANCH = 'gh-pages';
const INTERVAL_MS   = 60_000;
const DEBUG         = process.env.DEBUG === '1';
const SETUP_MODE    = process.argv.includes('--setup');
const TEST_MODE     = process.argv.includes('--test');
const COOKIES_FILE  = path.join(__dirname, '.uber-cookies.json');

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

const DROPOFF = { lat:22.2870, lng:114.1600 };
const basePrices = {};

// ── Cookie helpers ────────────────────────────────────────────────────────────
function loadCookies() {
  try {
    if (fs.existsSync(COOKIES_FILE)) {
      return JSON.parse(fs.readFileSync(COOKIES_FILE, 'utf8'));
    }
  } catch (_) {}
  return null;
}

function saveCookies(cookies) {
  fs.writeFileSync(COOKIES_FILE, JSON.stringify(cookies, null, 2));
}

// ── Setup mode: open real browser, user solves CAPTCHA, save cookies ──────────
async function runSetup() {
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║  SETUP MODE — Cookie capture                         ║');
  console.log('╠══════════════════════════════════════════════════════╣');
  console.log('║  1. A browser window will open                       ║');
  console.log('║  2. Complete any CAPTCHA / security check            ║');
  console.log('║  3. Navigate to the price estimator page             ║');
  console.log('║  4. Press ENTER here when the page loads normally    ║');
  console.log('╚══════════════════════════════════════════════════════╝\n');

  const browser = await puppeteer.launch({
    headless: false,   // visible window
    ignoreHTTPSErrors: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=430,900'],
    defaultViewport: null,
  });

  const page = await browser.newPage();
  await page.setUserAgent(
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
    'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
  );

  const TARGET = `https://www.uber.com/en-HK/price-estimate/?pickup_lat=22.2839&pickup_lng=114.1521&dropoff_lat=22.287&dropoff_lng=114.16`;
  await page.goto(TARGET, { waitUntil: 'domcontentloaded', timeout: 30000 });

  console.log('Browser opened. Complete any security check in the window.');
  console.log('When the price estimator page loads normally, press ENTER...');

  await new Promise(resolve => {
    process.stdin.setRawMode(false);
    process.stdin.resume();
    process.stdin.once('data', resolve);
  });

  const cookies = await page.cookies();
  saveCookies(cookies);
  console.log(`\n✓ Saved ${cookies.length} cookies to ${COOKIES_FILE}`);
  console.log('✓ Setup complete! Now run:  GITHUB_TOKEN=ghp_xxx node scraper.js\n');

  await browser.close();
  process.exit(0);
}

// ── GitHub API ────────────────────────────────────────────────────────────────
async function githubGetSha() {
  const res = await fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/surge.json?ref=${GITHUB_BRANCH}`,
    { headers: { Authorization:`Bearer ${GITHUB_TOKEN}`, Accept:'application/vnd.github+json', 'X-GitHub-Api-Version':'2022-11-28' } }
  );
  if (res.status === 404) return undefined;
  if (!res.ok) throw new Error(`GitHub GET → ${res.status}`);
  return (await res.json()).sha;
}

async function pushSurgeJson(payload) {
  const content = Buffer.from(JSON.stringify(payload, null, 2)).toString('base64');
  let sha;
  try { sha = await githubGetSha(); } catch (_) {}
  const res = await fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/surge.json`,
    {
      method: 'PUT',
      headers: { Authorization:`Bearer ${GITHUB_TOKEN}`, Accept:'application/vnd.github+json', 'X-GitHub-Api-Version':'2022-11-28', 'Content-Type':'application/json' },
      body: JSON.stringify({ message:`surge: ${new Date().toISOString()}`, content, branch:GITHUB_BRANCH, ...(sha ? { sha } : {}) }),
    }
  );
  if (!res.ok) { const t = await res.text(); throw new Error(`GitHub PUT → ${res.status}: ${t.slice(0,200)}`); }
  console.log('[github] surge.json pushed ✓');
}

// ── Browser launch ────────────────────────────────────────────────────────────
async function launchBrowser() {
  return puppeteer.launch({
    headless: true,
    ignoreHTTPSErrors: true,
    args: [
      '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled', '--lang=zh-HK',
    ],
  });
}

// ── Scrape one district ───────────────────────────────────────────────────────
async function scrapeOne(browser, district, savedCookies) {
  const page = await browser.newPage();

  // Desktop UA — more consistent with saved cookie session
  await page.setUserAgent(
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
    'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
  );
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'zh-HK,zh;q=0.9,en;q=0.8' });
  await page.setViewport({ width:1280, height:800 });

  // Inject saved cookies so Uber sees an authenticated browser session
  if (savedCookies && savedCookies.length > 0) {
    await page.setCookie(...savedCookies);
  }

  await page.setRequestInterception(true);
  page.on('request', req => {
    if (['image','media','font'].includes(req.resourceType())) req.abort();
    else req.continue();
  });

  let apiSurge = null, apiPrice = null;
  const capturedUrls = [];

  page.on('response', async resp => {
    const respUrl = resp.url();
    const ct = resp.headers()['content-type'] || '';
    if (!ct.includes('json')) return;
    capturedUrls.push(respUrl);
    try {
      const text = await resp.text();
      if (DEBUG) console.log(`  [net] ${resp.status()} ${respUrl.slice(0,90)}`);
      if (DEBUG && text.length < 3000) console.log(`       ${text.slice(0,400)}`);

      // If CAPTCHA challenge detected, throw so caller knows to re-setup
      if (respUrl.includes('def.uber.com') && text.includes('RECAPTCHA')) {
        throw new Error('CAPTCHA_REQUIRED');
      }

      const sm = text.match(/"surge_multiplier"\s*:\s*([\d.]+)/);
      const lp = text.match(/"low_estimate"\s*:\s*([\d.]+)/);
      if (sm) { apiSurge = parseFloat(sm[1]); console.log(`  [net] ✓ surge=${apiSurge} from ${respUrl.slice(0,60)}`); }
      if (lp) { apiPrice = parseFloat(lp[1]); }
    } catch (e) {
      if (e.message === 'CAPTCHA_REQUIRED') throw e;
      if (DEBUG) console.log(`  [net] parse error: ${e.message}`);
    }
  });

  const url = `https://www.uber.com/en-HK/price-estimate/?pickup_lat=${district.lat}&pickup_lng=${district.lng}&dropoff_lat=${DROPOFF.lat}&dropoff_lng=${DROPOFF.lng}`;

  let loaded = false;
  let lastError = '';

  try {
    if (DEBUG) console.log(`  [goto] ${url.slice(0,80)}`);
    const resp = await page.goto(url, { waitUntil:'domcontentloaded', timeout:20000 });
    const status = resp ? resp.status() : 0;
    const finalUrl = page.url();
    if (DEBUG) console.log(`  [page] status=${status} url=${finalUrl.slice(0,70)}`);

    if (finalUrl.includes('def.uber.com')) {
      lastError = 'CAPTCHA page — run --setup again to refresh cookies';
    } else if (!finalUrl.startsWith('chrome-error') && status !== 403) {
      // Wait for page to hydrate
      await new Promise(r => setTimeout(r, 2000));

      // Click "See prices" button
      const clicked = await page.evaluate(() => {
        const btns = [...document.querySelectorAll('button, [role="button"]')];
        const target = btns.find(b => /see prices|get estimate|查看/i.test(b.textContent));
        if (target) { target.click(); return target.textContent.trim(); }
        return null;
      });
      if (DEBUG) console.log(`  [click] ${clicked || 'no button found'}`);

      // Wait for price API response
      await new Promise(r => setTimeout(r, 6000));
      loaded = true;
    } else {
      lastError = `HTTP ${status}`;
    }
  } catch (e) {
    if (e.message === 'CAPTCHA_REQUIRED') {
      console.error('\n⚠ CAPTCHA detected. Run: node scraper.js --setup\n');
      process.exit(1);
    }
    lastError = e.message;
    if (DEBUG) console.log(`  [goto] error: ${e.message}`);
  }

  let domSurge = null, domPrice = null;
  if (loaded) {
    try {
      const r = await page.evaluate(() => {
        const text = document.body.innerText || '';
        const scripts = [...document.querySelectorAll('script')].map(s => s.textContent).join('\n');
        const all = text + '\n' + scripts;
        return {
          surge: (all.match(/"surge_multiplier"\s*:\s*([\d.]+)/) || all.match(/(\d+\.\d+)\s*[x×]/i) || [])[1],
          price: (all.match(/"low_estimate"\s*:\s*([\d.]+)/) || text.match(/HK\$\s*(\d+(?:\.\d+)?)/) || [])[1],
          snippet: text.slice(0,400).replace(/\s+/g,' '),
        };
      });
      domSurge = r.surge ? parseFloat(r.surge) : null;
      domPrice = r.price ? parseFloat(r.price) : null;
      if (DEBUG) console.log(`  [dom] surge=${domSurge} price=${domPrice}`);
      if (DEBUG) console.log(`  [dom] body: ${r.snippet}`);
    } catch (_) {}
  }

  await page.close();

  let multiplier = null, price = apiPrice ?? domPrice, source = 'error';

  if (apiSurge != null)       { multiplier = clamp(apiSurge); source = 'api'; }
  else if (domSurge != null)  { multiplier = clamp(domSurge); source = 'dom'; }
  else if (price != null) {
    if (!basePrices[district.id]) { basePrices[district.id] = price; multiplier = 1.0; source = 'baseline'; }
    else { multiplier = clamp(price / basePrices[district.id]); source = 'ratio'; }
  }

  return { multiplier, price, source, error: lastError, capturedUrls: capturedUrls.length };
}

function clamp(m) {
  if (m == null || isNaN(m)) return null;
  return Math.round(Math.max(1.0, Math.min(3.5, m)) * 10) / 10;
}

// ── Test mode ─────────────────────────────────────────────────────────────────
async function runTest() {
  console.log('=== TEST MODE (中西區) ===');
  const cookies = loadCookies();
  if (!cookies) console.log('⚠ No cookies found — run --setup first for best results\n');
  else console.log(`✓ Loaded ${cookies.length} saved cookies\n`);
  const browser = await launchBrowser();
  try {
    const r = await scrapeOne(browser, DISTRICTS[0], cookies);
    console.log('\n=== RESULT ===');
    console.log(JSON.stringify(r, null, 2));
  } finally { await browser.close(); }
}

// ── Full scrape cycle ─────────────────────────────────────────────────────────
async function runCycle() {
  const cookies = loadCookies();
  console.log(`\n[scraper] ── Cycle ${new Date().toLocaleTimeString('zh-HK')} (cookies: ${cookies ? cookies.length : 'none'}) ──`);

  const result = { updatedAt:new Date().toISOString(), status:'ok', liveCount:0, total:DISTRICTS.length, data:{} };
  let browser;
  try {
    browser = await launchBrowser();
    for (let i = 0; i < DISTRICTS.length; i++) {
      const d = DISTRICTS[i];
      process.stdout.write(`  ${i+1}/${DISTRICTS.length} ${d.cn} ... `);
      try {
        const r = await scrapeOne(browser, d, cookies);
        result.data[d.id] = { multiplier:r.multiplier, source:r.source, updatedAt:new Date().toISOString() };
        if (r.multiplier !== null) result.liveCount++;
        console.log(r.multiplier !== null ? `${r.multiplier}x [${r.source}]` : `null [${r.source}] ${r.error||''}`);
      } catch (e) {
        result.data[d.id] = { multiplier:null, source:'error', updatedAt:new Date().toISOString() };
        console.log(`EXCEPTION: ${e.message}`);
      }
      if (i < DISTRICTS.length - 1) await new Promise(r => setTimeout(r, 2800));
    }
  } catch (e) {
    result.status = 'error';
    console.error('[scraper] Fatal:', e.message);
  } finally {
    if (browser) { try { await browser.close(); } catch (_) {} }
    result.status = result.liveCount > 0 ? 'ok' : 'simulated';
    console.log(`[scraper] Done — ${result.liveCount}/${result.total} live`);
  }

  if (GITHUB_TOKEN) {
    try { await pushSurgeJson(result); } catch (e) { console.error('[github] Push failed:', e.message); }
  } else {
    console.log('[github] Skipped (no GITHUB_TOKEN)\n' + JSON.stringify(result, null, 2));
  }
}

// ── Boot ──────────────────────────────────────────────────────────────────────
console.log('╔════════════════════════════════════════╗');
console.log('║   HK Surge Map — Local Scraper         ║');
console.log('╚════════════════════════════════════════╝');

if (SETUP_MODE) {
  runSetup().catch(e => { console.error(e); process.exit(1); });
} else if (TEST_MODE) {
  runTest().catch(e => { console.error(e); process.exit(1); });
} else {
  if (!GITHUB_TOKEN) { console.error('[error] GITHUB_TOKEN not set.\n  export GITHUB_TOKEN=ghp_xxx'); process.exit(1); }
  const hasCookies = fs.existsSync(COOKIES_FILE);
  if (!hasCookies) {
    console.log('⚠ No cookies found. Run setup first:\n  node scraper.js --setup\n');
  }
  console.log(`Map:  https://${GITHUB_OWNER}.github.io/${GITHUB_REPO}/`);
  console.log(`Tips: DEBUG=1 for verbose | --test for single district\n`);
  (async () => { await runCycle(); setInterval(runCycle, INTERVAL_MS); })();
}
