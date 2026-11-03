/* =====================================================================
   EXTRAS — three motion layers that share one language with the film:
   · СЕРВЕРЫ    advanced map motion: scan, arcs, comet packets, ripples
   · ОТЗЫВЫ     a full-screen spiral of reviews with a camera that travels
   · ВОПРОСЫ    a question zooms forward while the answer is written in
   Everything is transform/opacity + one canvas, gated by IntersectionObserver
   and prefers-reduced-motion, so the page stays light.
   ===================================================================== */
(function(){
'use strict';
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v,a,b)=>v<a?a:v>b?b:v;
const lerp  = (a,b,t)=>a+(b-a)*t;
const eOut  = t=>1-Math.pow(1-clamp(t,0,1),3);
const eIO   = t=>{t=clamp(t,0,1);return t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;};
const $  = s=>document.querySelector(s);
const $$ = s=>[...document.querySelectorAll(s)];
const seg = (v,a,b)=>clamp((v-a)/Math.max(1e-6,b-a),0,1);
const eIO5= t=>{t=clamp(t,0,1);return t<.5?16*t*t*t*t*t:1-Math.pow(-2*t+2,5)/2;};

/* =====================================================================
   1. SERVERS — the map becomes a live flight instrument.
   Layers, back to front:
     · graticule that fades in from the horizon as the section is reached
     · a scanning sweep with a soft head and longitude ticks
     · every server pin blooms its own ping ring, throttled in turn
     · the encrypted route: it draws itself, measures itself in km, breathes,
       and carries a comet of packets with a real velocity trail
     · on every server change the old route is re-flown and dissolves,
       while a shockwave leaves the new destination
     · Europe/world zoom re-maps everything, because the geometry is shared
   ===================================================================== */
(function(){
  const box = $('#mapBox'), svg = $('#mapSvg');
  if(!box || !svg || !window.XPN_MAP) return;
  const cv = document.createElement('canvas');
  cv.className = 'map-fx';
  box.appendChild(cv);
  const c = cv.getContext('2d');
  let W = 0, H = 0, dpr = 1, vis = false, raf = 0, last = 0, tt = 0, t0 = performance.now();
  let shown = 0;                                   // 0..1 how far the section is on screen
  let curSrv = null, prevSrv = null, swapT = 1;

  let svgAR = .4;                 // height / width of the map drawing
  function size(){
    const r = box.getBoundingClientRect();
    const sr = svg.getBoundingClientRect();
    if(sr.width && sr.height) svgAR = sr.height / sr.width;
    W = r.width; H = r.height;
    dpr = Math.min(devicePixelRatio || 1, 1.75);
    cv.width = Math.round(W*dpr); cv.height = Math.round(H*dpr);
    c.setTransform(dpr,0,0,dpr,0,0);
  }
  const api = window.XPN_MAP;   // {X, Y, current, connected}
  function P(lat, lon){ return [api.X(lon), api.Y(lat)]; }

  function route(){
    const cur = api.current();
    if(!cur) return null;
    const a = P(api.me.lat, api.me.lon), b = P(cur.lat, cur.lon);
    const dx = b[0]-a[0], dy = b[1]-a[1], dist = Math.hypot(dx,dy) || 1;
    const lift = Math.min(120, dist*.34) + 26;
    const mid = [(a[0]+b[0])/2, (a[1]+b[1])/2 - lift];
    const at = p => { const q = 1-p; return [q*q*a[0]+2*q*p*mid[0]+p*p*b[0], q*q*a[1]+2*q*p*mid[1]+p*p*b[1]]; };
    return {a, b, mid, at, dist, cur};
  }

  function frame(now){
    raf = vis ? requestAnimationFrame(frame) : 0;
    const dt = Math.min(.05, (now-last)/1000); last = now; tt += dt;
    const r = box.getBoundingClientRect();
    if(Math.abs(r.width-W) > .5){ size(); }
    // how much of the section is in view (drives every entrance)
    const on = Math.min(1, Math.max(0, (innerHeight*.92 - r.top) / (innerHeight*.55)));
    shown += (on - shown) * (1 - Math.exp(-dt*4));

    c.clearRect(0,0,W,H);
    // the svg may be wider than the box (mobile scrolls it), so everything is
    // measured against the svg itself and offset by how far it has scrolled
    const sr = svg.getBoundingClientRect();
    const sc = (sr.width || r.width) / 1000;
    const off = r.left - sr.left;
    // vertically the svg may sit inside a taller box (meet): align by its own top
    const vOff = (sr.height && H - sr.height) > 2 ? (sr.top - r.top) : 0;
    c.save(); c.translate(-off, vOff); c.scale(sc, sc);

    // ---- 1. graticule: the instrument grid fades in behind the continents ----
    if(shown > .02){
      const ga = shown * .5;
      c.strokeStyle = 'rgba(169,183,169,' + (ga*.055).toFixed(3) + ')';
      c.lineWidth = .7;
      for(let lon = -150; lon <= 150; lon += 30){
        const x = 500 + lon/180*500;
        c.beginPath(); c.moveTo(x, 6); c.lineTo(x, 394); c.stroke();
      }
      for(let lat = -40; lat <= 80; lat += 20){
        const y = (84 - lat)/142*400;
        if(y < 4 || y > 396) continue;
        c.beginPath(); c.moveTo(6, y); c.lineTo(994, y); c.stroke();
      }
      // the equator is a touch stronger: an axis the eye can hold on to
      const ye = (84)/142*400;
      c.strokeStyle = 'rgba(193,180,156,' + (ga*.09).toFixed(3) + ')';
      c.beginPath(); c.moveTo(6, ye); c.lineTo(994, ye); c.stroke();
    }

    // ---- 2. scanning sweep with a soft head ----
    const sx = ((tt*.09)%1) * 1000;
    const g = c.createLinearGradient(sx-120,0,sx,0);
    g.addColorStop(0,'rgba(169,183,169,0)');
    g.addColorStop(.82,'rgba(169,183,169,.055)');
    g.addColorStop(1,'rgba(205,220,204,.11)');
    c.fillStyle = g; c.fillRect(sx-120, 0, 120, 400);
    c.strokeStyle = 'rgba(205,220,204,.20)'; c.lineWidth = .8;
    c.beginPath(); c.moveTo(sx,0); c.lineTo(sx,400); c.stroke();
    // longitude ticks catch the light as the sweep passes them
    for(let lon = -180; lon <= 180; lon += 15){
      const tx = 500 + lon/180*500, lit = Math.max(0, 1 - Math.abs(sx - tx)/70);
      if(lit <= .01) continue;
      c.strokeStyle = 'rgba(214,232,210,' + (lit*.5).toFixed(3) + ')';
      c.beginPath(); c.moveTo(tx, 0); c.lineTo(tx, 6 + lit*7); c.stroke();
      c.beginPath(); c.moveTo(tx, 400); c.lineTo(tx, 400 - 6 - lit*7); c.stroke();
    }

    // ---- 3. every pin answers with its own ping ring, one after another ----
    if(shown > .05 && api.pins){
      const pins = api.pins();
      for(let i = 0; i < pins.length; i++){
        const p = P(pins[i].lat, pins[i].lon);
        const ph = ((tt*.36 + i*.137) % 1);
        const isCur = api.current() === pins[i];
        const a = (1 - ph) * (isCur ? .5 : .13) * shown;
        if(a <= .012) continue;
        c.strokeStyle = 'rgba(' + (isCur ? '193,180,156,' : '169,183,169,') + a.toFixed(3) + ')';
        c.lineWidth = .9;
        c.beginPath(); c.arc(p[0], p[1], 4 + ph*17, 0, 6.283); c.stroke();
      }
    }

    const d = route();
    if(d){
      if(!curSrv){ curSrv = d.cur; }
      else if(curSrv !== d.cur){ prevSrv = curSrv; curSrv = d.cur; swapT = 0; }
      swapT = Math.min(1, swapT + dt/.55);

      const draw = eIO(clamp(((now-t0)-150)/950)) * Math.min(1, shown*1.6);
      c.lineCap = 'round';

      // ---- 3b. previous route: re-flown and dissolved on every server change ----
      if(prevSrv && swapT < 1){
        const pa = P(api.me.lat, api.me.lon), pb = P(prevSrv.lat, prevSrv.lon);
        const pdx = pb[0]-pa[0], pdy = pb[1]-pa[1], pdist = Math.hypot(pdx,pdy) || 1;
        const plift = Math.min(120, pdist*.34) + 26;
        const pm = [(pa[0]+pb[0])/2, (pa[1]+pb[1])/2 - plift];
        const at = q => { const z = 1-q; return [z*z*pa[0]+2*z*q*pm[0]+q*q*pb[0], z*z*pa[1]+2*z*q*pm[1]+q*q*pb[1]]; };
        const fade = 1 - swapT;
        c.beginPath();
        for(let i=0;i<=60;i++){ const [x,y] = at(i/60); i?c.lineTo(x,y):c.moveTo(x,y); }
        c.strokeStyle = 'rgba(214,212,204,' + (fade*.30).toFixed(3) + ')';
        c.lineWidth = 1.1; c.stroke();
        // an outgoing ring where it used to land
        c.strokeStyle = 'rgba(214,212,204,' + (fade*.35).toFixed(3) + ')';
        c.beginPath(); c.arc(pb[0], pb[1], 6 + (1-fade)*22, 0, 6.283); c.stroke();
      }

      // ---- 4. the live route ----
      c.beginPath();
      for(let i=0;i<=90;i++){ const p = (i/90)*draw, [x,y] = d.at(p); i?c.lineTo(x,y):c.moveTo(x,y); }
      c.strokeStyle = 'rgba(169,183,169,.26)'; c.lineWidth = 6; c.stroke();
      c.strokeStyle = 'rgba(214,232,210,.92)'; c.lineWidth = 1.5; c.stroke();

      // distance ticks along the arc — the route is measured, not decorated
      c.font = '500 9px ui-monospace,Menlo,Consolas,monospace'; c.textAlign = 'center';
      const total = api.km ? api.km(api.me, d.cur) : 0;
      for(let i=1;i<6;i++){
        const p = i/6; if(draw <= p) continue;
        const [x,y] = d.at(p), [x2,y2] = d.at(p+.01);
        const ang = Math.atan2(y2-y, x2-x), nx = -Math.sin(ang), ny = Math.cos(ang);
        c.strokeStyle = 'rgba(214,212,204,.5)'; c.lineWidth = 1;
        c.beginPath(); c.moveTo(x-nx*3, y-ny*3); c.lineTo(x+nx*5, y+ny*5); c.stroke();
        if(total && i % 2 === 0){
          c.fillStyle = 'rgba(214,212,204,.42)';
          c.fillText(Math.round(total*p/10)*10 + ' км', x + nx*15, y + ny*15);
        }
      }

      // ---- comet: a packet with a real velocity trail ----
      if(draw > .995){
        const cp = (tt*.30) % 1;
        for(let k=0;k<14;k++){
          const p = cp - k*.012; if(p<0) continue;
          const [x,y] = d.at(p);
          const a = (1-k/14) * .85;
          const rad = 3.1 - k*.16;
          if(k === 0){
            const rg = c.createRadialGradient(x,y,0,x,y,16);
            rg.addColorStop(0,'rgba(240,246,236,.85)'); rg.addColorStop(1,'rgba(169,183,169,0)');
            c.fillStyle = rg; c.beginPath(); c.arc(x,y,16,0,6.283); c.fill();
          }
          c.fillStyle = 'rgba(224,236,220,' + a.toFixed(3) + ')';
          c.beginPath(); c.arc(x,y, Math.max(.5, rad), 0, 6.283); c.fill();
        }
        // the reverse packet: an answer travelling home, dimmer
        const bp = (cp + .5) % 1;
        const [bx,by] = d.at(1 - bp);
        c.fillStyle = 'rgba(193,180,156,.75)';
        c.beginPath(); c.arc(bx,by, 2.1, 0, 6.283); c.fill();
      }

      // ---- 5. destination: shockwave on arrival + steady breathing ripple ----
      if(swapT < 1){
        const q = swapT;
        c.strokeStyle = 'rgba(193,180,156,' + ((1-q)*.75).toFixed(3) + ')';
        c.lineWidth = 1.4 - q;
        c.beginPath(); c.ellipse(d.b[0], d.b[1], 3+q*46, (3+q*46)*.55, 0, 0, 6.283); c.stroke();
      }
      for(let k=0;k<2;k++){
        const q = ((tt*.40 + k*.5)%1);
        c.strokeStyle = 'rgba(193,180,156,' + ((1-q)*.45).toFixed(3) + ')'; c.lineWidth = 1;
        c.beginPath(); c.ellipse(d.b[0], d.b[1], 5+q*26, (5+q*26)*.55, 0, 0, 6.283); c.stroke();
      }
      // origin: a quiet node with a slow second ring — "you are here"
      c.fillStyle = 'rgba(233,230,223,.92)';
      c.beginPath(); c.arc(d.a[0], d.a[1], 3, 0, 6.283); c.fill();
      const oq = (tt*.6)%1;
      c.strokeStyle = 'rgba(233,230,223,' + ((1-oq)*.30).toFixed(3) + ')'; c.lineWidth = 1;
      c.beginPath(); c.arc(d.a[0], d.a[1], 4 + oq*13, 0, 6.283); c.stroke();

      // a header strip that reads out the live link, drawn in the map's own ink
      if(draw > .3){
        const ha = Math.min(1, (draw-.3)/.5) * .85;
        const label = 'ЗАШИФРОВАНО · ' + d.cur.city.toUpperCase() + (total ? ' · ' + Math.round(total/10)*10 + ' КМ' : '');
        c.font = '600 9.5px ui-monospace,Menlo,Consolas,monospace';
        c.textAlign = 'left';
        const tw = c.measureText(label).width;
        const lx = 14, ly = 24;
        c.fillStyle = 'rgba(20,23,26,' + (ha*.7).toFixed(3) + ')';
        c.beginPath();
        if(c.roundRect) c.roundRect(lx-6, ly-12, tw+20, 20, 5); else c.rect(lx-6, ly-12, tw+20, 20);
        c.fill();
        c.fillStyle = 'rgba(196,220,194,' + (ha*.9).toFixed(3) + ')';
        c.fillText(label, lx+6, ly+2);
        const pulse = (tt*1.6)%1;
        c.fillStyle = 'rgba(147,179,155,' + ((1-pulse)*.9).toFixed(3) + ')';
        c.beginPath(); c.arc(lx, ly-2, 1.6 + pulse*2.2, 0, 6.283); c.fill();
        c.fillStyle = 'rgba(147,179,155,.95)';
        c.beginPath(); c.arc(lx, ly-2, 1.7, 0, 6.283); c.fill();
      }
    }
    c.restore();
  }
  const io = new IntersectionObserver(es=>{
    es.forEach(e=>{
      vis = e.isIntersecting;
      if(vis && !raf){ last = performance.now(); raf = requestAnimationFrame(frame); }
    });
  }, {rootMargin:'160px'});
  size(); io.observe(box);
  addEventListener('resize', size, {passive:true});
  if(reduce){ vis = false; cv.style.display = 'none'; }
})();

/* =====================================================================
   2. REVIEWS — built with the same camera the tariff film uses.
   Instead of scaling cards in 2D, the reviews live in a world that is
   pushed around by a camera: focus on a review and the camera flies to it
   along a bowed path with a zoom dip, while the motion graphics are drawn
   on canvas underneath — the graph of the whole set, a rail with legs to
   every review, the thread that ties the chosen one to its neighbours and
   the halo that travels with it. Closing reverses the same flight.
   ===================================================================== */
(function(){
  const src = $$('#reviews .testi');
  const btn = $('.rv-open');
  if(!src.length || !btn) return;

  const DATA = src.map(el=>{
    const stars = el.querySelectorAll('.stars .ic.fill:not(.off)').length || 5;
    const av = el.querySelector('.avatar');
    return {
      text: ((el.querySelector('p') || {}).textContent || '').trim(),
      who:  ((el.querySelector('.who b') || {}).textContent || '').trim(),
      meta: ((el.querySelector('.who small') || {}).textContent || '').trim(),
      init: (av ? av.textContent : '\u2022').trim(),
      av:   (av ? av.className : '').replace('avatar', '').trim(),
      stars: Math.max(1, Math.min(5, stars))
    };
  });
  const N = DATA.length;
  if(!N) return;

  /* ---------------- overlay ---------------- */
  const ov = document.createElement('div');
  ov.className = 'rvc';
  ov.setAttribute('role', 'dialog');
  ov.setAttribute('aria-modal', 'true');
  ov.setAttribute('aria-label', 'Все отзывы');
  ov.innerHTML =
    '<div class="rvc-bg"></div>' +
    '<canvas class="rvc-cv rvc-cv-b"></canvas>' +
    '<div class="rvc-vp"><div class="rvc-world">' +
      '<div class="rvc-rail" aria-hidden="true"><i class="rvc-rail-l"></i><i class="rvc-rail-f"></i></div>' +
    '</div></div>' +
    '<canvas class="rvc-cv rvc-cv-f"></canvas>' +
    '<div class="rvc-ui">' +
      '<div class="rvc-top">' +
        '<div class="rvc-ttl">XPN <i></i> отзывы <em>' + DATA.length + ' историй · 4,8 из 5</em></div>' +
        '<button class="rvc-btn rvc-close" type="button">Закрыть</button>' +
      '</div>' +
      '<div class="rvc-bot">' +
        '<button class="rvc-btn rvc-prev" type="button">Назад</button>' +
        '<div class="rvc-hint-mid"><span class="rvc-count"><b>01</b><i>/</i><span>' + String(N).padStart(2, '0') + '</span></span>' +
          '<small class="rvc-hint">выберите отзыв или листайте</small></div>' +
        '<button class="rvc-btn rvc-next" type="button">Дальше</button>' +
      '</div>' +
    '</div>';

  // the old markup kept the rail in the UI layer; here it lives in the world
  document.body.appendChild(ov);
  const world = ov.querySelector('.rvc-world');
  const cvB = ov.querySelector('.rvc-cv-b'), cB = cvB.getContext('2d');
  const cvF = ov.querySelector('.rvc-cv-f'), cF = cvF.getContext('2d');
  const numB = ov.querySelector('.rvc-count b');
  const hint = ov.querySelector('.rvc-hint');
  const railL = ov.querySelector('.rvc-rail-l');

  /* light sprite: one radial gradient, reused (no shadowBlur per frame) */
  const glow = document.createElement('canvas'); glow.width = glow.height = 64;
  { const g = glow.getContext('2d'), rg = g.createRadialGradient(32,32,0,32,32,32);
    rg.addColorStop(0,'rgba(240,246,236,1)'); rg.addColorStop(.2,'rgba(214,232,210,.7)');
    rg.addColorStop(.55,'rgba(169,183,169,.16)'); rg.addColorStop(1,'rgba(193,180,156,0)');
    g.fillStyle = rg; g.fillRect(0,0,64,64); }

  /* ---------------- cards ---------------- */
  const cards = DATA.map((d, i)=>{
    const el = document.createElement('article');
    el.className = 'rvc-card';
    el.tabIndex = 0;
    el.dataset.i = i;
    el.setAttribute('role', 'button');
    el.setAttribute('aria-label', 'Отзыв ' + (i + 1) + ' из ' + N + ': ' + d.who);
    const st = Array.from({length:5}, (_, k)=>'<i class="' + (k < d.stars ? '' : 'off') + '"></i>').join('');
    el.innerHTML =
      '<span class="rvc-num">' + String(i + 1).padStart(2, '0') + '</span>' +
      '<div class="rvc-stars">' + st + '</div>' +
      '<p class="rvc-q">' + d.text.replace(/^«/, '').replace(/»$/, '') + '</p>' +
      '<div class="rvc-who"><span class="avatar ' + d.av + '">' + d.init + '</span>' +
      '<div><b>' + d.who + '</b><small>' + d.meta + '</small></div></div>';
    el.addEventListener('click', ()=>{ if(live) go(i); });
    el.addEventListener('keydown', e=>{
      if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); if(live) go(i); }
    });
    world.appendChild(el);
    return {el, li:null, i, d};
  });

  /* ---------------- world layout ----------------
     The reviews stand as a wall that recedes to the right: each is a column
     with its own x/y/z, so the camera can fly between them exactly like it
     flies between the tariff card, the note and the doc.               */
  let vw = 0, vh = 0, dpr = 1, base = 1, sm = false;
  const GAP = 40, COLW = 430;
  const cam = {x:0, y:0, z:1, r:0};
  let camT = null, camQ = null;
  let live = false, closing = false, raf = 0, last = 0, lt = 0, NOW = 0, pvx = 0;
  let sel = -1, target = 0, seq = 0, intro = 0, closeAt = 0, num = -1, bTick = 0;
  const RC = new Map();
  let RS = 1, RCs = 1, RSn = 0, BX = 0, BY = 0;

  function resize(){
    vw = innerWidth; vh = innerHeight;
    dpr = Math.min(devicePixelRatio || 1, 1.5);
    [cvB, cvF].forEach(c=>{ c.width = Math.round(vw*dpr); c.height = Math.round(vh*dpr); });
    cB.setTransform(dpr,0,0,dpr,0,0); cF.setTransform(dpr,0,0,dpr,0,0);
    sm = vw < 760;
    base = sm ? 1 : clamp(Math.min(vw/1240, vh/860), .62, 1.08);
    world.classList.toggle('sm', sm);
  }

  function place(){
    // a gently curved wall: every card is lifted a little at the ends, so the
    // row reads as an arc rather than a strip of paper
    const cw = sm ? Math.min(vw * .8, 340) : COLW;
    const mid = (N - 1) / 2;
    cards.forEach((c, i)=>{
      const dx = i - mid;
      const x = 120 + i * (cw + GAP);
      const y = 300 + Math.abs(dx) * 14;
      c.el.style.width = cw + 'px';
      c.el.style.left = x + 'px';
      c.el.style.top = y + 'px';
    });
    /* rail: a hairline behind the row, drawn in the world so it moves with it */
    const first = 120 + cw / 2, lastX = 120 + (N - 1) * (cw + GAP) + cw / 2;
    const railY = 300 + 96;
    railL.style.cssText = 'left:' + first + 'px;top:' + railY + 'px;width:' + (lastX - first) + 'px';
    RC.clear();
  }

  function wrect(el){
    let r = RC.get(el);
    if(r) return r;
    let x = 0, y = 0, n = el;
    while(n && n !== world){ x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
    const w = el.offsetWidth, h = el.offsetHeight;
    r = {x, y, w, h, cx:x + w/2, cy:y + h/2, r:x + w, b:y + h};
    RC.set(el, r);
    return r;
  }
  function toS(x, y){
    const dx = (x - BX) * RS, dy = (y - BY) * RS;
    return [vw/2 + dx*RCs - dy*RSn, vh/2 + dx*RSn + dy*RCs];
  }

  /* ---------------- camera: same flight as the tariff film ---------------- */
  function camTo(x, y, z, dur, lift, dip, roll){
    if(reduce || !(live || closing)){ cam.x = x; cam.y = y; cam.z = z; camT = null; return; }
    const dx = x - cam.x, dy = y - cam.y, d = Math.hypot(dx, dy) || 1;
    const bow = (lift || 0) + Math.min(d * .16, 130);
    const mx = (cam.x + x)/2 - dy/d*bow, my = (cam.y + y)/2 + dx/d*bow - (lift || 0)*.35;
    camT = {x0:cam.x, y0:cam.y, z0:cam.z, cx:mx, cy:my, x, y, z,
            t0:performance.now(), d:dur, dip:dip || 0, roll:roll || 0, r0:cam.r};
  }
  function stepCam(now){
    if(!camT){ if(camQ){ const q = camQ; camQ = null; camTo(q[0],q[1],q[2],q[3],q[4],q[5],q[6]); } return; }
    const c = camT, u = clamp((now - c.t0)/c.d, 0, 1), e = eIO5(u), q = 1 - e;
    cam.x = q*q*c.x0 + 2*q*e*c.cx + e*e*c.x;
    cam.y = q*q*c.y0 + 2*q*e*c.cy + e*e*c.y;
    const zs = lerp(c.z0, c.z, eIO(u)) * (1 - c.dip*Math.sin(Math.PI*u));
    cam.z = zs * (1 + .045*Math.sin(Math.PI*u)*(1-u));
    cam.r = c.r0 + Math.sin(Math.PI*u) * (c.roll || 0);
    if(u >= 1) camT = null;
  }
  const fitZ = (w, h, cap)=>Math.min(cap*base, (vw*.92)/w, (vh - (sm?170:190))/h);
  function cardCam(i){
    const r = wrect(cards[i].el);
    return {x:r.cx, y:r.cy, z:fitZ(r.w + (sm?30:220), r.h + 60, 1)};
  }
  function homeCam(){
    const first = wrect(cards[0].el), lastR = wrect(cards[N-1].el);
    const x0 = first.x - 30, x1 = lastR.r + 30;
    return {x:(x0+x1)/2, y:first.cy + 4, z:fitZ(Math.min(x1-x0, 1500), first.h + 90, 1.02)};
  }

  function applyWorld(){
    const br = reduce ? 0 : 1;
    BX = cam.x + Math.sin(lt*.28)*4*br;
    BY = cam.y + Math.cos(lt*.21)*3*br;
    RS = cam.z;
    RCs = Math.cos(cam.r); RSn = Math.sin(cam.r);
    world.style.transform =
      'translate3d(' + (vw/2).toFixed(1) + 'px,' + (vh/2).toFixed(1) + 'px,0) rotate(' + cam.r.toFixed(5) + 'rad) scale(' + RS.toFixed(4) + ') ' +
      'translate3d(' + (-BX).toFixed(2) + 'px,' + (-BY).toFixed(2) + 'px,0)';
  }

  /* ---------------- motion graphics ---------------- */
  function line(ctx, pts, t, col, w){
    if(t <= 0) return null;
    let L = 0; const d = [];
    for(let i = 1; i < pts.length; i++){ const l = Math.hypot(pts[i][0]-pts[i-1][0], pts[i][1]-pts[i-1][1]); d.push(l); L += l; }
    let rem = L * clamp(t, 0, 1), end = pts[0];
    ctx.beginPath();
    let p = toS(pts[0][0], pts[0][1]); ctx.moveTo(p[0], p[1]);
    for(let i = 1; i < pts.length && rem > 0; i++){
      const k = Math.min(1, rem / d[i-1]);
      end = [lerp(pts[i-1][0], pts[i][0], k), lerp(pts[i-1][1], pts[i][1], k)];
      p = toS(end[0], end[1]); ctx.lineTo(p[0], p[1]); rem -= d[i-1];
    }
    ctx.strokeStyle = col; ctx.lineWidth = w || 1; ctx.stroke();
    return end;
  }
  function bezPts(a, b, c, d, n){
    const out = [];
    for(let i = 0; i <= n; i++){
      const t = i/n, q = 1-t;
      out.push([q*q*q*a[0] + 3*q*q*t*b[0] + 3*q*t*t*c[0] + t*t*t*d[0],
                q*q*q*a[1] + 3*q*q*t*b[1] + 3*q*t*t*c[1] + t*t*t*d[1]]);
    }
    return out;
  }
  function dot(ctx, x, y, size, a){
    if(a <= .01) return;
    const p = toS(x, y);
    ctx.globalAlpha = a; ctx.drawImage(glow, p[0]-size/2, p[1]-size/2, size, size); ctx.globalAlpha = 1;
  }
  function traceRect(ctx, r, sy, t, col){
    if(t <= 0) return;
    sy = clamp(sy, r.y, r.b);
    const up = [[r.x,sy],[r.x,r.y],[r.r,r.y],[r.r,(r.y+r.b)/2]];
    const dn = [[r.x,sy],[r.x,r.b],[r.r,r.b],[r.r,(r.y+r.b)/2]];
    const lu = (sy - r.y) + r.w + r.h/2, ld = (r.b - sy) + r.w + r.h/2, L = Math.max(lu, ld);
    line(ctx, up, t*L/lu, col, 1); line(ctx, dn, t*L/ld, col, 1);
  }
  function ticks(ctx, r, a){
    if(a <= .01) return;
    const o = 10, l = 9;
    ctx.strokeStyle = 'rgba(214,226,212,' + (.5*a).toFixed(3) + ')'; ctx.lineWidth = 1;
    [[r.x-o, r.y-o, 1, 1],[r.r+o, r.y-o, -1, 1],[r.x-o, r.b+o, 1, -1],[r.r+o, r.b+o, -1, -1]].forEach(c=>{
      const p0 = toS(c[0] + c[2]*l*a, c[1]), p1 = toS(c[0], c[1]), p2 = toS(c[0], c[1] + c[3]*l*a);
      ctx.beginPath(); ctx.moveTo(p0[0],p0[1]); ctx.lineTo(p1[0],p1[1]); ctx.lineTo(p2[0],p2[1]); ctx.stroke();
    });
  }

  /* back layer: the graph of the whole set, on a parallax plane */
  function paintBack(oa){
    cB.clearRect(0, 0, vw, vh);
    const ps = RS * .62, gs = 76;
    const cx = BX * .62, cy = BY * .62;
    const hw = vw/(2*ps) + gs, hh = vh/(2*ps) + gs;
    const x0 = Math.floor((cx - hw)/gs)*gs, y0 = Math.floor((cy - hh)/gs)*gs;
    /* dots at the intersections: the same paper the tariff film is drawn on */
    cB.fillStyle = 'rgba(169,183,169,' + (.15*oa).toFixed(3) + ')';
    for(let x = x0; x <= cx + hw; x += gs) for(let y = y0; y <= cy + hh; y += gs){
      const dx = (x - cx)*ps, dy = (y - cy)*ps;
      cB.fillRect(vw/2 + dx*RCs - dy*RSn, vh/2 + dx*RSn + dy*RCs, 1.3, 1.3);
    }
    /* the graph: every review is a node, neighbours are joined by a thin link */
    if(!cards.length) return;
    const mid = (N - 1)/2;
    cB.lineWidth = 1;
    for(let i = 0; i < N; i++){
      const r = wrect(cards[i].el);
      const dx = (r.cx - BX)*RS, dy = (r.cy - BY)*RS;
      const sx = vw/2 + dx*RCs - dy*RSn, sy = vh/2 + dx*RSn + dy*RCs;
      if(sx < -200 || sx > vw + 200) continue;
      const active = i === sel;
      const a = (active ? .55 : .16) * oa;
      cB.fillStyle = 'rgba(214,232,210,' + a.toFixed(3) + ')';
      cB.beginPath(); cB.arc(sx, sy, active ? 3.4 : 1.9, 0, 6.283); cB.fill();
      /* the chosen node drags a thread to its neighbours: a live graph, not a list */
      if(active){
        for(const k of [i-1, i+1]){
          if(k < 0 || k >= N) continue;
          const r2 = wrect(cards[k].el);
          const dx2 = (r2.cx - BX)*RS, dy2 = (r2.cy - BY)*RS;
          const tx = vw/2 + dx2*RCs - dy2*RSn, ty = vh/2 + dx2*RSn + dy2*RCs;
          cB.strokeStyle = 'rgba(169,183,169,' + (.22*oa).toFixed(3) + ')';
          cB.beginPath(); cB.moveTo(sx, sy);
          cB.quadraticCurveTo((sx+tx)/2, Math.min(sy,ty) - 46, tx, ty); cB.stroke();
          const ph = (lt*.35 + (k > i ? .5 : 0)) % 1, u = 1 - ph;
          const bx = u*u*sx + 2*u*ph*((sx+tx)/2) + ph*ph*tx;
          const by = u*u*sy + 2*u*ph*(Math.min(sy,ty) - 46) + ph*ph*ty;
          cB.fillStyle = 'rgba(214,232,210,' + (.7*oa).toFixed(3) + ')';
          cB.beginPath(); cB.arc(bx, by, 1.6, 0, 6.283); cB.fill();
        }
      }
      void mid;
    }
  }

  /* front layer: rail, legs, the flight of the halo */
  function paintFront(oa, pS, fly){
    cF.clearRect(0, 0, vw, vh);
    if(!cards.length) return;
    const r0 = wrect(cards[0].el), rN = wrect(cards[N-1].el), lastR = wrect(cards[N-1].el);
    const railX0 = r0.cx, railX1 = lastR.cx, railY = r0.cy;
    const g = eOut(seg(oa, .15, 1));
    if(g > .01){
      line(cF, [[railX0, railY], [railX1, railY]], g, 'rgba(169,183,169,' + (.10*g*oa).toFixed(3) + ')', 1);
      /* a leg from the rail down to every review, drawn in order */
      cards.forEach((c, i)=>{
        const r = wrect(c.el);
        const li = seg(g, i/N*.7, i/N*.7 + .3);
        if(li <= .01) return;
        const a = (sel < 0 ? .16 : (i === sel ? .5 : .12)) * oa;
        line(cF, [[r.cx, railY], [r.cx, r.y - 8]], li, 'rgba(169,183,169,' + a.toFixed(3) + ')', 1);
      });
    }
    if(sel < 0) return;
    const r = wrect(cards[sel].el);
    /* the halo that marks the chosen review: a point that breathes */
    const ph = (lt * .38) % 1;
    for(let k = 0; k < 2; k++){
      const q = (ph + k*.5) % 1;
      const p = toS(r.cx, r.y - 18);
      cF.beginPath(); cF.arc(p[0], p[1], (4 + q*22)*RS, 0, 6.2832);
      cF.strokeStyle = 'rgba(193,180,156,' + ((1-q)*.5*oa).toFixed(3) + ')';
      cF.lineWidth = 1; cF.stroke();
    }
    /* the frame that draws itself around the chosen review on arrival */
    const t1 = eIO(seg(pS, .35, .85));
    if(t1 > .001){
      traceRect(cF, r, r.y + r.h*.5, t1, 'rgba(214,226,212,' + (.5*oa).toFixed(3) + ')');
      ticks(cF, r, eOut(seg(pS, .8, 1)) * oa);
      if(t1 < .999){ const end = toS(r.cx, r.y + r.h*.5); dot(cF, r.cx, r.y + r.h*.5, 22, (1-t1)*oa); void end; }
    }
    /* a packet of light runs from the chosen card to its neighbour */
    if(sel > -1){
      const rn = cards[Math.min(sel+1, N-1)];
      if(rn && rn !== cards[sel]){
        const r2 = wrect(rn.el);
        const a = [r.cx, r.y - 18], b = [r2.cx, r2.y - 18];
        line(cF, bezPts(a, [a[0] + (b[0]-a[0])*.4, a[1] - 40], [a[0] + (b[0]-a[0])*.6, b[1] - 40], b, 20),
             .85, 'rgba(214,226,212,' + (.2*oa).toFixed(3) + ')', 1);
      }
    }
    void fly;
  }

  /* ---------------- states ---------------- */
  let pS = 0;               // 0..1 focus-on-a-review progress
  let tw = null;
  function twTo(to, dur){
    tw = {a:pS, b:to, t0:performance.now(), d:reduce ? 1 : dur};
  }
  function stepTW(now){
    if(!tw) return;
    const u = clamp((now - tw.t0)/tw.d, 0, 1);
    pS = tw.a + (tw.b - tw.a) * eIO(u);
    if(u >= 1) tw = null;
  }

  function go(i){
    target = clamp(i, 0, N - 1);
    const c = cardCam(target);
    /* the same flight as the tariff film: a bowed path, a zoom dip and a
       splash of light where the camera lands */
    camTo(c.x + (sm ? 0 : 90), c.y + 6, c.z, 1150, 34, .04, .006);
    twTo(1, 900);
    if(sel !== target){ sel = target; pS = .05; twTo(1, 900); }
    num = -1;
    if(!raf){ last = performance.now(); raf = requestAnimationFrame(frame); }
  }
  function step(dir){ go(Math.round(target) + dir); }

  function openFilm(){
    if(live) return;
    live = true; closing = false; lt = 0; intro = performance.now();
    resize(); place();
    ov.classList.add('live');
    document.body.classList.add('rvc-open');
    sel = -1; target = 0; pS = 0; tw = null;
    camT = null; camQ = null;
    btn.style.transition = 'transform .5s cubic-bezier(.16,.84,.28,1)';
    btn.style.transform = 'scale(.94)';
    const h = homeCam();
    const c = cardCam(0);
    /* the entry: the camera starts wide and slightly to the left, then
       pushes in to the first review — the same move the tariff film opens on */
    if(reduce){ cam.x = c.x; cam.y = c.y; cam.z = c.z; }
    else { cam.x = h.x - 180; cam.y = h.y + 60; cam.z = h.z * .72; camTo(c.x, c.y, c.z, 1400, 40, .05, .01); }
    sel = 0; target = 0; pS = .2; twTo(1, 1000);
    num = -1;
    if(!raf){ last = performance.now(); raf = requestAnimationFrame(frame); }
    requestAnimationFrame(()=>{ setTimeout(()=>ov.classList.add('shown'), 20); });
    setTimeout(()=>{ const b = ov.querySelector('.rvc-close'); if(b) b.focus({preventScroll:true}); }, 90);
  }

  function closeFilm(){
    if(!live || closing) return;
    closing = true; live = false; closeAt = performance.now();
    ov.classList.remove('shown');
    /* reverse: pull the camera back out to the whole wall, then let it fall
       into the button — the mirror of the entry */
    const h = homeCam();
    camTo(h.x - 140, h.y + 40, h.z * .82, 900, 26, .02, .006);
    twTo(0, 520);
    if(!raf){ last = performance.now(); raf = requestAnimationFrame(frame); }
  }

  function finish(){
    closing = false;
    ov.classList.remove('live', 'shown');
    document.body.classList.remove('rvc-open');
    world.style.transform = ''; cB.clearRect(0,0,vw,vh); cF.clearRect(0,0,vw,vh);
    if(raf){ cancelAnimationFrame(raf); raf = 0; }
    btn.style.transform = '';
    btn.focus({preventScroll:true});
  }

  /* ---------------- frame ---------------- */
  function frame(now){
    const dt = Math.min(.05, (now - last)/1000); last = now; lt += dt; NOW = now;
    raf = (live || closing) ? requestAnimationFrame(frame) : 0;
    stepTW(now);
    const px = cam.x; stepCam(now);
    const vx = dt > 0 ? (cam.x - px)/dt : 0;
    pvx += (vx - pvx) * (1 - Math.exp(-dt*6));
    const rT = reduce ? 0 : clamp(-pvx/26000, -.026, .026);
    cam.r += (rT - cam.r) * (1 - Math.exp(-dt*5));
    applyWorld();

    let oa = 1, fly = 0;
    if(closing){
      const u = clamp((now - closeAt)/980, 0, 1);
      oa = 1 - eIO(u);
      fly = eIO(clamp((u - .35)/.65, 0, 1));
      /* the wall drops away into the button as the overlay dissolves */
      world.style.opacity = (1 - fly).toFixed(3);
      ov.style.opacity = ((1 - u) * (1 - u)).toFixed(3);
      if(u >= 1){ finish(); return; }
    } else {
      world.style.opacity = '';
      const u = clamp((now - intro)/900, 0, 1);
      oa = eOut(u);
    }

    /* cards: the chosen one stands forward, the rest lean back */
    cards.forEach((c, i)=>{
      const d = Math.abs(i - sel);
      const k = reduce ? 0 : clamp(d * .5, 0, 1);
      c.el.style.transform =
        'translateZ(' + (-k*120).toFixed(1) + 'px) rotateY(' + (i < sel ? 5 : i > sel ? -5 : 0) * k + 'deg)';
      c.el.style.opacity = (1 - k*.42).toFixed(3);
      c.el.classList.toggle('is-on', i === sel);
    });
    /* the dot lattice is a slow parallax plane: it does not need to be
       rebuilt every frame, and halving it halves the whole canvas cost */
    if((++bTick & 1) === 0) paintBack(oa);
    paintFront(oa, pS, fly);

    const nn = Math.round(clamp(target, 0, N - 1));
    if(nn !== num){ num = nn; numB.textContent = String(nn + 1).padStart(2, '0'); }
    if(hint) hint.textContent = pS > .5 ? 'листайте — камера полетит к следующему' : 'выберите отзыв или листайте';
  }

  /* ---------------- input ---------------- */
  btn.addEventListener('click', openFilm);
  ov.querySelector('.rvc-close').addEventListener('click', closeFilm);
  ov.querySelector('.rvc-next').addEventListener('click', ()=>step(1));
  ov.querySelector('.rvc-prev').addEventListener('click', ()=>step(-1));

  addEventListener('keydown', e=>{
    if(!live) return;
    if(e.key === 'Escape'){ e.preventDefault(); closeFilm(); }
    else if(e.key === 'ArrowRight'){ e.preventDefault(); step(1); }
    else if(e.key === 'ArrowLeft'){ e.preventDefault(); step(-1); }
    else if(e.key === 'Home'){ e.preventDefault(); go(0); }
    else if(e.key === 'End'){ e.preventDefault(); go(N - 1); }
  });

  let lock = 0;
  ov.addEventListener('wheel', e=>{
    if(!live) return;
    e.preventDefault();
    const now = performance.now();
    if(now - lock < 240) return;
    lock = now;
    if(Math.abs(e.deltaY) < 6 && Math.abs(e.deltaX) < 6) return;
    step((e.deltaY || e.deltaX) > 0 ? 1 : -1);
  }, {passive:false});

  let drag = null;
  ov.addEventListener('pointerdown', e=>{
    if(!live || e.target.closest('button, .rvc-card')) return;
    drag = {x:e.clientX};
  });
  ov.addEventListener('pointermove', e=>{
    if(!drag) return;
    const dx = e.clientX - drag.x;
    if(Math.abs(dx) > 80){ drag.x = e.clientX; step(dx < 0 ? 1 : -1); }
  }, {passive:true});
  ov.addEventListener('pointerup', ()=>{ drag = null; }, {passive:true});
  ov.addEventListener('pointercancel', ()=>{ drag = null; }, {passive:true});

  let tx = 0, ty = 0;
  ov.addEventListener('touchstart', e=>{ const p = e.touches[0]; tx = p.clientX; ty = p.clientY; }, {passive:true});
  ov.addEventListener('touchend', e=>{
    if(!live) return;
    const p = e.changedTouches[0];
    const dx = p.clientX - tx, dy = p.clientY - ty;
    if(Math.abs(dx) > 44 && Math.abs(dx) > Math.abs(dy)) step(dx < 0 ? 1 : -1);
  }, {passive:true});

  addEventListener('resize', ()=>{ if(live || closing){ resize(); place(); const c = cardCam(Math.round(target)); camTo(c.x + (sm?0:90), c.y + 6, c.z, 400, 0, 0); } }, {passive:true});
  window.__RVC = {go, close:closeFilm, open:openFilm, st:()=>({live, closing, sel, target, cam:{...cam}, pS:+pS.toFixed(2)})};
})();


