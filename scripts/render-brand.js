/* Renders Vegvísir app-icon drafts (1024x1024) + a wordmark lockup via
 * canvas in headless Chromium. Output: scratchpad/brand/  */
const { chromium } = require('/workspace/1001-excuses-for-not-coming-to-work-today/node_modules/playwright');
const path = require('path');
const OUT = path.join(__dirname, 'brand');

const PAGE = `<!doctype html><html><body style="margin:0">
<canvas id="c" width="1024" height="1024"></canvas>
<script>
const C = document.getElementById('c');
const X = C.getContext('2d');

function bg(auroraStrength) {
  // nordic night base
  const g = X.createLinearGradient(0, 0, 0, 1024);
  g.addColorStop(0, '#0C1626'); g.addColorStop(1, '#080F1B');
  X.fillStyle = g; X.fillRect(0, 0, 1024, 1024);
  // aurora band
  const a = X.createRadialGradient(700, -80, 60, 700, -80, 800);
  a.addColorStop(0, 'rgba(67,224,160,' + (0.34 * auroraStrength) + ')');
  a.addColorStop(0.55, 'rgba(127,216,208,' + (0.10 * auroraStrength) + ')');
  a.addColorStop(1, 'rgba(0,0,0,0)');
  X.fillStyle = a; X.fillRect(0, 0, 1024, 1024);
  const b = X.createRadialGradient(180, 1100, 60, 180, 1100, 700);
  b.addColorStop(0, 'rgba(196,154,0,' + (0.10 * auroraStrength) + ')');
  b.addColorStop(1, 'rgba(0,0,0,0)');
  X.fillStyle = b; X.fillRect(0, 0, 1024, 1024);
}

function strokeStyleFor(kind) {
  if (kind === 'gold') {
    const g = X.createLinearGradient(0, 200, 0, 830);
    g.addColorStop(0, '#EFCC5A'); g.addColorStop(1, '#B8900A'); return g;
  }
  if (kind === 'aurora') {
    const g = X.createLinearGradient(0, 200, 0, 830);
    g.addColorStop(0, '#5BEAB0'); g.addColorStop(1, '#66C9CF'); return g;
  }
  return '#EDF4F2'; // snow
}

/* One stave arm drawn in a local frame: +outward is -y. */
function arm(i, R, r0, t) {
  X.save();
  X.rotate(i * Math.PI / 4);
  const L = (x1, y1, x2, y2) => { X.beginPath(); X.moveTo(x1, y1); X.lineTo(x2, y2); X.stroke(); };
  const circ = (x, y, r, fill) => { X.beginPath(); X.arc(x, y, r, 0, 7); fill ? X.fill() : X.stroke(); };
  L(0, -r0, 0, -R); // main shaft
  switch (i) {
    case 0: // trident fork
      L(0, -R, -t, -R - t); L(0, -R, t, -R - t); L(0, -R, 0, -R - t * 1.25); break;
    case 1: // double crossbar
      L(-t * .8, -R + t * .15, t * .8, -R + t * .15);
      L(-t * .6, -R + t * .8,  t * .6, -R + t * .8); break;
    case 2: // gate: T-bar with down ticks
      L(-t * .8, -R, t * .8, -R);
      L(-t * .8, -R, -t * .8, -R + t * .6); L(t * .8, -R, t * .8, -R + t * .6); break;
    case 3: // ring terminal
      circ(0, -R - t * .5, t * .5, false); break;
    case 4: // cup + crossbar
      X.beginPath(); X.arc(0, -R - t * .1, t * .55, Math.PI, 2 * Math.PI); X.stroke();
      L(-t * .7, -R + t * .7, t * .7, -R + t * .7); break;
    case 5: // outward barbs, two rows
      L(0, -R, -t * .8, -R + t * .8); L(0, -R, t * .8, -R + t * .8);
      L(0, -R + t * .9, -t * .6, -R + t * 1.6); L(0, -R + t * .9, t * .6, -R + t * 1.6); break;
    case 6: // crossbar + dot beyond tip
      L(-t * .7, -R + t * .5, t * .7, -R + t * .5); circ(0, -R - t * .35, t * .22, true); break;
    case 7: // chevron away from tip
      L(-t * .7, -R - t * .2, 0, -R - t * .8); L(0, -R - t * .8, t * .7, -R - t * .2); break;
  }
  X.restore();
}

function stave(kind, withRing) {
  const cx = 512, cy = 512, R = 300, r0 = 46, t = 52;
  X.save();
  X.translate(cx, cy);
  X.lineWidth = 30; X.lineCap = 'round'; X.lineJoin = 'round';
  X.strokeStyle = strokeStyleFor(kind);
  X.fillStyle = X.strokeStyle;
  X.shadowColor = kind === 'gold' ? 'rgba(196,154,0,.45)' : 'rgba(67,224,160,.4)';
  X.shadowBlur = 42;
  for (let i = 0; i < 8; i++) arm(i, R, r0, t);
  // center: circle + dot
  X.beginPath(); X.arc(0, 0, r0 * .62, 0, 7); X.stroke();
  X.beginPath(); X.arc(0, 0, 9, 0, 7); X.fill();
  if (withRing) {
    X.shadowBlur = 0; X.lineWidth = 8;
    X.globalAlpha = .55;
    X.beginPath(); X.arc(0, 0, 436, 0, 7); X.stroke();
    // 8 ring notches between arms
    X.lineWidth = 8;
    for (let i = 0; i < 8; i++) {
      X.save(); X.rotate(i * Math.PI / 4 + Math.PI / 8);
      X.beginPath(); X.moveTo(0, -420); X.lineTo(0, -452); X.stroke(); X.restore();
    }
    X.globalAlpha = 1;
  }
  X.restore();
}

function wordmark() {
  bg(1);
  const cx = 512;
  // 62%-scale stave centered at (512, 400)
  X.save(); X.translate(cx, 400); X.scale(0.62, 0.62); X.translate(-cx, -512);
  stave('gold', false);
  X.restore();
  X.fillStyle = '#EDF4F2';
  X.font = '700 150px "Arial Narrow", system-ui, sans-serif';
  X.textAlign = 'center';
  X.fillText('VEGVÍSIR', cx, 872);
  X.fillStyle = 'rgba(126,147,163,1)';
  X.font = '600 34px system-ui, sans-serif';
  const sp = 'N O R D I C   R I D E   C O M P A S S';
  X.fillText(sp, cx, 936);
}

window.render = (variant) => {
  X.clearRect(0, 0, 1024, 1024);
  if (variant === 'wordmark') { wordmark(); return; }
  const [kind, ring] = variant.split('-');
  bg(kind === 'snow' ? 1.15 : 0.9);
  stave(kind, ring === 'ring');
};
</script></body></html>`;

(async () => {
  const fs = require('fs');
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 1024, height: 1024 } });
  await page.setContent(PAGE, { waitUntil: 'load' });
  const variants = ['gold-ring', 'gold-plain', 'aurora-ring', 'aurora-plain', 'snow-ring', 'wordmark'];
  for (const v of variants) {
    await page.evaluate((x) => window.render(x), v);
    const el = await page.$('#c');
    await el.screenshot({ path: path.join(OUT, `vegvisir-${v}.png`) });
    console.log('rendered', v);
  }
  await browser.close();
})();
