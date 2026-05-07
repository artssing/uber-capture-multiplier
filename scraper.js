#!/usr/bin/env node
/**
 * HK Surge Map — local scraper (Plan B)
 *
 * First-time setup (visible browser — log in once, profile saved to disk):
 *   node scraper.js --setup
 *
 * Normal operation (headless, reuses saved profile):
 *   GITHUB_TOKEN=ghp_xxx node scraper.js
 *
 * Debug single district:
 *   DEBUG=1 node scraper.js --test
 */

const puppeteer = require('puppeteer-extra');
const Stealth   = require('puppeteer-extra-plugin-stealth');
const fs        = require('fs');
const path      = require('path');
puppeteer.use(Stealth());

// ── Config ────────────────────────────────────────────────────────────────────
const GITHUB_TOKEN  = process.env.GITHUB_TOKEN || '';
const GITHUB_OWNER  = process.env.GITHUB_OWNER || 'artssing';
const GITHUB_REPO   = process.env.GITHUB_REPO  || 'uber-capture-multiplier';
const GITHUB_BRANCH = 'gh-pages';
const INTERVAL_MS   = 60_000;
const DEBUG         = process.env.DEBUG === '1';
const SETUP_MODE    = process.argv.includes('--setup');
const TEST_MODE     = process.argv.includes('--test');

// Persistent Chrome profile — saved across runs, survives restarts
const PROFILE_DIR = path.join(__dirname, '.uber-profile');

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

// ── Browser helpers ───────────────────────────────────────────────────────────
const COMMON_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-blink-features=AutomationControlled',
  '--lang=zh-HK',
];

function launchOpts(headless) {
  return {
    headless,
    userDataDir: PROFILE_DIR,   // <── persists login across restarts
    ignoreHTTPSErrors: true,
    args: headless
      ? COMMON_ARGS
      : [...COMMON_ARGS, '--window-size=430,900'],
    defaultViewport: headless ? { width:1280, height:800 } : null,
  };
}

// ── Setup mode ────────────────────────────────────────────────────────────────
async function runSetup() {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║  SETUP MODE                                               ║');
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log('║  1. A browser window will open                           ║');
  console.log('║  2. Log in to your Uber account                          ║');
  console.log('║  3. Navigate to the price estimator — confirm prices     ║');
  console.log('║     show (e.g. HK$45–55)                                 ║');
  console.log('║  4. Press ENTER here — profile saved, browser closes     ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  fs.mkdirSync(PROFILE_DIR, { recursive: true });

  const browser = await puppeteer.launch(launchOpts(false));
  const page = await browser.newPage();

  const TARGET = 'https://www.uber.com/en-HK/price-estimate/' +
    '?pickup_lat=22.2839&pickup_lng=114.1521&dropoff_lat=22.287&dropoff_lng=114.16';
  console.log(`Opening: ${TARGET}\n`);
  try { await page.goto(TARGET, { waitUntil:'domcontentloaded', timeout:30000 }); }
  catch (e) { console.log(`(navigation: ${e.message})`); }

  console.log('Complete login in the browser window.');
  console.log('Once prices are visible, press ENTER here...');

  await new Promise(resolve => {
    if (process.stdin.setRawMode) process.stdin.setRawMode(false);
    process.stdin.resume();
    process.stdin.once('data', resolve);
  });

  // Chrome flushes profile to disk on graceful close
  await browser.close();

  console.log(`\n✓ Profile saved to ${PROFILE_DIR}`);
  console.log('✓ Setup complete! Now run:\n  GITHUB_TOKEN=ghp_xxx node scraper.js\n');
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
      headers: {
        Authorization:`Bearer ${GITHUB_TOKEN}`,
        Accept:'application/vnd.github+json',
        'X-GitHub-Api-Version':'2022-11-28',
        'Content-Type':'application/json',
      },
      body: JSON.stringify({
        message: `surge: ${new Date().toISOString()}`,
        content,
        branch: GITHUB_BRANCH,
        ...(sha ? { sha } : {}),
      }),
    }
  );
  if (!res.ok) { const t = await res.text(); throw new Error(`GitHub PUT → ${res.status}: ${t.slice(0,200)}`); }
  console.log('[github] surge.json pushed ✓');
}

