/**
 * Renders the Vegvísir app icon set into assets/images/ from the stave
 * geometry (same mark as store-listing/brand/).
 *   node scripts/render-app-icons.js
 * Set PW_EXECUTABLE to a Chromium binary when the default download is absent.
 */
const path = require('path');
const { chromium } = require('playwright');

const OUT = path.join(__dirname, '..', 'assets', 'images');

const PAGE = `<!doctype html><html><body style="margin:0;background:transparent">
<canvas id="c"></canvas>
<script>
function drawStave(canvas, o) {
  const X = canvas.getContext('2d');
  const S = canvas.width;
  const u = (S / 1024) * (o.scale || 1);
  X.clearRect(0, 0, S, S);
  if (o.bg) {
    const g = X.createLinearGradient(0, 0, 0, S);
    g.addColorStop(0, '#0C1626'); g.addColorStop(1, '#080F1B');
    X.fillStyle = g; X.fillRect(0, 0, S, S);
    const a = X.createRadialGradient(S * .68, -S * .08, S * .06, S * .68, -S * .08, S * .8);
    a.addColorStop(0, 'rgba(67,224,160,.30)'); a.addColorStop(1, 'rgba(0,0,0,0)');
    X.fillStyle = a; X.fillRect(0, 0, S, S);
    const b = X.createRadialGradient(S * .18, S * 1.08, S * .06, S * .18, S * 1.08, S * .7);
    b.addColorStop(0, 'rgba(196,154,0,.10)'); b.addColorStop(1, 'rgba(0,0,0,0)');
    X.fillStyle = b; X.fillRect(0, 0, S, S);
  }
  if (!o.mark) return;
  const R = 300 * u, r0 = 46 * u, t = 52 * u;
  X.save();
  X.translate(S / 2, S / 2 + (o.dy || 0) * S);
  X.lineWidth = 30 * u; X.lineCap = 'round'; X.lineJoin = 'round';
  if (o.mono) { X.strokeStyle = '#FFFFFF'; X.fillStyle = '#FFFFFF'; }
  else {
    const grad = X.createLinearGradient(0, -R, 0, R);
    grad.addColorStop(0, '#EFCC5A'); grad.addColorStop(1, '#B8900A');
    X.strokeStyle = grad; X.fillStyle = grad;
    if (o.glow) { X.shadowColor = 'rgba(196,154,0,.45)'; X.shadowBlur = 42 * u; }
  }
  const L = (x1, y1, x2, y2) => { X.beginPath(); X.moveTo(x1, y1); X.lineTo(x2, y2); X.stroke(); };
  const circ = (x, y, r, fill) => { X.beginPath(); X.arc(x, y, r, 0, 7); fill ? X.fill() : X.stroke(); };
  for (let i = 0; i < 8; i++) {
    X.save(); X.rotate(i * Math.PI / 4);
    L(0, -r0, 0, -R);
    switch (i) {
      case 0: L(0, -R, -t, -R - t); L(0, -R, t, -R - t); L(0, -R, 0, -R - t * 1.25); break;
      case 1: L(-t * .8, -R + t * .15, t * .8, -R + t * .15); L(-t * .6, -R + t * .8, t * .6, -R + t * .8); break;
      case 2: L(-t * .8, -R, t * .8, -R); L(-t * .8, -R, -t * .8, -R + t * .6); L(t * .8, -R, t * .8, -R + t * .6); break;
      case 3: circ(0, -R - t * .5, t * .5, false); break;
      case 4: X.beginPath(); X.arc(0, -R - t * .1, t * .55, Math.PI, 2 * Math.PI); X.stroke();
              L(-t * .7, -R + t * .7, t * .7, -R + t * .7); break;
      case 5: L(0, -R, -t * .8, -R + t * .8); L(0, -R, t * .8, -R + t * .8);
              L(0, -R + t * .9, -t * .6, -R + t * 1.6); L(0, -R + t * .9, t * .6, -R + t * 1.6); break;
      case 6: L(-t * .7, -R + t * .5, t * .7, -R + t * .5); circ(0, -R - t * .35, t * .22, true); break;
      case 7: L(-t * .7, -R - t * .2, 0, -R - t * .8); L(0, -R - t * .8, t * .7, -R - t * .2); break;
    }
    X.restore();
  }
  circ(0, 0, r0 * .62, false);
  circ(0, 0, 9 * u, true);
  if (o.ring) {
    X.shadowBlur = 0; X.lineWidth = 8 * u; X.globalAlpha = .55;
    circ(0, 0, 436 * u, false);
    for (let i = 0; i < 8; i++) {
      X.save(); X.rotate(i * Math.PI / 4 + Math.PI / 8);
      L(0, -420 * u, 0, -452 * u); X.restore();
    }
    X.globalAlpha = 1;
  }
  X.restore();
  if (o.wordmark) {
    X.fillStyle = o.mono ? '#FFFFFF' : '#EDF4F2';
    X.font = '700 ' + Math.round(S * 0.125) + 'px "Arial Narrow", system-ui, sans-serif';
    X.textAlign = 'center';
    X.fillText('VEGVÍSIR', S / 2, S * 0.92);
  }
}
window.render = (spec) => {
  const c = document.getElementById('c');
  c.width = spec.size; c.height = spec.size;
  drawStave(c, spec);
};
</script></body></html>`;

const SPECS = [
  // full-bleed app icon: mark + ring on nordic night
  { file: 'icon.png',                    size: 1024, bg: true,  mark: true, ring: true,  glow: true,  scale: 1 },
  // adaptive foreground: transparent, mark scaled into the 66% safe zone
  { file: 'android-icon-foreground.png', size: 1024, bg: false, mark: true, ring: true,  glow: true,  scale: 0.62 },
  // adaptive background: the night sky alone
  { file: 'android-icon-background.png', size: 1024, bg: true,  mark: false },
  // monochrome (themed icons): white silhouette, no ring/glow, safe zone
  { file: 'android-icon-monochrome.png', size: 432,  bg: false, mark: true, ring: false, glow: false, mono: true, scale: 0.62 },
  // favicon: tiny mark, no ring
  { file: 'favicon.png',                 size: 48,   bg: true,  mark: true, ring: false, glow: false, scale: 1.1 },
  // splash: transparent, mark raised + wordmark below (shown on #080F1B)
  { file: 'splash-icon.png',             size: 1024, bg: false, mark: true, ring: true,  glow: true,  scale: 0.66, dy: -0.06, wordmark: true },
];

(async () => {
  const launchOpts = process.env.PW_EXECUTABLE
    ? { executablePath: process.env.PW_EXECUTABLE }
    : {};
  const browser = await chromium.launch(launchOpts);
  const page = await browser.newPage();
  await page.setContent(PAGE, { waitUntil: 'load' });
  for (const spec of SPECS) {
    await page.evaluate((s) => window.render(s), spec);
    const el = await page.$('#c');
    await el.screenshot({ path: path.join(OUT, spec.file), omitBackground: !spec.bg });
    console.log('rendered', spec.file, spec.size + 'px');
  }
  await browser.close();
})();