/* =====================================================================
   3. FAQ — the question comes forward, the answer is written in.
   Clicking a question does not just expand a row: the list becomes a
   camera. The chosen item flies to the middle of the viewport, scales up,
   everything else recedes and blurs, and the answer is written line by
   line (each sentence rises on its own beat). The backdrop dims behind it,
   a counter shows where you are, and closing is the same move backwards:
   the answer retracts, the card settles home, the focus dissolves.
   Keyboard: Esc closes, Up/Down walks the questions.
   ===================================================================== */
(function(){
  const list = $('#faqList');
  if(!list) return;
  const items = [...list.querySelectorAll('.faq-item')];
  if(!items.length) return;

  /* every answer is split into lines of motion */
  items.forEach(it=>{
    const a = it.querySelector('.faq-a');
    if(!a) return;
    const inner = a.firstElementChild || a;
    if(inner.dataset.split) return;
    inner.dataset.split = '1';
    const parts = inner.innerHTML.split(/(?<=[.!?])\s+/).filter(Boolean);
    inner.innerHTML = parts.map((part, k)=>
      '<span class="fa-l" style="--d:' + (k * 90) + 'ms"><span>' + part + '</span></span>'
    ).join(' ');
  });

  /* the stage: a dimmer + a counter, both created once */
  const dim = document.createElement('div');
  dim.className = 'faq-dim';
  const cnt = document.createElement('div');
  cnt.className = 'faq-count';
  cnt.innerHTML = '<b>01</b><i>/</i><span>' + items.length + '</span><small>Esc — вернуться</small>';
  list.appendChild(dim);
  list.appendChild(cnt);

  let cur = -1;

  function place(it){
    /* the card is moved with a transform, so layout never jumps: we measure
       where it already sits and where the camera wants it */
    const base = it.offsetTop;
    const targetY = list.scrollTop + (innerHeight * .5 - list.getBoundingClientRect().top) - it.offsetHeight * .5;
    it.style.setProperty('--fy', (targetY - base).toFixed(1) + 'px');
  }

  function focus(i){
    const it = items[i];
    if(!it) return;
    cur = i;
    /* the accordion animates max-height from the old value: give it two
       frames so the answer has its full height before the card flies up
       and the card is not measured while it is still growing */
    place(it);
    requestAnimationFrame(()=>requestAnimationFrame(()=>{ if(cur === i) place(it); }));
    list.classList.add('faq-focus');
    items.forEach((o, k)=>{
      o.classList.toggle('faq-near', k === i);
      o.classList.toggle('faq-far', k !== i);
    });
    cnt.querySelector('b').textContent = String(i + 1).padStart(2, '0');
    cnt.classList.add('on');
  }

  function blur(){
    cur = -1;
    list.classList.remove('faq-focus');
    cnt.classList.remove('on');
    items.forEach(o=>{
      o.classList.remove('faq-near', 'faq-far');
      o.style.removeProperty('--fy');
    });
  }

  /* we listen in the capture phase and only observe: the native accordion
     still owns the `.open` class, we ride along with the same click */
  list.addEventListener('click', e=>{
    const q = e.target.closest('.faq-q');
    if(!q) return;
    const it = q.closest('.faq-item');
    const idx = items.indexOf(it);
    const willOpen = !it.classList.contains('open');
    /* the native handler runs after this capture listener: wait one tick */
    requestAnimationFrame(()=>{
      if(willOpen) focus(idx);
      else if(cur === idx) blur();
    });
  }, true);

  /* clicking the dimmer or pressing Esc returns the camera */
  dim.addEventListener('click', ()=>{
    const it = items[cur];
    if(!it) return;
    /* close through the real button so the native accordion stays in charge */
    it.querySelector('.faq-q').click();
    blur();
  });
  addEventListener('keydown', e=>{
    if(cur < 0) return;
    if(e.key === 'Escape'){
      e.preventDefault();
      const it = items[cur];
      it.querySelector('.faq-q').click();
      blur();
    }
    else if(e.key === 'ArrowDown' || e.key === 'ArrowUp'){
      e.preventDefault();
      const next = clamp(cur + (e.key === 'ArrowDown' ? 1 : -1), 0, items.length - 1);
      if(next === cur) return;
      items[cur].querySelector('.faq-q').click();   // close the current one
      items[next].querySelector('.faq-q').click();  // open the next one
      setTimeout(()=>focus(next), 30);
    }
  });

  /* the centred card is taller than its neighbour: re-aim the camera once the
     answer has finished growing (the accordion owns the max-height tween) */
  list.addEventListener('transitionend', e=>{
    if(cur < 0) return;
    if(!e.target.classList || !e.target.classList.contains('faq-a')) return;
    if(e.propertyName !== 'max-height') return;
    const it = items[cur];
    if(it && it.classList.contains('open')) place(it);
  });

  /* a scroll away from the list lets the camera go too, otherwise the card
     would hang in the middle of the page forever */
  addEventListener('scroll', ()=>{
    if(cur < 0) return;
    const r = list.getBoundingClientRect();
    if(r.bottom < innerHeight * .18 || r.top > innerHeight * .82){
      items[cur].querySelector('.faq-q').click();
      blur();
    }
  }, {passive:true});
})();
})();