// ── Scrape one district ───────────────────────────────────────────────────────
async function scrapeOne(browser, district) {
  const page = await browser.newPage();

  await page.setRequestInterception(true);
  page.on('request', req => {
    if (['image','media','font'].includes(req.resourceType())) req.abort();
    else req.continue();
  });

  let apiSurge = null, apiPrice = null;
  let captchaDetected = false;
  let loginRequired = false;
  const netLog = [];

  page.on('response', async resp => {
    const respUrl = resp.url();
    const ct = resp.headers()['content-type'] || '';

    if (respUrl.includes('def.uber.com') || respUrl.includes('/challenge')) {
      captchaDetected = true;
      return;
    }
    if (!ct.includes('json')) return;

    let text = '';
    try { text = await resp.text(); } catch (_) { return; }
    if (!text || text.length < 5) return;

    if (DEBUG) {
      console.log(`  [net] ${resp.status()} ${respUrl.slice(0,90)}`);
      if (text.length < 2000) console.log(`       ${text.slice(0,400)}`);
    }

    try {
      const j = JSON.parse(text);
      if (j.code === 'unauthorized' || j.status === 401 || j.error === 'unauthorized') {
        loginRequired = true;
        return;
      }
    } catch (_) {}

    const sm = text.match(/"surge_multiplier"\s*:\s*([\d.]+)/);
    const lp = text.match(/"low_estimate"\s*:\s*([\d.]+)/);
    const he = text.match(/"high_estimate"\s*:\s*([\d.]+)/);
    if (sm && apiSurge === null)  { apiSurge = parseFloat(sm[1]); netLog.push(`surge=${apiSurge}`); }
    if ((lp || he) && apiPrice === null) apiPrice = lp ? parseFloat(lp[1]) : parseFloat(he[1]);
  });

  const url = `https://www.uber.com/en-HK/price-estimate/` +
    `?pickup_lat=${district.lat}&pickup_lng=${district.lng}` +
    `&dropoff_lat=${DROPOFF.lat}&dropoff_lng=${DROPOFF.lng}`;

  let loaded = false;
  let lastError = '';
  let finalUrl = '', pageTitle = '';

  try {
    const resp = await page.goto(url, { waitUntil:'domcontentloaded', timeout:25000 });
    const status = resp ? resp.status() : 0;
    finalUrl = page.url();
    pageTitle = await page.title().catch(() => '');

    console.log(`         [${status}] ${pageTitle.slice(0,40)} — ${finalUrl.slice(0,65)}`);

    if (captchaDetected || finalUrl.includes('def.uber.com') || finalUrl.includes('/challenge')) {
      lastError = 'CAPTCHA — run: node scraper.js --setup';
    } else if (finalUrl.includes('/login') || finalUrl.includes('/signin') || finalUrl.includes('auth.uber')) {
      loginRequired = true;
      lastError = 'NOT LOGGED IN — run: node scraper.js --setup';
    } else if (status === 403) {
      lastError = 'HTTP 403 blocked';
    } else {
      await new Promise(r => setTimeout(r, 2500));

      // Click "See prices" button
      const clicked = await page.evaluate(() => {
        const bySelector = document.querySelector('button[data-testid="submit-button"], button[type="submit"]');
        if (bySelector) { bySelector.click(); return bySelector.textContent.trim().slice(0,40); }
        const all = [...document.querySelectorAll('button,[role="button"]')];
        const match = all.find(b => /see prices|get estimate|查看/i.test(b.textContent));
        if (match) { match.click(); return match.textContent.trim().slice(0,40); }
        return `none (${all.length} buttons)`;
      });
      if (DEBUG) console.log(`  [click] ${clicked}`);

      await new Promise(r => setTimeout(r, 6000));
      loaded = true;
    }
  } catch (e) {
    lastError = e.message.slice(0, 80);
    if (DEBUG) console.log(`  [goto error] ${lastError}`);
  }

  // DOM fallback
  let domSurge = null, domPrice = null;
  if (loaded && apiSurge === null) {
    try {
      const r = await page.evaluate(() => {
        const body = document.body.innerText || '';
        const scripts = [...document.querySelectorAll('script')].map(s => s.textContent).join('\n');
        const all = body + '\n' + scripts;
        const sm = all.match(/"surge_multiplier"\s*:\s*([\d.]+)/) || all.match(/(\d+\.\d+)\s*[x×X]/);
        const pr = all.match(/"low_estimate"\s*:\s*([\d.]+)/) || body.match(/HK\$\s*(\d+(?:\.\d+)?)/);
        return {
          surge: sm ? parseFloat(sm[1]) : null,
          price: pr ? parseFloat(pr[1]) : null,
          snippet: body.slice(0,400).replace(/\s+/g,' ').trim(),
        };
      });
      domSurge = r.surge;
      domPrice = r.price;
      if (DEBUG) console.log(`  [dom] surge=${domSurge} price=${domPrice}`);
      if (DEBUG) console.log(`  [dom] body: ${r.snippet.slice(0,200)}`);
      if (apiSurge === null && domSurge === null && domPrice === null) {
        console.log(`         body: ${r.snippet.slice(0,180)}`);
      }
    } catch (_) {}
  }

  await page.close();

  if (captchaDetected || (lastError && lastError.includes('CAPTCHA'))) {
    console.error('\n⚠  CAPTCHA detected — run: node scraper.js --setup\n');
    process.exit(1);
  }
  if (loginRequired || (lastError && lastError.includes('NOT LOGGED IN'))) {
    console.error('\n⚠  Not logged in — run: node scraper.js --setup  (log in to Uber)\n');
    process.exit(1);
  }

  let multiplier = null, price = apiPrice ?? domPrice, source = 'no_data';
  if (apiSurge != null)      { multiplier = clamp(apiSurge);  source = 'api'; }
  else if (domSurge != null) { multiplier = clamp(domSurge);  source = 'dom'; }
  else if (price != null) {
    if (!basePrices[district.id]) {
      basePrices[district.id] = price; multiplier = 1.0; source = 'baseline';
    } else {
      multiplier = clamp(price / basePrices[district.id]); source = 'ratio';
    }
  }

  return { multiplier, price, source, lastError };
}

