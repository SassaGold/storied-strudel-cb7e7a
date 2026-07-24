/* Vegvísir wallpapers: phone 1440x3120 + desktop 3840x2160.
 * Aurora night, moon, star field, layered fjord ridges, gold stave crest. */
const { chromium } = require('playwright');
const path = require('path');

const PAGE = `<!doctype html><html><body style="margin:0"><canvas id="c"></canvas><script>
// deterministic PRNG so re-renders are identical
function mulberry(seed){return function(){seed|=0;seed=seed+0x6D2B79F5|0;
  let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;
  return ((t^t>>>14)>>>0)/4294967296;}}

function drawStave(X, S, u0) {
  const u = u0;
  const R = 300*u, r0 = 46*u, t = 52*u;
  X.lineWidth = 30*u; X.lineCap='round'; X.lineJoin='round';
  const grad = X.createLinearGradient(0,-R,0,R);
  grad.addColorStop(0,'#F3D368'); grad.addColorStop(1,'#B8900A');
  X.strokeStyle = grad; X.fillStyle = grad;
  X.shadowColor = 'rgba(230,180,40,.65)'; X.shadowBlur = 60*u;
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
  X.shadowBlur=0; X.lineWidth=8*u; X.globalAlpha=.6;
  circ(0,0,436*u,false);
  for(let i=0;i<8;i++){X.save();X.rotate(i*Math.PI/4+Math.PI/8);
    L(0,-420*u,0,-452*u);X.restore();}
  X.globalAlpha=1;
}

function ridge(X, W, y0, amp, seg, color, rnd, snow) {
  const pts=[];
  for(let i=0;i<=seg;i++){
    pts.push([W*i/seg, y0 - (i%2?amp*(0.35+rnd()*0.65):amp*rnd()*0.35)]);
  }
  X.beginPath(); X.moveTo(-10, y0+amp);
  pts.forEach(p=>X.lineTo(p[0],p[1]));
  X.lineTo(W+10,y0+amp); X.closePath();
  X.fillStyle=color; X.fill();
  if(snow){
    X.strokeStyle='rgba(190,215,225,.20)'; X.lineWidth=Math.max(2,W/900);
    X.beginPath(); pts.forEach((p,i)=>i?X.lineTo(p[0],p[1]):X.moveTo(p[0],p[1])); X.stroke();
  }
}

window.render = (W, H, phone) => {
  const c=document.getElementById('c'); c.width=W; c.height=H;
  const X=c.getContext('2d'); const rnd=mulberry(77);

  // sky
  const sky=X.createLinearGradient(0,0,0,H);
  sky.addColorStop(0,'#060B15'); sky.addColorStop(.45,'#0B1626'); sky.addColorStop(1,'#0D1B2E');
  X.fillStyle=sky; X.fillRect(0,0,W,H);

  // stars
  for(let i=0;i<420;i++){
    const x=rnd()*W, y=rnd()*H*0.62, r=rnd()*1.4+0.3;
    X.globalAlpha=0.25+rnd()*0.65;
    X.fillStyle= rnd()>0.85 ? '#CFE8DE' : '#E8EEF4';
    X.beginPath(); X.arc(x,y,r*(W/1440),0,7); X.fill();
  }
  X.globalAlpha=1;

  // aurora curtains
  const bands = phone?4:5;
  for(let b=0;b<bands;b++){
    const baseX=W*(0.05+b*0.9/bands+rnd()*0.08);
    const topY=H*(0.02+rnd()*0.05), botY=H*(phone?0.42:0.5);
    const drift=W*(0.06+rnd()*0.10)*(b%2?1:-1);
    const g=X.createLinearGradient(0,topY,0,botY);
    const green='rgba(67,224,160,', teal='rgba(127,216,208,';
    g.addColorStop(0,(b%2?teal:green)+'0)');
    g.addColorStop(.35,(b%2?teal:green)+(phone?'.30)':'.26)'));
    g.addColorStop(1,(b%2?teal:green)+'0)');
    X.fillStyle=g;
    X.save(); X.filter='blur('+Math.round(W/70)+'px)';
    X.beginPath();
    const wdt=W*(0.05+rnd()*0.05);
    X.moveTo(baseX,topY);
    X.bezierCurveTo(baseX+drift,H*0.15,baseX-drift,H*0.3,baseX+drift*0.6,botY);
    X.lineTo(baseX+drift*0.6+wdt,botY);
    X.bezierCurveTo(baseX-drift+wdt,H*0.3,baseX+drift+wdt,H*0.15,baseX+wdt,topY);
    X.closePath(); X.fill();
    X.restore();
  }

  // moon
  const mx=W*0.82, my=H*(phone?0.10:0.16), mr=W*(phone?0.09:0.05);
  const halo=X.createRadialGradient(mx,my,mr*0.4,mx,my,mr*4);
  halo.addColorStop(0,'rgba(240,225,180,.32)'); halo.addColorStop(1,'rgba(0,0,0,0)');
  X.fillStyle=halo; X.fillRect(mx-mr*4,my-mr*4,mr*8,mr*8);
  const moon=X.createRadialGradient(mx-mr*0.3,my-mr*0.3,mr*0.1,mx,my,mr);
  moon.addColorStop(0,'#F5EAC8'); moon.addColorStop(1,'#CBB98A');
  X.fillStyle=moon; X.beginPath(); X.arc(mx,my,mr,0,7); X.fill();
  X.fillStyle='rgba(150,135,95,.25)';
  [[.3,-.2,.22],[-.35,.18,.16],[.05,.4,.12]].forEach(([dx,dy,dr])=>{
    X.beginPath(); X.arc(mx+mr*dx,my+mr*dy,mr*dr,0,7); X.fill();});

  // mountain ridges (back to front)
  const horizon = H*(phone?0.72:0.66);
  ridge(X,W,horizon,          H*0.10, 9,  '#152238', rnd, true);
  ridge(X,W,horizon+H*0.05,   H*0.13, 7,  '#101A2C', rnd, true);
  ridge(X,W,horizon+H*0.115,  H*0.15, 5,  '#0B1322', rnd, false);

  // fjord water
  const wy=horizon+H*0.13;
  const water=X.createLinearGradient(0,wy,0,H);
  water.addColorStop(0,'#0A1626'); water.addColorStop(1,'#060B15');
  X.fillStyle=water; X.fillRect(0,wy,W,H-wy);
  // moon + aurora reflections
  for(let i=0;i<70;i++){
    const y=wy+rnd()*(H-wy), len=W*(0.01+rnd()*0.05);
    const nearMoon=Math.abs((mx)-(rnd()*W))<W*0.2;
    const x=rnd()>0.4? mx+(rnd()-0.5)*W*0.16 : rnd()*W;
    X.globalAlpha=0.05+rnd()*0.12;
    X.fillStyle= x>mx-W*0.12&&x<mx+W*0.12 ? '#E8D9A8' : '#43E0A0';
    X.fillRect(x-len/2,y,len,Math.max(1.5,W/1200));
  }
  X.globalAlpha=1;

  // stave crest
  const cx=W/2, cy=H*(phone?0.40:0.42);
  const scale=(phone? W*1.05 : H*0.78)/1024;
  X.save(); X.translate(cx,cy); X.scale(scale,scale);
  drawStave(X,1024,1);
  X.restore();

  // wordmark + tagline
  const fs1=Math.round(phone? W*0.145 : H*0.085);
  const fs2=Math.round(fs1*0.24);
  X.textAlign='center';
  X.shadowColor='rgba(0,0,0,.6)'; X.shadowBlur=fs1*0.12;
  X.fillStyle='#EDF4F2';
  X.font='700 '+fs1+'px "Arial Narrow", system-ui, sans-serif';
  const ty=cy+(phone? W*0.62 : H*0.47);
  X.fillText('VEGVÍSIR',cx,ty);
  X.shadowBlur=0;
  X.fillStyle='rgba(196,154,0,.95)';
  X.font='600 '+fs2+'px system-ui, sans-serif';
  X.fillText('E X P L O R E .   R I D E .   D I S C O V E R .',cx,ty+fs1*0.52);
  X.fillStyle='rgba(126,147,163,.75)';
  X.font='500 '+Math.round(fs2*0.82)+'px system-ui, sans-serif';
  X.fillText(phone?'Du går deg aldri vill':'You will not lose your way',cx,ty+fs1*0.95);
};
</script></body></html>`;

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 400, height: 400 } });
  await page.setContent(PAGE, { waitUntil: 'load' });
  const jobs = [
    ['vegvisir-wallpaper-phone.png', 1440, 3120, true],
    ['vegvisir-wallpaper-desktop.png', 3840, 2160, false],
  ];
  for (const [file, W, H, phone] of jobs) {
    await page.setViewportSize({ width: Math.min(W, 1900), height: Math.min(H, 1000) });
    await page.evaluate(([w, h, p]) => window.render(w, h, p), [W, H, phone]);
    const el = await page.$('#c');
    await el.screenshot({ path: path.join(__dirname, 'brand', file) });
    console.log('rendered', file, `${W}x${H}`);
  }
  await browser.close();
})();
