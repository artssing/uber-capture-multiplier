#!/usr/bin/env node
/**
 * HK Surge Map — local scraper (Plan B)
 *
 * First-time setup (login + CAPTCHA, saves cookies):
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

// ── Setup mode: visible browser, user logs in + solves CAPTCHA ────────────────
async function runSetup() {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║  SETUP MODE — Login & Cookie Capture                     ║');
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log('║  A browser window will open uber.com                     ║');
  console.log('║  1. Complete any CAPTCHA / security check                ║');
  console.log('║  2. LOG IN to your Uber account (required for prices)    ║');
  console.log('║  3. Navigate to the price estimator page if needed       ║');
  console.log('║  4. Once prices are visible, press ENTER here            ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  const browser = await puppeteer.launch({
    headless: false,
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
  console.log(`Opening: ${TARGET}\n`);
  try { await page.goto(TARGET, { waitUntil: 'domcontentloaded', timeout: 30000 }); }
  catch (e) { console.log(`(goto: ${e.message})`); }

  console.log('Complete login / CAPTCHA in the browser window.');
  console.log('When prices are visible on the page, press ENTER here...');

  await new Promise(resolve => {
    process.stdin.setRawMode && process.stdin.setRawMode(false);
    process.stdin.resume();
    process.stdin.once('data', resolve);
  });

  const cookies = await page.cookies();
  saveCookies(cookies);

  // Also grab localStorage tokens if present
  const storage = await page.evaluate(() => {
    const out = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (/token|session|auth|user/i.test(k)) out[k] = localStorage.getItem(k);
    }
    return out;
  }).catch(() => ({}));

  if (Object.keys(storage).length) {
    fs.writeFileSync(path.join(__dirname, '.uber-storage.json'), JSON.stringify(storage, null, 2));
    console.log(`\n✓ Saved localStorage tokens to .uber-storage.json`);
  }

  console.log(`✓ Saved ${cookies.length} cookies to .uber-cookies.json`);
  console.log('✓ Setup complete! Now run:\n  GITHUB_TOKEN=ghp_xxx node scraper.js\n');
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

  await page.setUserAgent(
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
    'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
  );
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'zh-HK,zh;q=0.9,en;q=0.8' });
  await page.setViewport({ width:1280, height:800 });

  if (savedCookies && savedCookies.length > 0) {
    await page.setCookie(...savedCookies);
  }

  await page.setRequestInterception(true);
  page.on('request', req => {
    if (['image','media','font'].includes(req.resourceType())) req.abort();
    else req.continue();
  });

  // Use flags instead of throwing from async event handlers
  let apiSurge = null, apiPrice = null;
  let captchaDetected = false;
  let loginRequired = false;
  const netLog = [];

  page.on('response', async resp => {
    const respUrl = resp.url();
    const ct = resp.headers()['content-type'] || '';

    // Detect CAPTCHA challenge page
    if (respUrl.includes('def.uber.com') || respUrl.includes('/challenge')) {
      captchaDetected = true;
      netLog.push(`CAPTCHA: ${respUrl.slice(0, 80)}`);
      return;
    }

    if (!ct.includes('json')) return;

    let text = '';
    try { text = await resp.text(); } catch (_) { return; }
    if (!text || text.length < 5) return;

    if (DEBUG) console.log(`  [net] ${resp.status()} ${respUrl.slice(0,90)}`);
    if (DEBUG && text.length < 3000) console.log(`       ${text.slice(0,400)}`);

    // Check for auth errors in JSON
    try {
      const j = JSON.parse(text);
      if (j.code === 'unauthorized' || j.error === 'unauthorized' || j.status === 401) {
        loginRequired = true;
        netLog.push(`AUTH ERROR: ${respUrl.slice(0,60)}`);
        return;
      }
    } catch (_) {}

    // Extract surge multiplier
    const sm = text.match(/"surge_multiplier"\s*:\s*([\d.]+)/);
    const lp = text.match(/"low_estimate"\s*:\s*([\d.]+)/);
    const he = text.match(/"high_estimate"\s*:\s*([\d.]+)/);
    const fare = text.match(/"fare"\s*:\s*\{[^}]*"value"\s*:\s*([\d.]+)/);
    if (sm && apiSurge === null) {
      apiSurge = parseFloat(sm[1]);
      netLog.push(`surge=${apiSurge} from ${respUrl.slice(0,50)}`);
    }
    if ((lp || he) && apiPrice === null) {
      apiPrice = lp ? parseFloat(lp[1]) : parseFloat(he[1]);
    }
    if (fare && apiPrice === null) {
      apiPrice = parseFloat(fare[1]);
    }
  });

  const url = `https://www.uber.com/en-HK/price-estimate/?pickup_lat=${district.lat}&pickup_lng=${district.lng}&dropoff_lat=${DROPOFF.lat}&dropoff_lng=${DROPOFF.lng}`;

  let pageTitle = '', finalUrl = '', bodySnippet = '';
  let lastError = '';
  let loaded = false;

  try {
    if (DEBUG) console.log(`  [goto] ${url.slice(0,90)}`);
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
    const status = resp ? resp.status() : 0;
    finalUrl = page.url();
    pageTitle = await page.title().catch(() => '');

    // Always visible: what page actually loaded
    console.log(`         title="${pageTitle}" url=${finalUrl.slice(0,70)}`);

    if (finalUrl.includes('def.uber.com') || finalUrl.includes('/challenge')) {
      captchaDetected = true;
      lastError = 'CAPTCHA';
    } else if (finalUrl.includes('/login') || finalUrl.includes('/signin') || finalUrl.includes('auth.uber')) {
      loginRequired = true;
      lastError = 'LOGIN_REQUIRED';
    } else if (status === 403) {
      lastError = `HTTP 403`;
    } else if (!finalUrl.startsWith('chrome-error')) {
      // Page loaded — wait for hydration then try clicking
      await new Promise(r => setTimeout(r, 2500));

      const clickResult = await page.evaluate(() => {
        // Try multiple selectors for the "See prices" button
        const selectors = [
          'button[data-testid="submit-button"]',
          'button[type="submit"]',
        ];
        for (const sel of selectors) {
          const el = document.querySelector(sel);
          if (el) { el.click(); return `clicked: ${sel}`; }
        }
        // Fallback: text match
        const btns = [...document.querySelectorAll('button, [role="button"]')];
        const target = btns.find(b => /see prices|get estimate|查看價格|查看/i.test(b.textContent));
        if (target) { target.click(); return `clicked text: ${target.textContent.trim().slice(0,30)}`; }
        return `no button (${btns.length} buttons found)`;
      });
      if (DEBUG) console.log(`  [click] ${clickResult}`);

      // Wait for price API responses
      await new Promise(r => setTimeout(r, 6000));
      loaded = true;
    }
  } catch (e) {
    lastError = e.message.slice(0, 80);
    if (DEBUG) console.log(`  [goto] error: ${lastError}`);
  }

  // DOM fallback scan
  let domSurge = null, domPrice = null;
  if (loaded && apiSurge === null) {
    try {
      const r = await page.evaluate(() => {
        const text = document.body.innerText || '';
        const scripts = [...document.querySelectorAll('script')].map(s => s.textContent).join('\n');
        const all = text + '\n' + scripts;
        const smMatch = all.match(/"surge_multiplier"\s*:\s*([\d.]+)/) || all.match(/(\d+\.\d+)\s*[x×X]/);
        const priceMatch = all.match(/"low_estimate"\s*:\s*([\d.]+)/) || text.match(/HK\$\s*(\d+(?:\.\d+)?)/);
        return {
          surge: smMatch ? parseFloat(smMatch[1]) : null,
          price: priceMatch ? parseFloat(priceMatch[1]) : null,
          snippet: text.slice(0, 500).replace(/\s+/g, ' ').trim(),
        };
      });
      domSurge = r.surge;
      domPrice = r.price;
      bodySnippet = r.snippet;
      if (DEBUG) console.log(`  [dom] surge=${domSurge} price=${domPrice}`);
      if (DEBUG) console.log(`  [dom] body: ${bodySnippet.slice(0,200)}`);
      // Always show body snippet when no data found
      if (apiSurge === null && domSurge === null && !DEBUG) {
        console.log(`         body: ${bodySnippet.slice(0,180)}`);
      }
    } catch (_) {}
  }

  await page.close();

  // Report CAPTCHA / login issues clearly
  if (captchaDetected) {
    console.error('\n⚠  CAPTCHA detected — run: node scraper.js --setup\n');
    process.exit(1);
  }
  if (loginRequired) {
    console.error('\n⚠  Login required — run: node scraper.js --setup  (log in to Uber in the browser)\n');
    process.exit(1);
  }

  let multiplier = null, price = apiPrice ?? domPrice, source = 'no_data';
  if (apiSurge != null)      { multiplier = clamp(apiSurge);  source = 'api'; }
  else if (domSurge != null) { multiplier = clamp(domSurge);  source = 'dom'; }
  else if (price != null) {
    if (!basePrices[district.id]) { basePrices[district.id] = price; multiplier = 1.0; source = 'baseline'; }
    else { multiplier = clamp(price / basePrices[district.id]); source = 'ratio'; }
  }

  const netSummary = netLog.length ? netLog.join(' | ') : `no JSON captured (url=${finalUrl.slice(0,50)})`;
  return { multiplier, price, source, netSummary, lastError };
}

function clamp(m) {
  if (m == null || isNaN(m)) return null;
  return Math.round(Math.max(1.0, Math.min(3.5, m)) * 10) / 10;
}

// ── Test mode ─────────────────────────────────────────────────────────────────
async function runTest() {
  console.log('=== TEST MODE (中西區, DEBUG forced on) ===');
  process.env.DEBUG = '1';
  const cookies = loadCookies();
  if (!cookies) console.log('⚠ No cookies — run: node scraper.js --setup\n');
  else console.log(`✓ Loaded ${cookies.length} cookies\n`);
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
  console.log(`\n[scraper] ── Cycle ${new Date().toLocaleTimeString('zh-HK')} (cookies: ${cookies ? cookies.length : 'NONE — run --setup!'}) ──`);
  if (!cookies) {
    console.log('[scraper] Skipping: no cookies. Run: node scraper.js --setup');
    return;
  }

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
        const label = r.multiplier !== null
          ? `${r.multiplier}x [${r.source}]`
          : `null [${r.source}] — ${r.netSummary.slice(0,60)}`;
        console.log(label);
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
    console.log('[github] Skipped (no GITHUB_TOKEN)\n' + JSON.stringify(result.data, null, 2));
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
  console.log(`Map:  https://${GITHUB_OWNER}.github.io/${GITHUB_REPO}/`);
  console.log(`Tips: DEBUG=1 for verbose | --test for single district\n`);
  (async () => { await runCycle(); setInterval(runCycle, INTERVAL_MS); })();
}
