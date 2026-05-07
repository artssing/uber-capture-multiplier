/**
 * HK Surge Map — backend scraper
 *
 * Loads uber.com/en-HK price-estimate pages in a headless browser,
 * intercepts the internal fare API calls, and exposes the result at
 * GET /api/surge every 60 seconds.
 *
 * Run locally:  npm install && node server.js
 * Then open:    http://localhost:8080
 */

const express  = require('express');
const puppeteer = require('puppeteer-extra');
const Stealth  = require('puppeteer-extra-plugin-stealth');
const path     = require('path');

puppeteer.use(Stealth());

const app  = express();
const PORT = process.env.PORT || 8080;
const DEBUG = process.env.DEBUG === '1';

// ── District centres ──────────────────────────────────────────────────────────
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

// Fixed destination: Central Ferry Piers (neutral, city-centre point)
const DROPOFF = { lat:22.2870, lng:114.1600 };

// ── State ─────────────────────────────────────────────────────────────────────
const cache = {
  data: {},           // districtId → { multiplier, basePrice, source, updatedAt }
  basePrices: {},     // districtId → first-observed price (normalisation anchor)
  status: 'idle',
  lastUpdated: null,
  nextUpdate: null,
  scraped: 0,
  total: DISTRICTS.length,
  error: null,
};
let running = false;