function clamp(m) {
  if (m == null || isNaN(m)) return null;
  return Math.round(Math.max(1.0, Math.min(3.5, m)) * 10) / 10;
}

// ── Test mode ─────────────────────────────────────────────────────────────────
async function runTest() {
  process.env.DEBUG = '1';
  const profileExists = fs.existsSync(PROFILE_DIR);
  console.log(`=== TEST MODE (中西區) — profile: ${profileExists ? '✓ exists' : '✗ missing — run --setup'} ===\n`);
  const browser = await puppeteer.launch(launchOpts(true));
  try {
    const r = await scrapeOne(browser, DISTRICTS[0]);
    console.log('\n=== RESULT ===');
    console.log(JSON.stringify(r, null, 2));
  } finally { await browser.close(); }
}

// ── Full scrape cycle ─────────────────────────────────────────────────────────
async function runCycle() {
  const profileExists = fs.existsSync(PROFILE_DIR);
  console.log(`\n[scraper] ── Cycle ${new Date().toLocaleTimeString('zh-HK')} (profile: ${profileExists ? '✓' : '✗ missing'}) ──`);

  if (!profileExists) {
    console.log('[scraper] No profile found. Run setup first:\n  node scraper.js --setup');
    return;
  }

  const result = { updatedAt:new Date().toISOString(), status:'ok', liveCount:0, total:DISTRICTS.length, data:{} };
  let browser;
  try {
    browser = await puppeteer.launch(launchOpts(true));
    for (let i = 0; i < DISTRICTS.length; i++) {
      const d = DISTRICTS[i];
      process.stdout.write(`  ${i+1}/${DISTRICTS.length} ${d.cn} ... `);
      try {
        const r = await scrapeOne(browser, d);
        result.data[d.id] = { multiplier:r.multiplier, source:r.source, updatedAt:new Date().toISOString() };
        if (r.multiplier !== null) result.liveCount++;
        console.log(r.multiplier !== null
          ? `${r.multiplier}x [${r.source}]`
          : `null [${r.source}]${r.lastError ? ' — ' + r.lastError : ''}`
        );
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
    if (browser) try { await browser.close(); } catch (_) {}
    result.status = result.liveCount > 0 ? 'ok' : 'simulated';
    console.log(`[scraper] Done — ${result.liveCount}/${result.total} live`);
  }

  if (GITHUB_TOKEN) {
    try { await pushSurgeJson(result); } catch (e) { console.error('[github] Push failed:', e.message); }
  } else {
    console.log('[github] Skipped — no GITHUB_TOKEN');
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
  if (!GITHUB_TOKEN) {
    console.error('[error] GITHUB_TOKEN not set.\n  export GITHUB_TOKEN=ghp_xxx');
    process.exit(1);
  }
  console.log(`Map:  https://${GITHUB_OWNER}.github.io/${GITHUB_REPO}/`);
  console.log(`Tips: DEBUG=1 for verbose | --test for single district\n`);
  (async () => { await runCycle(); setInterval(runCycle, INTERVAL_MS); })();
}
