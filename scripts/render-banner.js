/* Vegvísir promo banner (2048x1365, 3:2) — left feature panel over the
 * real sunset-ride photo from store-listing/graphics/developer-page-header.jpg */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const photoB64 = fs.readFileSync(
  'store-listing/graphics/developer-page-header.jpg'
).toString('base64');

const PAGE = `<!doctype html><html><body style="margin:0">
<canvas id="c" width="2048" height="1365"></canvas>
<script>
const C = document.getElementById('c'), X = C.getContext('2d');
const W = 2048, H = 1365;
const GOLD = '#E8C34A', GOLD_D = '#B8900A', SNOW = '#EDF4F2';

function goldGrad(y0, y1) {
  const g = X.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, '#F3D368'); g.addColorStop(1, GOLD_D);
  return g;
}

function drawStave(cx, cy, size, ring) {
  const u = size / 1024;
  const R = 300*u, r0 = 46*u, t = 52*u;
  X.save(); X.translate(cx, cy);
  X.lineWidth = 30*u; X.lineCap='round'; X.lineJoin='round';
  X.strokeStyle = goldGrad(-R, R); X.fillStyle = X.strokeStyle;
  X.shadowColor = 'rgba(230,180,40,.55)'; X.shadowBlur = 40*u;
  const L=(a,b,c,d)=>{X.beginPath();X.moveTo(a,b);X.lineTo(c,d);X.stroke();};
  const circ=(x,y,r,f)=>{X.beginPath();X.arc(x,y,r,0,7);f?X.fill():X.stroke();};
  for(let i=0;i<8;i++){
    X.save();X.rotate(i*Math.PI/4);
    L(0,-r0,0,-R);
    switch(i){
      case 0:L(0,-R,-t,-R-t);L(0,-R,t,-R-t);L(0,-R,0,-R-t*1.25);break;
      case 1:L(-t*.8,-R+t*.15,t*.8,-R+t*.15);L(-t*.6,-R+t*.8,t*.6,-R+t*.8);break;
      case 2:L(-t*.8,-R,t*.8,-R);L(-t*.8,-R,-t*.8,-R+t*.6);L(t*.8,-R,t*.8,-R+t*.6);break;
      case 3:circ(0,-R-t*.5,t*.5,false);break;
      case 4:X.beginPath();X.arc(0,-R-t*.1,t*.55,Math.PI,2*Math.PI);X.stroke();
             L(-t*.7,-R+t*.7,t*.7,-R+t*.7);break;
      case 5:L(0,-R,-t*.8,-R+t*.8);L(0,-R,t*.8,-R+t*.8);
             L(0,-R+t*.9,-t*.6,-R+t*1.6);L(0,-R+t*.9,t*.6,-R+t*1.6);break;
      case 6:L(-t*.7,-R+t*.5,t*.7,-R+t*.5);circ(0,-R-t*.35,t*.22,true);break;
      case 7:L(-t*.7,-R-t*.2,0,-R-t*.8);L(0,-R-t*.8,t*.7,-R-t*.2);break;
    }
    X.restore();
  }
  circ(0,0,r0*.62,false); circ(0,0,9*u,true);
  if (ring) {
    X.shadowBlur=0; X.lineWidth=8*u; X.globalAlpha=.6;
    circ(0,0,436*u,false);
    for(let i=0;i<8;i++){X.save();X.rotate(i*Math.PI/4+Math.PI/8);
      L(0,-420*u,0,-452*u);X.restore();}
    X.globalAlpha=1;
  }
  X.restore();
}

/* simple gold line icons, drawn in a 1x1 box scaled to s at (x,y) */
function icon(kind, x, y, s) {
  X.save(); X.translate(x, y); X.scale(s, s);
  X.strokeStyle = GOLD; X.fillStyle = GOLD;
  X.lineWidth = 0.09; X.lineCap = 'round'; X.lineJoin = 'round';
  X.beginPath();
  if (kind === 'pin') {           // map pin with dot
    X.arc(0.5, 0.42, 0.30, Math.PI * 0.75, Math.PI * 0.25);
    X.lineTo(0.5, 0.95); X.closePath(); X.stroke();
    X.beginPath(); X.arc(0.5, 0.42, 0.10, 0, 7); X.fill();
  } else if (kind === 'cross') {  // emergency cross
    X.moveTo(0.5, 0.12); X.lineTo(0.5, 0.88);
    X.moveTo(0.12, 0.5); X.lineTo(0.88, 0.5); X.stroke();
  } else if (kind === 'gauge') {  // speedo arc + needle
    X.arc(0.5, 0.62, 0.38, Math.PI, 2 * Math.PI); X.stroke();
    X.beginPath(); X.moveTo(0.5, 0.62); X.lineTo(0.74, 0.32); X.stroke();
    X.beginPath(); X.arc(0.5, 0.62, 0.06, 0, 7); X.fill();
  } else if (kind === 'wifi') {   // offline-ready arcs
    X.arc(0.5, 0.72, 0.14, Math.PI * 1.1, Math.PI * 1.9);
    X.moveTo(0.78, 0.52); X.arc(0.5, 0.72, 0.35, Math.PI * 1.15, Math.PI * 1.85);
    X.moveTo(0.94, 0.38); X.arc(0.5, 0.72, 0.55, Math.PI * 1.2, Math.PI * 1.8);
    X.stroke();
    X.beginPath(); X.arc(0.5, 0.78, 0.05, 0, 7); X.fill();
  }
  X.restore();
}

const img = new Image();
img.onload = () => {
  // night base under everything
  X.fillStyle = '#0A1322'; X.fillRect(0, 0, W, H);
  // photo backdrop — only the clean right portion of the source
  // (fork + sun flare; keeps the baked-in crest out of frame)
  const cropX = 2960, cropW = img.width - cropX, cropH = img.height;
  const dw = W * 0.60, dh = cropH * (dw / cropW);
  X.filter = 'brightness(1.35) saturate(1.15)';
  X.drawImage(img, cropX, 0, cropW, cropH, W - dw, -(dh - H) / 2, dw, dh);
  X.filter = 'none';

  // darken + nordic-tint the photo
  X.fillStyle = 'rgba(8,15,27,.18)'; X.fillRect(0, 0, W, H);
  const tint = X.createLinearGradient(0, 0, 0, H);
  tint.addColorStop(0, 'rgba(11,22,38,.22)'); tint.addColorStop(1, 'rgba(6,11,21,.38)');
  X.fillStyle = tint; X.fillRect(0, 0, W, H);

  // left panel gradient
  const panel = X.createLinearGradient(0, 0, W * 0.72, 0);
  panel.addColorStop(0, 'rgba(8,15,27,.97)');
  panel.addColorStop(0.62, 'rgba(8,15,27,.86)');
  panel.addColorStop(1, 'rgba(8,15,27,0)');
  X.fillStyle = panel; X.fillRect(0, 0, W * 0.72, H);

  // faint aurora over the top
  const au = X.createRadialGradient(W*0.62, -H*0.1, 40, W*0.62, -H*0.1, H*0.9);
  au.addColorStop(0, 'rgba(67,224,160,.16)'); au.addColorStop(1, 'rgba(0,0,0,0)');
  X.fillStyle = au; X.fillRect(0, 0, W, H);

  const LX = 96;                    // left margin
  X.textAlign = 'left';

  // studio wordmark
  X.fillStyle = GOLD;
  X.font = '700 54px "Arial Narrow", system-ui, sans-serif';
  X.fillText('SASSAGOLD', LX, 128);
  X.fillStyle = 'rgba(237,244,242,.75)';
  X.font = '600 26px system-ui, sans-serif';
  const sw = X.measureText('S T U D I O S').width;
  X.fillText('S T U D I O S', LX + 2, 166);
  X.strokeStyle = 'rgba(232,195,74,.5)'; X.lineWidth = 2;
  X.beginPath(); X.moveTo(LX + sw + 18, 158); X.lineTo(LX + 420, 158); X.stroke();

  // stave + app name
  drawStave(LX + 86, 320, 260, true);
  X.fillStyle = SNOW;
  X.shadowColor = 'rgba(0,0,0,.65)'; X.shadowBlur = 18;
  X.font = '700 128px "Arial Narrow", system-ui, sans-serif';
  X.fillText('VEGVÍSIR', LX + 210, 364);
  X.shadowBlur = 0;

  // features
  const feats = [
    ['pin',   'FUEL STOPS & BIKER SPOTS'],
    ['cross', 'SOS & EMERGENCY TOOLS'],
    ['gauge', 'TRIP LOGGING & SPEED TRACKING'],
    ['wifi',  'OFFLINE READY · 5 LANGUAGES'],
  ];
  let fy = 500;
  for (const [k, label] of feats) {
    X.strokeStyle = 'rgba(232,195,74,.35)'; X.lineWidth = 2;
    X.beginPath(); X.moveTo(LX, fy - 46); X.lineTo(LX + 760, fy - 46); X.stroke();
    icon(k, LX, fy - 34, 56);
    X.fillStyle = GOLD;
    X.font = '700 46px "Arial Narrow", system-ui, sans-serif';
    X.fillText(label, LX + 84, fy + 8);
    fy += 108;
  }
  X.strokeStyle = 'rgba(232,195,74,.35)';
  X.beginPath(); X.moveTo(LX, fy - 46); X.lineTo(LX + 760, fy - 46); X.stroke();

  // tagline
  X.fillStyle = SNOW;
  X.font = 'italic 700 72px "Arial Narrow", system-ui, sans-serif';
  X.fillText('BY RIDERS. FOR RIDERS.', LX, fy + 64);
  X.fillStyle = 'rgba(126,147,163,.9)';
  X.font = '500 34px system-ui, sans-serif';
  X.fillText('You will not lose your way', LX + 4, fy + 118);

  // Play badge
  const by = fy + 168, bw = 470, bh = 120;
  X.fillStyle = '#05080F';
  X.strokeStyle = GOLD; X.lineWidth = 3;
  X.beginPath(); X.roundRect(LX, by, bw, bh, 18); X.fill(); X.stroke();
  // play triangle
  X.save(); X.translate(LX + 46, by + 34);
  const tri = (c, rot) => { X.fillStyle = c; X.beginPath();
    X.moveTo(0, 0); X.lineTo(0, 52); X.lineTo(44, 26); X.closePath(); X.fill(); };
  X.fillStyle = '#00D8FF'; X.beginPath(); X.moveTo(0,0); X.lineTo(0,52); X.lineTo(24,26); X.closePath(); X.fill();
  X.fillStyle = '#FFCE00'; X.beginPath(); X.moveTo(0,0); X.lineTo(44,26); X.lineTo(24,26); X.closePath(); X.fill();
  X.fillStyle = '#FF3A44'; X.beginPath(); X.moveTo(0,52); X.lineTo(24,26); X.lineTo(44,26); X.closePath(); X.fill();
  X.restore();
  X.fillStyle = 'rgba(237,244,242,.85)';
  X.font = '600 24px system-ui, sans-serif';
  X.fillText('DOWNLOAD NOW ON', LX + 118, by + 46);
  X.fillStyle = SNOW;
  X.font = '700 52px system-ui, sans-serif';
  X.fillText('Google Play', LX + 116, by + 98);

  window.__done = true;
};
img.src = 'data:image/jpeg;base64,${photoB64}';
</script></body></html>`;

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 2048, height: 1365 } });
  page.on('pageerror', (e) => console.error('PAGE ERROR:', e.message));
  page.on('console', (m) => console.log('console:', m.text()));
  await page.setContent(PAGE, { waitUntil: 'load' });
  await page.waitForFunction('window.__done === true', { timeout: 30000 });
  const el = await page.$('#c');
  await el.screenshot({ path: path.join(__dirname, 'brand', 'vegvisir-banner.png') });
  console.log('rendered vegvisir-banner.png 2048x1365');
  await browser.close();
})();