// ── Price helpers ─────────────────────────────────────────────────────────────
function parsePrice(text) {
  if (!text) return null;
  const m = String(text).replace(/,/g, '').match(/\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}

function normaliseMultiplier(price, districtId) {
  const base = cache.basePrices[districtId];
  if (!base) return null;
  const ratio = Math.round((price / base) * 10) / 10;
  return Math.max(1.0, Math.min(3.5, ratio));
}

function clampMultiplier(m) {
  if (m == null || isNaN(m)) return null;
  return Math.round(Math.max(1.0, Math.min(3.5, m)) * 10) / 10;
}

// ── Single district scrape ────────────────────────────────────────────────────
async function scrapeOne(browser, district) {
  const page = await browser.newPage();

  // Mobile iPhone UA — lighter pages, less JS to execute
  await page.setUserAgent(
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) ' +
    'AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1'
  );
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'zh-HK,zh;q=0.9,en;q=0.8',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'sec-fetch-dest': 'document',
    'sec-fetch-mode': 'navigate',
    'sec-fetch-site': 'none',
  });
  await page.setViewport({ width:390, height:844, deviceScaleFactor:3, isMobile:true, hasTouch:true });

  // Ignore non-essential resource types to speed up and reduce fingerprint surface
  await page.setRequestInterception(true);
  page.on('request', req => {
    const type = req.resourceType();
    if (['image','media','font','stylesheet'].includes(type)) {
      req.abort();
    } else {
      req.continue();
    }
  });

  let interceptedMultiplier = null;
  let interceptedPrice = null;

  // Watch every JSON response for fare / price / surge data
  page.on('response', async resp => {
    if (interceptedMultiplier !== null) return;
    const url = resp.url();
    const ct  = (resp.headers()['content-type'] || '');
    if (!ct.includes('json')) return;
    if (!url.includes('uber')) return;

    try {
      const text = await resp.text();
      if (!text || text.length < 10) return;
      const json = JSON.parse(text);

      // Strategy 1: standard Rider API array response
      const prices = json.prices || json.data?.prices || [];
      if (Array.isArray(prices) && prices.length > 0) {
        const uberX = prices.find(p =>
          /uberx/i.test(p.display_name || p.localized_display_name || p.product_type || '')
        ) || prices[0];
        const surge = uberX?.surge_multiplier ?? uberX?.surgeMultiplier;
        const low   = uberX?.low_estimate ?? uberX?.minimum;
        if (surge != null) interceptedMultiplier = surge;
        if (low   != null) interceptedPrice      = low;
        if (DEBUG && surge) console.log(`  [net] prices[] surge=${surge} low=${low} from ${url.slice(0,70)}`);
      }

      // Strategy 2: flat upfront fare object
      if (!interceptedMultiplier && json.surge_multiplier != null) {
        interceptedMultiplier = json.surge_multiplier;
        interceptedPrice = json.fare?.value ?? json.estimated_price;
        if (DEBUG) console.log(`  [net] flat surge=${json.surge_multiplier} from ${url.slice(0,70)}`);
      }

      // Strategy 3: nested fare/trip object
      if (!interceptedMultiplier) {
        const fare = json.fare || json.trip || json.estimate;
        if (fare?.surge_multiplier != null) {
          interceptedMultiplier = fare.surge_multiplier;
          interceptedPrice = fare.value ?? fare.low_estimate;
        }
      }

      // Strategy 4: scan entire response text for surge_multiplier
      if (!interceptedMultiplier) {
        const smMatch = text.match(/"surge_multiplier"\s*:\s*([\d.]+)/);
        if (smMatch) {
          interceptedMultiplier = parseFloat(smMatch[1]);
          if (DEBUG) console.log(`  [net] regex surge=${interceptedMultiplier} from ${url.slice(0,70)}`);
        }
      }
    } catch (_) {}
  });

  // ── Try multiple URL formats ──────────────────────────────────────────────
  const urls = [
    // Uber HK price-estimate with lat/lng params
    `https://www.uber.com/en-HK/price-estimate/?` +
      `pickup_lat=${district.lat}&pickup_lng=${district.lng}` +
      `&dropoff_lat=${DROPOFF.lat}&dropoff_lng=${DROPOFF.lng}`,
    // Mobile deep-link
    `https://m.uber.com/looking#` +
      `pickup%5Blocation%5D%5Blat%5D=${district.lat}` +
      `%26pickup%5Blocation%5D%5Blng%5D=${district.lng}` +
      `%26destination%5Blat%5D=${DROPOFF.lat}` +
      `%26destination%5Blng%5D=${DROPOFF.lng}`,
    // Global estimate page
    `https://www.uber.com/global/en/price-estimate/?` +
      `pickup_lat=${district.lat}&pickup_lng=${district.lng}` +
      `&dropoff_lat=${DROPOFF.lat}&dropoff_lng=${DROPOFF.lng}`,
  ];

  let loaded = false;
  for (const url of urls) {
    try {
      if (DEBUG) console.log(`  Trying: ${url.slice(0,80)}`);
      await page.goto(url, { waitUntil:'domcontentloaded', timeout:18000 });
      // Give the SPA time to hydrate and fire XHR
      await page.waitForTimeout(5000);
      const title = await page.title();
      const finalUrl = page.url();
      if (DEBUG) console.log(`  Title: ${title} | Final: ${finalUrl.slice(0,70)}`);
      if (!finalUrl.startsWith('chrome-error') && title !== 'Privacy error') {
        loaded = true;
        break;
      }
    } catch (e) {
      if (DEBUG) console.log(`  goto error: ${e.message.slice(0,60)}`);
    }
  }

  let domPrice    = null;
  let domSurge    = null;

  if (loaded) {
    // DOM fallback: scan visible text for HK$ price and surge multiplier
    const result = await page.evaluate(() => {
      const text = document.body.innerText || '';
      // HK$ price
      const priceM = text.match(/HK\$\s*(\d+(?:\.\d+)?)/);
      // "1.8×" or "1.8x" surge indicator in DOM
      const surgeM = text.match(/(\d+\.\d+)\s*[x×X]/i);
      // Also look in JSON-LD or script tags
      const scripts = [...document.querySelectorAll('script[type="application/json"], script[type="application/ld+json"]')]
        .map(s => s.textContent).join('');
      const scriptSurge = scripts.match(/"surge_multiplier"\s*:\s*([\d.]+)/);
      const scriptPrice = scripts.match(/"low_estimate"\s*:\s*([\d.]+)/);
      return {
        price:      priceM    ? parseFloat(priceM[1])    : null,
        surgeText:  surgeM    ? parseFloat(surgeM[1])    : null,
        scriptSurge:scriptSurge ? parseFloat(scriptSurge[1]) : null,
        scriptPrice:scriptPrice ? parseFloat(scriptPrice[1]) : null,
        raw: text.slice(0, 200),
      };
    });
    domPrice = result.scriptPrice ?? result.price;
    domSurge = result.scriptSurge ?? result.surgeText;
    if (DEBUG) console.log(`  DOM result:`, result);
  }

  await page.close();

  // ── Decide final multiplier ────────────────────────────────────────────────
  let multiplier = null;
  let price      = interceptedPrice ?? domPrice;
  let source     = 'error';

  if (interceptedMultiplier != null) {
    multiplier = clampMultiplier(interceptedMultiplier);
    source = 'api_intercept';
  } else if (domSurge != null) {
    multiplier = clampMultiplier(domSurge);
    source = 'dom_text';
  } else if (price != null) {
    // Normalise by baseline price for this district
    if (!cache.basePrices[district.id]) {
      cache.basePrices[district.id] = price;
      multiplier = 1.0;   // first reading is the baseline
    } else {
      multiplier = normaliseMultiplier(price, district.id);
    }
    source = 'price_ratio';
  }

  return { multiplier, price, source };
}

