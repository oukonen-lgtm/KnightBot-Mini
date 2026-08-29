// server.js
const express = require('express');
const helmet = require('helmet');
const pLimit = require('p-limit');
const { RateLimiterMemory } = require('rate-limiter-flexible');

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const PORT = process.env.PORT || 3000;
const CONCURRENCY = parseInt(process.env.CONCURRENCY || '2', 10);
const LAUNCH_ARGS = ['--no-sandbox', '--disable-setuid-sandbox'];

const app = express();
app.use(helmet());
app.use(express.json());
app.use(express.static('public'));

// Simple rate limiter (global + per-number)
const globalLimiter = new RateLimiterMemory({ points: 30, duration: 60 });
const perNumberLimiter = new RateLimiterMemory({ points: 1, duration: 30 });

const limit = pLimit(CONCURRENCY);

async function extractPairCodeFromPage(page) {
  const text = (await page.evaluate(() => document.body.innerText || '')) || '';
  const codeRegexes = [
    /[A-Z0-9]{3,4}[-]?[A-Z0-9]{2,6}/i,
    /\b[A-Z0-9]{6,12}\b/i
  ];
  for (const re of codeRegexes) {
    const m = text.match(re);
    if (m && m[0]) return m[0].trim();
  }
  // fallback: try some selectors
  const selectors = ['.pair-code', '.code', '[data-pairing-code]'];
  for (const sel of selectors) {
    try {
      const elText = await page.$eval(sel, el => el.innerText.trim()).catch(() => null);
      if (elText) {
        for (const re of codeRegexes) {
          const m = elText.match(re);
          if (m && m[0]) return m[0].trim();
        }
      }
    } catch (e) {}
  }
  return null;
}

async function generatePairCode(number, timeoutMs = 25000) {
  const browser = await puppeteer.launch({ headless: true, args: LAUNCH_ARGS });
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 1200, height: 800 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/115.0.0.0 Safari/537.36');

    // Open official or local page that produces pairing code
    // NOTE: this URL may need adjustment depending on the exact flow
    await page.goto('https://web.whatsapp.com/link', { waitUntil: 'networkidle2', timeout: Math.min(timeoutMs, 30000) });

    // Try to fill phone if necessary (best-effort)
    const inputSelectors = ['input[type="tel"]', 'input[aria-label*="phone"]', 'input[placeholder*="phone"]'];
    for (const sel of inputSelectors) {
      try {
        const el = await page.$(sel);
        if (el) {
          await page.evaluate((s, num) => {
            const el = document.querySelector(s);
            if (el) { el.value = num; el.dispatchEvent(new Event('input', { bubbles: true })); }
          }, sel, number);
          // attempt to submit (best-effort)
          await page.evaluate(() => {
            const btn = document.querySelector('button[type="submit"], button');
            if (btn) btn.click();
          }).catch(()=>{});
          break;
        }
      } catch (e) {}
    }

    const start = Date.now();
    let code = null;
    while (Date.now() - start < timeoutMs) {
      code = await extractPairCodeFromPage(page);
      if (code) break;
      await page.waitForTimeout(500);
    }

    await browser.close();
    if (!code) throw new Error('Pair code not found on page');
    return code;
  } catch (err) {
    try { await browser.close(); } catch (e) {}
    throw err;
  }
}

// Middleware for API key (optional)
function checkApiKey(req, res, next) {
  const key = process.env.API_KEY;
  if (!key) return next(); // no API key configured
  const auth = req.headers['authorization'] || req.query.key;
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });
  if (auth.startsWith('Bearer ')) {
    if (auth.slice(7) !== key) return res.status(401).json({ error: 'Unauthorized' });
  } else {
    if (auth !== key) return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

app.get('/pair', checkApiKey, async (req, res) => {
  try {
    await globalLimiter.consume(1);
  } catch (_) {
    return res.status(429).json({ error: 'Too many requests (global)' });
  }
  const number = (req.query.number || '').replace(/\D/g, '');
  if (!/^\d{8,15}$/.test(number)) return res.status(400).json({ error: 'Invalid number format' });

  try {
    await perNumberLimiter.consume(number);
  } catch (_) {
    return res.status(429).json({ error: 'Too many requests for this number' });
  }

  try {
    const code = await limit(() => generatePairCode(number, 25000));
    return res.json({ code });
  } catch (err) {
    console.error('pair error:', err && err.stack || err);
    return res.status(500).json({ error: 'Failed to generate pair code: ' + (err.message || '') });
  }
});

app.get('/health', (req, res) => res.send('ok'));

app.listen(PORT, () => {
  console.log(`Pairing server listening on port ${PORT}`);
});
