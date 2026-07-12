/**
 * Renders Google Play store graphics from the raw app captures in
 * store-listing/raw/:
 *   - 8 branded screenshot panels (1080x1920) per locale
 *   - 1 feature graphic (1024x500) per locale
 * Output: store-listing/graphics/<locale>/...
 *
 * Requires Playwright with the Edge/Chrome channel. Run either with the
 * landing repo's node_modules (default below) or `npm i -D playwright`.
 *   node scripts/render-store-assets.js
 */
const fs = require('fs');
const path = require('path');

let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  ({ chromium } = require('c:/Users/leand/sassagold-landing/node_modules/playwright'));
}

const ROOT = path.join(__dirname, '..', 'store-listing');
const RAW = path.join(ROOT, 'raw');

// Caption pairs: [white part, gold part]. Keep each line short so the
// headline never wraps past two lines at 72px.
const LOCALES = {
  'en-US': {
    tagline: 'Your smart ride companion',
    panels: [
      ['riderhq', 'Your riding', 'dashboard'],
      ['sos', 'Help,', 'one tap away'],
      ['garage', 'Everything to', 'keep riding'],
      ['trip', 'Log', 'every ride'],
      ['food', 'Fuel for', 'the rider too'],
      ['sleep', 'A bed', 'for the night'],
      ['explore', 'Discover', 'the road'],
      ['language', 'Speaks', '9 languages'],
    ],
  },
  'no-NO': {
    tagline: 'Din smarte kjørekompis',
    panels: [
      ['riderhq', 'Ditt', 'kjøre-dashbord'],
      ['sos', 'Hjelp med', 'ett trykk'],
      ['garage', 'Alt for å', 'holde deg på veien'],
      ['trip', 'Loggfør', 'hver tur'],
      ['food', 'Drivstoff til', 'rytteren også'],
      ['sleep', 'En seng', 'for natten'],
      ['explore', 'Utforsk', 'veien'],
      ['language', 'Snakker', '9 språk'],
    ],
  },
  'is-IS': {
    tagline: 'Mótorhjólafélagi þinn',
    panels: [
      ['riderhq', 'Þitt', 'akstursborð'],
      ['sos', 'Hjálp með', 'einni snertingu'],
      ['garage', 'Allt til að', 'halda áfram'],
      ['trip', 'Skráðu', 'hverja ferð'],
      ['food', 'Eldsneyti fyrir', 'hjólarann líka'],
      ['sleep', 'Rúm', 'fyrir nóttina'],
      ['explore', 'Uppgötvaðu', 'veginn'],
      ['language', 'Talar', '9 tungumál'],
    ],
  },
};

const b64 = (f) => fs.readFileSync(path.join(RAW, f)).toString('base64');

function panelHtml(shotB64, logoB64, white, gold) {
  return `<!doctype html><html><head><style>
    * { margin: 0; box-sizing: border-box; }
    body {
      width: 1080px; height: 1920px; overflow: hidden;
      font-family: 'Segoe UI', Roboto, Arial, sans-serif;
      background:
        radial-gradient(ellipse 900px 700px at 80% -5%, rgba(230,126,0,.22), transparent 65%),
        radial-gradient(ellipse 700px 600px at 8% 100%, rgba(196,154,0,.14), transparent 65%),
        #0F0F0D;
      display: flex; flex-direction: column; align-items: center;
    }
    .logo { height: 130px; margin-top: 56px; }
    h1 {
      margin-top: 30px; text-align: center;
      font-size: 78px; font-weight: 800; letter-spacing: -1.5px;
      color: #fff; line-height: 1.12;
    }
    h1 .gold { color: #E6A817; }
    .phone {
      margin-top: 52px;
      width: 690px;
      border-radius: 64px;
      border: 12px solid #24242c;
      outline: 2px solid #3a3a46;
      box-shadow: 0 60px 120px rgba(0,0,0,.65), 0 0 90px rgba(230,126,0,.18);
      overflow: hidden; line-height: 0;
      background: #000;
    }
    .phone img { width: 100%; }
  </style></head><body>
    <img class="logo" src="data:image/png;base64,${logoB64}" />
    <h1>${white}<br/><span class="gold">${gold}</span></h1>
    <div class="phone"><img src="data:image/png;base64,${shotB64}" /></div>
  </body></html>`;
}