// ── Full scrape cycle ─────────────────────────────────────────────────────────
async function runScrape() {
  if (running) { console.log('[scraper] Already running, skipping'); return; }
  running = true;
  cache.status  = 'scraping';
  cache.error   = null;
  cache.scraped = 0;
  console.log(`[scraper] Cycle start ${new Date().toISOString()}`);

  let browser;
  let successCount = 0;

  try {
    browser = await puppeteer.launch({
      headless: true,
      ignoreHTTPSErrors: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
        '--lang=zh-HK',
      ],
    });

    for (let i = 0; i < DISTRICTS.length; i++) {
      const d = DISTRICTS[i];
      console.log(`[scraper] ${i+1}/${DISTRICTS.length} ${d.cn}`);
      try {
        const result = await scrapeOne(browser, d);
        cache.data[d.id] = {
          multiplier:  result.multiplier,
          basePrice:   result.price,
          source:      result.source,
          updatedAt:   new Date().toISOString(),
        };
        if (result.multiplier !== null) successCount++;
        console.log(`  → ${result.multiplier ?? 'n/a'}x [${result.source}]`);
      } catch (e) {
        console.error(`  → error: ${e.message.slice(0,80)}`);
        cache.data[d.id] = { multiplier:null, source:'error', updatedAt: new Date().toISOString() };
      }
      cache.scraped = i + 1;

      // Space requests ~2.8s apart so all 18 fit comfortably in 60s
      if (i < DISTRICTS.length - 1) {
        await new Promise(r => setTimeout(r, 2800));
      }
    }
  } catch (err) {
    cache.status = 'error';
    cache.error  = err.message;
    console.error('[scraper] Fatal:', err.message);
  } finally {
    if (browser) { try { await browser.close(); } catch (_) {} }
    running = false;
    cache.lastUpdated = new Date().toISOString();
    cache.nextUpdate  = new Date(Date.now() + 60000).toISOString();
    cache.status      = successCount > 0 ? 'ok' : 'degraded';
    console.log(`[scraper] Done — ${successCount}/${DISTRICTS.length} live, status=${cache.status}`);
  }
}

// ── API ───────────────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'web')));

app.get('/api/surge', (_req, res) => {
  res.json({
    status:      cache.status,
    lastUpdated: cache.lastUpdated,
    nextUpdate:  cache.nextUpdate,
    scraped:     cache.scraped,
    total:       cache.total,
    error:       cache.error,
    data:        cache.data,
  });
});

app.get('/api/status', (_req, res) => res.json({
  status:      cache.status,
  lastUpdated: cache.lastUpdated,
  nextUpdate:  cache.nextUpdate,
  scraped:     cache.scraped,
  total:       cache.total,
}));

// ── Boot ──────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[server] http://localhost:${PORT}`);
  console.log('[server] DEBUG=' + DEBUG + ' — set DEBUG=1 for verbose scrape logging');
  runScrape();
  setInterval(runScrape, 60_000);
});
