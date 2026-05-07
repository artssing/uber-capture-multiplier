#!/usr/bin/env node
/**
 * HK Surge Map — local scraper (Plan B)
 *
 * First-time setup (visible browser, log in once):
 *   node scraper.js --setup
 *
 * Manual scrape (pause on each district, fix CAPTCHA by hand):
 *   GITHUB_TOKEN=ghp_xxx node scraper.js --manual
 *
 * Normal automated operation:
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
const MANUAL_MODE   = process.argv.includes('--manual');
const PROFILE_DIR   = path.join(__dirname, '.uber-profile');

// Wait for the user to press ENTER in the terminal
function waitForEnter(prompt) {
  process.stdout.write(prompt);
  return new Promise(resolve => {
    if (process.stdin.setRawMode) process.stdin.setRawMode(false);
    process.stdin.resume();
    process.stdin.once('data', () => { process.stdin.pause(); resolve(); });
  });
}

// ── Districts ─────────────────────────────────────────────────────────────────
const DISTRICTS = [
  { id:'central_western', cn:'中西區',  en:'Central, Hong Kong Island',  lat:22.2839, lng:114.1521 },
  { id:'wan_chai',        cn:'灣仔區',  en:'Wan Chai, Hong Kong Island',  lat:22.2783, lng:114.1827 },
  { id:'eastern',         cn:'東區',    en:'Quarry Bay, Hong Kong',       lat:22.2843, lng:114.2264 },
  { id:'southern',        cn:'南區',    en:'Aberdeen, Hong Kong',         lat:22.2468, lng:114.1584 },
  { id:'yau_tsim_mong',   cn:'油尖旺區',en:'Mong Kok, Kowloon',          lat:22.3126, lng:114.1709 },
  { id:'sham_shui_po',    cn:'深水埗區',en:'Sham Shui Po, Kowloon',      lat:22.3418, lng:114.1624 },
  { id:'kowloon_city',    cn:'九龍城區',en:'Kowloon City, Kowloon',      lat:22.3277, lng:114.1918 },
  { id:'wong_tai_sin',    cn:'黃大仙區',en:'Wong Tai Sin, Kowloon',      lat:22.3508, lng:114.2026 },
  { id:'kwun_tong',       cn:'觀塘區',  en:'Kwun Tong, Kowloon',         lat:22.3165, lng:114.2263 },
  { id:'tsuen_wan',       cn:'荃灣區',  en:'Tsuen Wan, New Territories',  lat:22.3716, lng:114.1133 },
  { id:'kwai_tsing',      cn:'葵青區',  en:'Kwai Chung, New Territories', lat:22.3636, lng:114.1328 },
  { id:'tuen_mun',        cn:'屯門區',  en:'Tuen Mun, New Territories',   lat:22.3910, lng:113.9777 },
  { id:'yuen_long',       cn:'元朗區',  en:'Yuen Long, New Territories',  lat:22.4445, lng:114.0222 },
  { id:'north',           cn:'北區',    en:'Sheung Shui, New Territories',lat:22.4942, lng:114.1388 },
  { id:'tai_po',          cn:'大埔區',  en:'Tai Po, New Territories',     lat:22.4513, lng:114.1645 },
  { id:'sha_tin',         cn:'沙田區',  en:'Sha Tin, New Territories',    lat:22.3877, lng:114.1956 },
  { id:'sai_kung',        cn:'西貢區',  en:'Sai Kung, New Territories',   lat:22.3814, lng:114.2709 },
  { id:'islands',         cn:'離島區',  en:'Tung Chung, Lantau Island',   lat:22.2612, lng:113.9448 },
];
const DROPOFF = { lat:22.2870, lng:114.1600, en:'Central Ferry Piers, Hong Kong' };

const basePrices = {};

// ── Chrome helpers ────────────────────────────────────────────────────────────
function getChromePath() {
  const c = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
  ];
  return c.find(p => fs.existsSync(p));
}

function launchOpts(forSetup = false) {
  const executablePath = getChromePath();
  if (executablePath) console.log(`[browser] ${executablePath.split('/').pop()}`);
  return {
    headless: false,
    executablePath,
    userDataDir: PROFILE_DIR,
    ignoreHTTPSErrors: true,
    args: [
      '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled', '--lang=zh-HK',
      '--window-size=420,700', '--window-position=30,30',
    ],
    defaultViewport: forSetup ? null : { width:1280, height:800 },
  };
}

// ── Setup mode ────────────────────────────────────────────────────────────────
async function runSetup() {
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║  SETUP MODE                                           ║');
  console.log('╠══════════════════════════════════════════════════════╣');
  console.log('║  1. Chrome window opens on uber.com                  ║');
  console.log('║  2. Log in to your Uber account                      ║');
  console.log('║  3. Enter a pickup + dropoff, confirm prices appear  ║');
  console.log('║  4. Press ENTER here — profile saved, window closes  ║');
  console.log('╚══════════════════════════════════════════════════════╝\n');

  fs.mkdirSync(PROFILE_DIR, { recursive: true });
  const browser = await puppeteer.launch(launchOpts(true));
  const page = await browser.newPage();
  const url = `https://www.uber.com/en-HK/price-estimate/?pickup_lat=22.2839&pickup_lng=114.1521&dropoff_lat=22.287&dropoff_lng=114.16`;
  console.log(`Opening: ${url}\n`);
  try { await page.goto(url, { waitUntil:'domcontentloaded', timeout:30000 }); } catch (e) { console.log(`(${e.message})`); }

  console.log('Log in in the Chrome window. When prices are visible, press ENTER...');
  await new Promise(resolve => {
    if (process.stdin.setRawMode) process.stdin.setRawMode(false);
    process.stdin.resume();
    process.stdin.once('data', resolve);
  });

  await browser.close();
  console.log(`\n✓ Profile saved → ${PROFILE_DIR}`);
  console.log('✓ Done. Run:  GITHUB_TOKEN=ghp_xxx node scraper.js\n');
  process.exit(0);
}

// ── GitHub API ────────────────────────────────────────────────────────────────
async function githubGetSha() {
  const r = await fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/surge.json?ref=${GITHUB_BRANCH}`,
    { headers: { Authorization:`Bearer ${GITHUB_TOKEN}`, Accept:'application/vnd.github+json', 'X-GitHub-Api-Version':'2022-11-28' } }
  );
  if (r.status === 404) return undefined;
  if (!r.ok) throw new Error(`GitHub GET ${r.status}`);
  return (await r.json()).sha;
}

async function pushSurgeJson(payload) {
  const content = Buffer.from(JSON.stringify(payload, null, 2)).toString('base64');
  let sha; try { sha = await githubGetSha(); } catch (_) {}
  const r = await fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/surge.json`,
    {
      method: 'PUT',
      headers: { Authorization:`Bearer ${GITHUB_TOKEN}`, Accept:'application/vnd.github+json', 'X-GitHub-Api-Version':'2022-11-28', 'Content-Type':'application/json' },
      body: JSON.stringify({ message:`surge: ${new Date().toISOString()}`, content, branch:GITHUB_BRANCH, ...(sha ? {sha} : {}) }),
    }
  );
  if (!r.ok) throw new Error(`GitHub PUT ${r.status}: ${(await r.text()).slice(0,200)}`);
  console.log('[github] ✓ pushed');
}

// ── Fill Uber price estimate form ─────────────────────────────────────────────
async function fillUberForm(page, district) {
  if (DEBUG) {
    const inputs = await page.evaluate(() =>
      [...document.querySelectorAll('input')].filter(el => el.offsetParent !== null).map(el => ({
        ph: el.placeholder, label: el.getAttribute('aria-label'), id: el.id, val: el.value,
      }))
    );
    console.log('  [inputs]', JSON.stringify(inputs));
  }

  // Use known aria-labels (discovered from debug output); fall back to position
  async function findInput(labelPatterns) {
    // Try aria-label selector first
    for (const pat of labelPatterns) {
      const el = await page.$(`[aria-label="${pat}"]`);
      if (el) return el;
    }
    // Fallback: nth visible input
    const allInputs = await page.$$('input');
    const visible = [];
    for (const h of allInputs) {
      const v = await h.evaluate(el => el.offsetParent !== null && el.type !== 'hidden');
      if (v) visible.push(h);
      if (visible.length === 2) break;
    }
    return labelPatterns.includes('取車地點') ? visible[0] : visible[1];
  }

  async function typeAndPick(handle, text) {
    if (!handle) { console.log(`  [form] input not found for "${text}"`); return; }
    // Triple-click selects existing text, then typing replaces it
    await handle.click({ clickCount: 3 });
    await handle.type(text, { delay: 70 });
    if (DEBUG) console.log(`  [type] "${text}"`);

    // Wait for pudoLocationSearch to respond and dropdown to render
    await new Promise(r => setTimeout(r, 2500));

    // Click first autocomplete suggestion
    const picked = await page.evaluate(() => {
      const opts = [...document.querySelectorAll(
        '[role="option"], [role="listitem"], [data-testid*="suggestion"], li[id*="option"]'
      )];
      if (opts.length > 0) { opts[0].click(); return opts[0].textContent.trim().slice(0, 60); }
      return null;
    });

    if (picked) {
      if (DEBUG) console.log(`  [autocomplete] clicked: "${picked}"`);
    } else {
      // Fallback: arrow key + enter
      await page.keyboard.press('ArrowDown');
      await new Promise(r => setTimeout(r, 400));
      await page.keyboard.press('Enter');
      if (DEBUG) console.log('  [autocomplete] ArrowDown+Enter fallback');
    }
    await new Promise(r => setTimeout(r, 800));
  }

  const pickupHandle = await findInput(['取車地點', 'Pickup location', 'Enter pickup location']);
  const dropoffHandle = await findInput(['下車地點', 'Dropoff location', 'Enter destination']);

  await typeAndPick(pickupHandle, district.en);
  await typeAndPick(dropoffHandle, DROPOFF.en);

  // Click "See prices" / submit
  const clicked = await page.evaluate(() => {
    const candidates = [
      document.querySelector('button[data-testid*="submit"]'),
      document.querySelector('button[type="submit"]'),
      ...[...document.querySelectorAll('button,[role="button"]')]
        .filter(b => /see prices|get estimate|查看|確認|估價/i.test(b.textContent)),
    ].filter(Boolean);
    if (candidates[0]) { candidates[0].click(); return candidates[0].textContent.trim().slice(0, 40); }
    return null;
  });
  if (DEBUG) console.log(`  [submit] ${clicked || 'no button found'}`);
  return !!clicked;
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
  let captchaFlag = false;

  page.on('response', async resp => {
    const u = resp.url();
    if (u.includes('def.uber.com') || u.includes('/challenge')) { captchaFlag = true; return; }
    const ct = resp.headers()['content-type'] || '';
    if (!ct.includes('json')) return;
    let text = ''; try { text = await resp.text(); } catch (_) { return; }
    if (!text || text.length < 5) return;
    if (DEBUG) { console.log(`  [net] ${resp.status()} ${u.slice(0,90)}`); if (text.length < 2000) console.log(`       ${text.slice(0,300)}`); }
    const sm = text.match(/"surge_multiplier"\s*:\s*([\d.]+)/);
    const lp = text.match(/"low_estimate"\s*:\s*([\d.]+)/);
    const he = text.match(/"high_estimate"\s*:\s*([\d.]+)/);
    if (sm && apiSurge === null)  apiSurge = parseFloat(sm[1]);
    if ((lp || he) && apiPrice === null) apiPrice = lp ? parseFloat(lp[1]) : parseFloat(he[1]);
  });

  // Navigate to base estimate page (no params — SPA ignores them anyway)
  const url = 'https://www.uber.com/en-HK/price-estimate/';
  let finalUrl = '', pageTitle = '', loaded = false, lastError = '';

  try {
    const resp = await page.goto(url, { waitUntil:'domcontentloaded', timeout:25000 });
    const status = resp ? resp.status() : 0;
    finalUrl  = page.url();
    pageTitle = await page.title().catch(() => '');
    console.log(`         [${status}] ${pageTitle.slice(0,45)} — ${finalUrl.slice(0,70)}`);

    if (captchaFlag || finalUrl.includes('def.uber.com')) {
      lastError = 'CAPTCHA';
    } else if (finalUrl.includes('/login') || finalUrl.includes('/signin') || finalUrl.includes('auth.uber')) {
      lastError = 'LOGIN_REQUIRED';
    } else if (status === 403) {
      lastError = 'HTTP_403';
    } else {
      // Wait for page to hydrate
      await new Promise(r => setTimeout(r, 3000));

      // Fill the form automatically
      const formFilled = await fillUberForm(page, district);
      if (DEBUG) console.log(`  [form] filled=${formFilled}`);

      // Wait for price API response (up to 10s)
      await new Promise(r => setTimeout(r, 10000));
      loaded = true;
    }
  } catch (e) {
    lastError = e.message.slice(0, 80);
    if (DEBUG) console.log(`  [goto error] ${lastError}`);
  }

  // DOM fallback scan
  let domSurge = null, domPrice = null;
  if (loaded && apiSurge === null) {
    try {
      const r = await page.evaluate(() => {
        const body = document.body.innerText || '';
        const scripts = [...document.querySelectorAll('script')].map(s => s.textContent).join('\n');
        const all = body + '\n' + scripts;
        const sm = all.match(/"surge_multiplier"\s*:\s*([\d.]+)/) || body.match(/(\d+\.\d+)\s*[×xX]/);
        const pr = all.match(/"low_estimate"\s*:\s*([\d.]+)/) || body.match(/HK\$\s*(\d+(?:\.\d+)?)/);
        return {
          surge: sm ? parseFloat(sm[1]) : null,
          price: pr ? parseFloat(pr[1]) : null,
          snippet: body.slice(0, 500).replace(/\s+/g, ' ').trim(),
        };
      });
      domSurge = r.surge; domPrice = r.price;
      if (DEBUG) console.log(`  [dom] surge=${domSurge} price=${domPrice}\n  [dom] ${r.snippet.slice(0,200)}`);
      if (!DEBUG && apiSurge === null && domSurge === null && domPrice === null) {
        console.log(`         body: ${r.snippet.slice(0,200)}`);
      }
    } catch (_) {}
  }

  await page.close();

  if (captchaFlag || lastError === 'CAPTCHA') {
    console.log(`         ⚠ CAPTCHA — will retry in next cycle`);
    return { multiplier: null, price: null, source: 'captcha', lastError: 'CAPTCHA' };
  }
  if (lastError === 'LOGIN_REQUIRED') {
    console.log(`         ⚠ Not logged in — run: node scraper.js --setup`);
    return { multiplier: null, price: null, source: 'login', lastError };
  }

  let multiplier = null, price = apiPrice ?? domPrice, source = 'no_data';
  if (apiSurge != null)      { multiplier = clamp(apiSurge);  source = 'api'; }
  else if (domSurge != null) { multiplier = clamp(domSurge);  source = 'dom'; }
  else if (price != null) {
    if (!basePrices[district.id]) { basePrices[district.id] = price; multiplier = 1.0; source = 'baseline'; }
    else { multiplier = clamp(price / basePrices[district.id]); source = 'ratio'; }
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
  const ok = fs.existsSync(PROFILE_DIR);
  console.log(`=== TEST MODE (中西區) — profile: ${ok ? '✓' : '✗ run --setup'} ===\n`);
  const browser = await puppeteer.launch(launchOpts(true));
  try {
    const r = await scrapeOne(browser, DISTRICTS[0]);
    console.log('\n=== RESULT ===');
    console.log(JSON.stringify(r, null, 2));
  } finally { await browser.close(); }
}

// ── Full scrape cycle ─────────────────────────────────────────────────────────
async function runCycle() {
  if (!fs.existsSync(PROFILE_DIR)) {
    console.log('[scraper] No profile. Run: node scraper.js --setup'); return;
  }
  console.log(`\n[scraper] ── Cycle ${new Date().toLocaleTimeString('zh-HK')} ──`);

  const result = { updatedAt:new Date().toISOString(), status:'ok', liveCount:0, total:DISTRICTS.length, data:{} };
  let browser;
  try {
    browser = await puppeteer.launch(launchOpts(false));
    for (let i = 0; i < DISTRICTS.length; i++) {
      const d = DISTRICTS[i];
      process.stdout.write(`  ${i+1}/${DISTRICTS.length} ${d.cn} ... `);
      try {
        const r = await scrapeOne(browser, d);
        result.data[d.id] = { multiplier:r.multiplier, source:r.source, updatedAt:new Date().toISOString() };
        if (r.multiplier !== null) result.liveCount++;
        console.log(r.multiplier !== null
          ? `${r.multiplier}x [${r.source}]`
          : `null [${r.source}]${r.lastError ? ' ' + r.lastError : ''}`
        );
      } catch (e) {
        result.data[d.id] = { multiplier:null, source:'error', updatedAt:new Date().toISOString() };
        console.log(`EXCEPTION: ${e.message}`);
      }
      // Longer delay: looks less automated
      if (i < DISTRICTS.length - 1) {
        const delay = 5000 + Math.random() * 3000; // 5–8s random
        await new Promise(r => setTimeout(r, delay));
      }
    }
  } catch (e) {
    result.status = 'error'; console.error('[scraper] Fatal:', e.message);
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

// ── Manual mode ───────────────────────────────────────────────────────────────
// Visits each district one by one with a VISIBLE browser.
// If CAPTCHA / empty form / no data → pauses and lets you fix it manually.
// Press ENTER to capture whatever is on screen and move to the next district.
async function runManual() {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║  MANUAL MODE — interactive scrape                        ║');
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log('║  Browser opens for each district.                        ║');
  console.log('║  If CAPTCHA / empty page appears, fix it manually.       ║');
  console.log('║  When prices are visible, press ENTER to capture & next. ║');
  console.log('║  Press ENTER immediately to skip a district.             ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  fs.mkdirSync(PROFILE_DIR, { recursive: true });
  const browser = await puppeteer.launch(launchOpts(true));  // forSetup=true → larger window
  const page = await browser.newPage();

  await page.setRequestInterception(true);
  page.on('request', req => {
    if (['image','media','font'].includes(req.resourceType())) req.abort();
    else req.continue();
  });

  const results = {};

  for (let i = 0; i < DISTRICTS.length; i++) {
    const d = DISTRICTS[i];
    console.log(`\n── ${i+1}/${DISTRICTS.length} ${d.cn} (${d.en}) ──`);

    // Reset per-district API listeners
    let apiSurge = null, apiPrice = null;
    const responseHandler = async resp => {
      const u = resp.url();
      if (u.includes('def.uber.com')) return;
      const ct = resp.headers()['content-type'] || '';
      if (!ct.includes('json')) return;
      let text = ''; try { text = await resp.text(); } catch (_) { return; }
      const sm = text.match(/"surge_multiplier"\s*:\s*([\d.]+)/);
      const lp = text.match(/"low_estimate"\s*:\s*([\d.]+)/);
      const he = text.match(/"high_estimate"\s*:\s*([\d.]+)/);
      if (sm && apiSurge === null) { apiSurge = parseFloat(sm[1]); console.log(`  [net] ✓ surge=${apiSurge}`); }
      if ((lp || he) && apiPrice === null) apiPrice = lp ? parseFloat(lp[1]) : parseFloat(he[1]);
    };
    page.on('response', responseHandler);

    try {
      await page.goto('https://www.uber.com/en-HK/price-estimate/', { waitUntil: 'domcontentloaded', timeout: 25000 });
    } catch (e) {
      console.log(`  [goto error] ${e.message.slice(0,60)}`);
    }

    const finalUrl  = page.url();
    const pageTitle = await page.title().catch(() => '');
    console.log(`  Page: ${pageTitle.slice(0,50)}`);
    console.log(`  URL:  ${finalUrl.slice(0,80)}`);

    if (finalUrl.includes('def.uber.com') || finalUrl.includes('/challenge')) {
      console.log('  ⚠  CAPTCHA — please solve it in the browser window, then press ENTER.');
    } else if (finalUrl.includes('/login') || finalUrl.includes('/signin')) {
      console.log('  ⚠  Login page — please log in, then press ENTER.');
    } else {
      // Auto-fill the form
      await new Promise(r => setTimeout(r, 3000));
      console.log(`  [form] Auto-filling: "${d.en}" → "${DROPOFF.en}"`);
      await fillUberForm(page, d).catch(e => console.log(`  [form error] ${e.message}`));
    }

    // Wait 4s for API responses to arrive after button click
    await new Promise(r => setTimeout(r, 4000));

    // Show what we have so far
    if (apiSurge !== null) {
      console.log(`  ✓ API data: surge=${apiSurge} price=${apiPrice}`);
    } else {
      console.log('  No API data yet — check browser window.');
    }

    // Always pause for user confirmation
    await waitForEnter('  Press ENTER to capture & continue (or fix browser first)... ');

    // Capture whatever is currently on screen
    page.off('response', responseHandler);
    let domSurge = null, domPrice = null;
    try {
      const r = await page.evaluate(() => {
        const body = document.body.innerText || '';
        const scripts = [...document.querySelectorAll('script')].map(s => s.textContent).join('\n');
        const all = body + '\n' + scripts;
        const sm = all.match(/"surge_multiplier"\s*:\s*([\d.]+)/) || body.match(/(\d+\.\d+)\s*[×xX]/);
        const pr = all.match(/"low_estimate"\s*:\s*([\d.]+)/) || body.match(/HK\$\s*(\d+(?:\.\d+)?)/);
        return { surge: sm ? parseFloat(sm[1]) : null, price: pr ? parseFloat(pr[1]) : null };
      });
      domSurge = r.surge; domPrice = r.price;
    } catch (_) {}

    let multiplier = null, price = apiPrice ?? domPrice, source = 'no_data';
    if (apiSurge != null)      { multiplier = clamp(apiSurge);  source = 'api'; }
    else if (domSurge != null) { multiplier = clamp(domSurge);  source = 'dom'; }
    else if (price != null) {
      if (!basePrices[d.id]) { basePrices[d.id] = price; multiplier = 1.0; source = 'baseline'; }
      else { multiplier = clamp(price / basePrices[d.id]); source = 'ratio'; }
    }

    results[d.id] = { multiplier, source, updatedAt: new Date().toISOString() };
    console.log(`  → ${multiplier !== null ? multiplier + 'x [' + source + ']' : 'null [' + source + ']'}`);
  }

  await browser.close();

  const payload = {
    updatedAt: new Date().toISOString(),
    status: Object.values(results).some(r => r.multiplier !== null) ? 'ok' : 'simulated',
    liveCount: Object.values(results).filter(r => r.multiplier !== null).length,
    total: DISTRICTS.length,
    data: results,
  };

  console.log(`\n[manual] Done — ${payload.liveCount}/${payload.total} captured`);

  if (GITHUB_TOKEN) {
    try { await pushSurgeJson(payload); console.log('[github] ✓ surge.json pushed'); }
    catch (e) { console.error('[github] Push failed:', e.message); }
  } else {
    console.log('\n[result] ' + JSON.stringify(payload, null, 2));
    console.log('\nSet GITHUB_TOKEN to push to GitHub Pages.');
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
} else if (MANUAL_MODE) {
  runManual().catch(e => { console.error(e); process.exit(1); });
} else {
  if (!GITHUB_TOKEN) { console.error('[error] Set GITHUB_TOKEN=ghp_xxx'); process.exit(1); }
  console.log(`Map:  https://${GITHUB_OWNER}.github.io/${GITHUB_REPO}/`);
  console.log('Note: Chrome windows will appear each cycle — you can minimise them.\n');
  (async () => { await runCycle(); setInterval(runCycle, INTERVAL_MS); })();
}