function featureHtml(shotB64, logoB64, tagline) {
  return `<!doctype html><html><head><style>
    * { margin: 0; box-sizing: border-box; }
    body {
      width: 1024px; height: 500px; overflow: hidden;
      font-family: 'Segoe UI', Roboto, Arial, sans-serif;
      background:
        radial-gradient(ellipse 700px 500px at 95% 0%, rgba(230,126,0,.25), transparent 65%),
        radial-gradient(ellipse 500px 400px at 0% 100%, rgba(196,154,0,.16), transparent 65%),
        #0F0F0D;
      display: flex; align-items: center;
    }
    .text { flex: 1; padding: 0 40px 0 64px; }
    .logo { height: 120px; margin-bottom: 26px; }
    h1 { font-size: 58px; font-weight: 800; color: #fff; letter-spacing: -1px; line-height: 1.08; }
    h1 .gold { color: #E6A817; }
    p { margin-top: 14px; font-size: 26px; color: #B9B0A4; font-weight: 500; }
    .phone {
      width: 300px; margin-right: 56px; margin-top: 240px;
      border-radius: 44px 44px 0 0;
      border: 9px solid #24242c; border-bottom: none;
      outline: 2px solid #3a3a46;
      box-shadow: 0 -20px 80px rgba(0,0,0,.6), 0 0 70px rgba(230,126,0,.22);
      overflow: hidden; line-height: 0; background: #000;
      flex-shrink: 0;
    }
    .phone img { width: 100%; }
  </style></head><body>
    <div class="text">
      <img class="logo" src="data:image/png;base64,${logoB64}" />
      <h1>Where Am I</h1>
      <p>${tagline}</p>
    </div>
    <div class="phone"><img src="data:image/png;base64,${shotB64}" /></div>
  </body></html>`;
}

(async () => {
  const browser = await chromium.launch({ channel: 'msedge' });
  const logoB64 = b64('logo.png');

  for (const [locale, cfg] of Object.entries(LOCALES)) {
    const outShots = path.join(ROOT, 'graphics', locale, 'screenshots');
    fs.mkdirSync(outShots, { recursive: true });

    for (let i = 0; i < cfg.panels.length; i++) {
      const [shot, white, gold] = cfg.panels[i];
      const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
      await page.setContent(panelHtml(b64(shot + '.png'), logoB64, white, gold), { waitUntil: 'networkidle' });
      const file = path.join(outShots, String(i + 1).padStart(2, '0') + '-' + shot + '.png');
      await page.screenshot({ path: file });
      await page.close();
      console.log(locale, path.basename(file));
    }

    const page = await browser.newPage({ viewport: { width: 1024, height: 500 } });
    await page.setContent(featureHtml(b64('riderhq.png'), logoB64, cfg.tagline), { waitUntil: 'networkidle' });
    const file = path.join(ROOT, 'graphics', locale, 'feature-graphic.png');
    await page.screenshot({ path: file });
    await page.close();
    console.log(locale, 'feature-graphic.png');
  }
  await browser.close();

  // ── Validate copy files against Play limits ────────────────────────────
  const LIMITS = { 'title.txt': 30, 'short_description.txt': 80, 'full_description.txt': 4000 };
  let fail = false;
  for (const locale of Object.keys(LOCALES)) {
    for (const [f, max] of Object.entries(LIMITS)) {
      const p = path.join(ROOT, 'locales', locale, f);
      if (!fs.existsSync(p)) { console.log('MISSING', locale, f); continue; }
      const len = fs.readFileSync(p, 'utf8').trim().length;
      const ok = len <= max;
      if (!ok) fail = true;
      console.log((ok ? 'ok  ' : 'OVER'), locale, f, len + '/' + max);
    }
  }
  console.log(fail ? 'CHAR LIMIT FAILURES' : 'all copy within Play limits');
})();