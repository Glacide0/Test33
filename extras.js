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
  let curSrv = null, prevSrv = null, swapT = 1, zoomT = 0;

  function size(){
    const r = box.getBoundingClientRect();
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
    const sc = r.width / 1000;              // sg viewBox -> css px
    const off = box.scrollLeft;             // mobile scrolls the map horizontally
    c.save(); c.translate(-off,0); c.scale(sc, sc);

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
   2. REVIEWS — one button opens a graph, not a slider.
   The landing cards stay on the page; the overlay builds a spiral GRAPH:
   every review is a node on a helix, nodes are tied by a live thread, and
   the camera walks the helix. Two ways to choose:
     · click any node in the graph  -> the camera flies to it
     · drag / wheel / arrows / swipe -> the camera glides along the thread
   Cards are redrawn by motion graphics as the camera moves: each node is
   projected, scaled and rotated from its 3D position, so the spiral turns
   under the camera. Close is a reverse: the camera pulls back out of the
   spiral, the graph unwinds into the button and only then the page returns.
   ===================================================================== */
(function(){
  const src = $$('#reviews .testi');
  const btn = $('.rv-open');
  if(!src.length || !btn) return;

  const DATA = src.map(el=>{
    const stars = el.querySelectorAll('.stars .ic.fill:not(.off)').length || 5;
    return {
      text: ((el.querySelector('p')||{}).textContent || '').trim(),
      who:  ((el.querySelector('.who b')||{}).textContent || '').trim(),
      meta: ((el.querySelector('.who small')||{}).textContent || '').trim(),
      init: ((el.querySelector('.avatar')||{}).textContent || '•').trim(),
      av:   ((el.querySelector('.avatar')||{}).className || '').replace('avatar','').trim(),
      stars: Math.max(1, Math.min(5, stars))
    };
  });

  /* ---------------- overlay skeleton ---------------- */
  const ov = document.createElement('div');
  ov.className = 'rvc';
  ov.setAttribute('role','dialog'); ov.setAttribute('aria-modal','true'); ov.setAttribute('aria-label','Все отзывы');
  ov.innerHTML =
    '<div class="rvc-bg"></div>'+
    '<canvas class="rvc-cv"></canvas>'+
    '<div class="rvc-stage"></div>'+
    '<div class="rvc-ui">'+
      '<div class="rvc-top">'+
        '<div class="rvc-ttl">XPN <i></i> отзывы <em>4,8 · 92 000 оценок</em></div>'+
        '<button class="rvc-btn rvc-close" type="button">Закрыть</button>'+
      '</div>'+
      '<div class="rvc-rail" aria-hidden="true"><i></i></div>'+
      '<div class="rvc-bot">'+
        '<button class="rvc-btn rvc-prev" type="button">Назад</button>'+
        '<div class="rvc-hint-mid"><span class="rvc-count"><b>01</b><i>/</i><span>12</span></span>'+
          '<small>выберите точку в графе или листайте</small></div>'+
        '<button class="rvc-btn rvc-next" type="button">Дальше</button>'+
      '</div>'+
    '</div>'+
    '<div class="rvc-ar" aria-hidden="true"><span></span></div>';
  document.body.appendChild(ov);

  const stage = ov.querySelector('.rvc-stage');
  const cvs = ov.querySelector('canvas'), cx = cvs.getContext('2d');
  const numB = ov.querySelector('.rvc-count b'), numS = ov.querySelector('.rvc-count span:last-child');
  const railI = ov.querySelector('.rvc-rail i');
  numS.textContent = String(DATA.length).padStart(2,'0');

  /* ---------------- nodes ---------------- */
  const cards = DATA.map((d,i)=>{
    const el = document.createElement('article');
    el.className = 'rvc-card';
    el.tabIndex = 0;
    el.setAttribute('role','button');
    el.setAttribute('aria-label','Отзыв ' + (i+1) + ' из ' + DATA.length + ': ' + d.who);
    const stars = Array.from({length:5}, (_,k)=>'<i class="'+(k < d.stars ? '' : 'off')+'"></i>').join('');
    el.innerHTML =
      '<span class="rvc-num">'+String(i+1).padStart(2,'0')+'</span>'+
      '<div class="rvc-stars">'+stars+'</div>'+
      '<p class="rvc-q">'+d.text.replace(/^«|»\.?$/g,'')+'</p>'+
      '<div class="rvc-who"><span class="avatar '+d.av+'">'+d.init+'</span>'+
      '<div><b>'+d.who+'</b><small>'+d.meta+'</small></div></div>';
    stage.appendChild(el);
    const pick = ()=>{ if(!open) return; if(Math.abs(target - i) < .001 && settled) return; go(i); };
    el.addEventListener('click', pick);
    el.addEventListener('keydown', e=>{ if(e.key==='Enter' || e.key===' '){ e.preventDefault(); pick(); } });
    return {el, i, d, x:0, y:0, z:0, a:0, depth:1, sc:1, hot:0};
  });

  let open = false, closing = false, raf = 0, last = 0, W = 0, H = 0, dpr = 1;
  let closeT = 0, introT = 0, settled = true;
  const cam = { p: 0, e: 0, v: 0, z: 1 };     // p = target position, e = eased, z = camera dolly
  let target = 0;
  const RINGS = 1.55, RISE = 210, RAD = 560;   // helix geometry

  function size(){
    W = innerWidth; H = innerHeight; dpr = Math.min(devicePixelRatio || 1, 1.75);
    cvs.width = Math.round(W*dpr); cvs.height = Math.round(H*dpr);
    cx.setTransform(dpr,0,0,dpr,0,0);
  }
  size();
  addEventListener('resize', ()=>{ if(open || closing){ size(); } }, {passive:true});

  /* ---------------- graph geometry ----------------
     Reviews sit on a spiral that recedes into depth: the chosen node is in
     front, its neighbours are one turn away on each side, smaller, turned
     and dimmed, and the rest are off the coil (hidden). Because positions
     come from one function, the canvas threads and the DOM cards can never
     disagree — the graph and the cards are the same object.            */
  function layout(i){
    const d = i - cam.e;
    const ad = Math.abs(d);
    const side = d < 0 ? -1 : 1;
    const ua = Math.min(ad, 3);
    // horizontal travel grows slower than the index: a coil, not a row
    const spread = Math.min(W * .34, 430);
    const x = side * Math.pow(ua, .82) * spread;
    // each further turn is pushed back and lifted a little
    const z = -ua * 190;
    const y = -ua * 26 + Math.sin(ua * 1.2) * 8;
    const scale = Math.max(0, 1 - ua * .26);
    const rotY = -side * Math.min(.62, ua * .30);
    const rotZ = side * Math.min(.05, ua * .02);
    const opacity = ua >= 2.98 ? 0 : clamp(1 - Math.pow(ua / 2.5, 2.4));
    return {d, ad, side, ua, x, y, z, scale, rotY, rotZ, opacity, depth: 1 - ua * .3};
  }

  function render(){
    const cxp = W / 2, cyp = H / 2;
    cx.clearRect(0, 0, W, H);
    cx.save();
    cx.translate(cxp, cyp);

    const pts = cards.map((c, i)=>{ const L = layout(i); return {i, L}; });

    // ---- threads: neighbours tied by a drawn curve as it leaves the coil ----
    cx.lineCap = 'round';
    for(let k = 0; k < pts.length - 1; k++){
      const a = pts[k], b = pts[k + 1];
      const o = Math.min(a.L.opacity, b.L.opacity);
      if(o <= .03) continue;
      const ax = a.L.x * .62, ay = a.L.y, bx = b.L.x * .62, by = b.L.y;
      cx.strokeStyle = 'rgba(169,183,169,' + (o * .42).toFixed(3) + ')';
      cx.lineWidth = .7 + o * 1.1;
      cx.beginPath(); cx.moveTo(ax, ay);
      const mx = (ax + bx) / 2, my = (ay + by) / 2 - 34 - o * 22;
      cx.quadraticCurveTo(mx, my, bx, by); cx.stroke();
      // a bead of data runs the thread, always in reading order
      const ph = ((introT * .16 + k * .11) % 1);
      const bx2 = (1-ph)*(1-ph)*ax + 2*(1-ph)*ph*mx + ph*ph*bx;
      const by2 = (1-ph)*(1-ph)*ay + 2*(1-ph)*ph*my + ph*ph*by;
      cx.fillStyle = 'rgba(214,232,210,' + (o * .8).toFixed(3) + ')';
      cx.beginPath(); cx.arc(bx2, by2, 1.6, 0, 6.283); cx.fill();
    }

    // ---- nodes on the coil ----
    pts.forEach(({i, L})=>{
      if(L.opacity <= .03) return;
      const px = L.x * .62, py = L.y;
      const cur = L.ua < .5;
      const rr = cur ? 5.6 : 3.2;
      cx.fillStyle = 'rgba(214,232,210,' + (L.opacity * .95).toFixed(3) + ')';
      cx.beginPath(); cx.arc(px, py, rr, 0, 6.283); cx.fill();
      cx.strokeStyle = 'rgba(169,183,169,' + (L.opacity * (cur ? .45 : .2)).toFixed(3) + ')';
      cx.lineWidth = 1;
      cx.beginPath(); cx.arc(px, py, cur ? 12 : 8, 0, 6.283); cx.stroke();
      if(cur){
        const ph = (introT * .55) % 1;
        cx.strokeStyle = 'rgba(193,180,156,' + ((1 - ph) * .75).toFixed(3) + ')';
        cx.lineWidth = 1.2;
        cx.beginPath(); cx.arc(px, py, 13 + ph * 30, 0, 6.283); cx.stroke();
      }
    });

    // ---- the axis: the spine of the coil, with a tick per review ----
    const spine = pts.filter(p=>p.L.opacity > .05);
    if(spine.length > 1){
      cx.strokeStyle = 'rgba(169,183,169,.13)'; cx.lineWidth = 1;
      cx.beginPath();
      let first = true;
      spine.forEach(({L})=>{ const x = L.x * .62, y = L.y;
        if(first){ cx.moveTo(x, y - 54); first = false; } else cx.lineTo(x, y - 54); });
      cx.stroke();
    }
    cx.restore();

    // ---- DOM cards ride the very same projection ----
    cards.forEach((c, i)=>{
      const L = layout(i);
      const front = L.ua < .5;
      c.el.style.transform =
        'translate3d(' + (cxp + L.x).toFixed(1) + 'px,' + (cyp + L.y).toFixed(1) + 'px,0) ' +
        'translate(-50%,-50%) perspective(1400px) translateZ(' + (L.z).toFixed(0) + 'px) ' +
        'scale(' + (L.scale * cam.z).toFixed(4) + ') rotateY(' + L.rotY.toFixed(3) + 'rad) rotateZ(' + L.rotZ.toFixed(3) + 'rad)';
      c.el.style.opacity = (L.opacity * (closing ? 1 : 1)).toFixed(3);
      c.el.style.zIndex = String(100 - Math.round(L.ua * 10));
      c.el.style.pointerEvents = L.opacity > .55 ? 'auto' : 'none';
      c.el.classList.toggle('is-front', front);
      c.x = cxp + L.x; c.y = cyp + L.y; c.depth = L.opacity;
    });

    // rail + counter
    railI.style.transform = 'scaleY(' + (1 / DATA.length).toFixed(4) + ')';
    railI.style.top = (clamp(cam.e / Math.max(1, DATA.length - 1), 0, 1) * 100).toFixed(2) + '%';
    const nn = Math.round(clamp(cam.e, 0, DATA.length - 1));
    numB.textContent = String(nn + 1).padStart(2, '0');
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
    const sc = r.width / 1000;              // sg viewBox -> css px
    const off = box.scrollLeft;             // mobile scrolls the map horizontally
    c.save(); c.translate(-off,0); c.scale(sc, sc);

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
   2. REVIEWS — one button opens a graph, not a slider.
   The landing cards stay on the page; the overlay builds a spiral GRAPH:
   every review is a node on a helix, nodes are tied by a live thread, and
   the camera walks the helix. Two ways to choose:
     · click any node in the graph  -> the camera flies to it
     · drag / wheel / arrows / swipe -> the camera glides along the thread
   Cards are redrawn by motion graphics as the camera moves: each node is
   projected, scaled and rotated from its 3D position, so the spiral turns
   under the camera. Close is a reverse: the camera pulls back out of the
   spiral, the graph unwinds into the button and only then the page returns.
   ===================================================================== */
(function(){
  const src = $$('#reviews .testi');
  const btn = $('.rv-open');
  if(!src.length || !btn) return;

  const DATA = src.map(el=>{
    const stars = el.querySelectorAll('.stars .ic.fill:not(.off)').length || 5;
    return {
      text: ((el.querySelector('p')||{}).textContent || '').trim(),
      who:  ((el.querySelector('.who b')||{}).textContent || '').trim(),
      meta: ((el.querySelector('.who small')||{}).textContent || '').trim(),
      init: ((el.querySelector('.avatar')||{}).textContent || '•').trim(),
      av:   ((el.querySelector('.avatar')||{}).className || '').replace('avatar','').trim(),
      stars: Math.max(1, Math.min(5, stars))
    };
  });

  /* ---------------- overlay skeleton ---------------- */
  const ov = document.createElement('div');
  ov.className = 'rvc';
  ov.setAttribute('role','dialog'); ov.setAttribute('aria-modal','true'); ov.setAttribute('aria-label','Все отзывы');
  ov.innerHTML =
    '<div class="rvc-bg"></div>'+
    '<canvas class="rvc-cv"></canvas>'+
    '<div class="rvc-stage"></div>'+
    '<div class="rvc-ui">'+
      '<div class="rvc-top">'+
        '<div class="rvc-ttl">XPN <i></i> отзывы <em>4,8 · 92 000 оценок</em></div>'+
        '<button class="rvc-btn rvc-close" type="button">Закрыть</button>'+
      '</div>'+
      '<div class="rvc-rail" aria-hidden="true"><i></i></div>'+
      '<div class="rvc-bot">'+
        '<button class="rvc-btn rvc-prev" type="button">Назад</button>'+
        '<div class="rvc-hint-mid"><span class="rvc-count"><b>01</b><i>/</i><span>12</span></span>'+
          '<small>выберите точку в графе или листайте</small></div>'+
        '<button class="rvc-btn rvc-next" type="button">Дальше</button>'+
      '</div>'+
    '</div>'+
    '<div class="rvc-ar" aria-hidden="true"><span></span></div>';
  document.body.appendChild(ov);

  const stage = ov.querySelector('.rvc-stage');
  const cvs = ov.querySelector('canvas'), cx = cvs.getContext('2d');
  const numB = ov.querySelector('.rvc-count b'), numS = ov.querySelector('.rvc-count span:last-child');
  const railI = ov.querySelector('.rvc-rail i');
  numS.textContent = String(DATA.length).padStart(2,'0');

  /* ---------------- nodes ---------------- */
  const cards = DATA.map((d,i)=>{
    const el = document.createElement('article');
    el.className = 'rvc-card';
    el.tabIndex = 0;
    el.setAttribute('role','button');
    el.setAttribute('aria-label','Отзыв ' + (i+1) + ' из ' + DATA.length + ': ' + d.who);
    const stars = Array.from({length:5}, (_,k)=>'<i class="'+(k < d.stars ? '' : 'off')+'"></i>').join('');
    el.innerHTML =
      '<span class="rvc-num">'+String(i+1).padStart(2,'0')+'</span>'+
      '<div class="rvc-stars">'+stars+'</div>'+
      '<p class="rvc-q">'+d.text.replace(/^«|»\.?$/g,'')+'</p>'+
      '<div class="rvc-who"><span class="avatar '+d.av+'">'+d.init+'</span>'+
      '<div><b>'+d.who+'</b><small>'+d.meta+'</small></div></div>';
    stage.appendChild(el);
    const pick = ()=>{ if(!open) return; if(Math.abs(target - i) < .001 && settled) return; go(i); };
    el.addEventListener('click', pick);
    el.addEventListener('keydown', e=>{ if(e.key==='Enter' || e.key===' '){ e.preventDefault(); pick(); } });
    return {el, i, d, x:0, y:0, z:0, a:0, depth:1, sc:1, hot:0};
  });

  let open = false, closing = false, raf = 0, last = 0, W = 0, H = 0, dpr = 1;
  let closeT = 0, introT = 0, settled = true;
  const cam = { p: 0, e: 0, v: 0, z: 1 };     // p = target position, e = eased, z = camera dolly
  let target = 0;
  const RINGS = 1.55, RISE = 210, RAD = 560;   // helix geometry

  function size(){
    W = innerWidth; H = innerHeight; dpr = Math.min(devicePixelRatio || 1, 1.75);
    cvs.width = Math.round(W*dpr); cvs.height = Math.round(H*dpr);
    cx.setTransform(dpr,0,0,dpr,0,0);
  }
  size();
  addEventListener('resize', ()=>{ if(open || closing){ size(); } }, {passive:true});

  /* ---------------- helix geometry ----------------
     index -> a point on a helix. The camera sits INSIDE the helix looking
     along it, so the previous and next reviews appear left/right and
     slightly above/below: a graph you can walk through, not a row.      */
  function node(i){
    const d = i - cam.e;
    const a = d * RINGS;                        // radians around the axis
    const r = RAD * (1 + Math.min(1.6, Math.abs(d) * .06));
    const x = Math.sin(a) * r;
    const z = Math.cos(a) * r;                  // depth along the camera axis
    const y = -d * 26;                          // a very shallow rise
    return {d, a, x, y, z};
  }

  function render(){
    const PERS = 1250;
    const railY = H * .5;
    // ---------- canvas: the graph ----------
    cx.clearRect(0, 0, W, H);
    cx.save();
    cx.translate(W/2, H/2);

    const pts = cards.map((c,i)=>{
      const n = node(i);
      const s = PERS / (PERS + (RAD - n.z));    // nearer -> bigger
      return {i, n, s, px: n.x * s * cam.z, py: n.y * s * cam.z, depth: (n.z + RAD) / (2*RAD)};
    });

    // threads: neighbours tied by a drawn curve, brighter near the camera
    cx.lineCap = 'round';
    for(let k = 0; k < pts.length - 1; k++){
      const a = pts[k], b = pts[k+1];
      const o = Math.max(0, Math.min(1, (a.depth + b.depth) * .5));
      if(o <= .02) continue;
      cx.strokeStyle = 'rgba(169,183,169,' + (o*.5).toFixed(3) + ')';
      cx.lineWidth = .7 + o * .9;
      cx.beginPath(); cx.moveTo(a.px, a.py);
      const mx = (a.px + b.px) / 2, my = (a.py + b.py) / 2 - 26 - o*26;
      cx.quadraticCurveTo(mx, my, b.px, b.py); cx.stroke();
      // a data bead travelling along the thread, in order
      const ph = ((introT * .18 + k * .09) % 1);
      const bx = (1-ph)*(1-ph)*a.px + 2*(1-ph)*ph*mx + ph*ph*b.px;
      const by = (1-ph)*(1-ph)*a.py + 2*(1-ph)*ph*my + ph*ph*b.py;
      cx.fillStyle = 'rgba(214,232,210,' + (o*.75).toFixed(3) + ')';
      cx.beginPath(); cx.arc(bx, by, 1.5 + o*1.2, 0, 6.283); cx.fill();
    }

    // nodes: a halo on every review, an active ring on the chosen one
    pts.forEach(p=>{
      const cur = Math.abs(p.n.d) < .5;
      const o = Math.max(0, Math.min(1, p.depth));
      if(o <= .02) return;
      const rr = cur ? 6.5 : 3.4;
      cx.fillStyle = 'rgba(214,232,210,' + (o*.9).toFixed(3) + ')';
      cx.beginPath(); cx.arc(p.px, p.py, rr, 0, 6.283); cx.fill();
      if(cur){
        const ph = (introT*.7) % 1;
        cx.strokeStyle = 'rgba(193,180,156,' + ((1-ph)*.8).toFixed(3) + ')';
        cx.lineWidth = 1.2;
        cx.beginPath(); cx.arc(p.px, p.py, 9 + ph*26, 0, 6.283); cx.stroke();
        cx.strokeStyle = 'rgba(193,180,156,.5)'; cx.lineWidth = 1;
        cx.beginPath(); cx.arc(p.px, p.py, 11, 0, 6.283); cx.stroke();
      } else {
        cx.strokeStyle = 'rgba(169,183,169,' + (o*.18).toFixed(3) + ')';
        cx.lineWidth = 1;
        cx.beginPath(); cx.arc(p.px, p.py, 8, 0, 6.283); cx.stroke();
      }
    });

    // the axis: a single hairline through the graph, ticked per review
    const nearP = pts.find(p=>Math.abs(p.n.d) < .5) || pts[0];
    if(nearP){
      cx.strokeStyle = 'rgba(169,183,169,.14)'; cx.lineWidth = 1;
      cx.beginPath(); cx.moveTo(nearP.px, nearP.py + 40); cx.lineTo(nearP.px, railY - H/2 - 34); cx.stroke();
    }
    cx.restore();

    // ---------- DOM cards follow the same projection ----------
    cards.forEach((c,i)=>{
      const p = pts[i], n = p.n;
      const depthA = Math.max(0, Math.min(1, (p.depth - .18) / .7));
      const scale = (0.62 + p.s * 0.62) * (0.72 + .28 * depthA) * cam.z;
      const front = Math.abs(n.d) < .5;
      const rotY = -n.a * .42;
      const rotZ = n.a * .06;
      c.el.style.transform =
        'translate3d(' + (W/2 + p.px).toFixed(1) + 'px,' + (H/2 + p.py).toFixed(1) + 'px,0) '+
        'translate(-50%,-50%) perspective(1200px) scale(' + scale.toFixed(4) + ') '+
        'rotateY(' + rotY.toFixed(3) + 'rad) rotateZ(' + rotZ.toFixed(3) + 'rad)';
      c.el.style.opacity = depthA.toFixed(3);
      c.el.style.zIndex = String(Math.round(p.depth * 100));
      c.el.style.pointerEvents = depthA > .35 ? 'auto' : 'none';
      c.el.classList.toggle('is-front', front);
      c.x = W/2 + p.px; c.y = H/2 + p.py; c.depth = p.depth;
    });

    // rail + counter
    railI.style.transform = 'scaleY(' + (1 / DATA.length).toFixed(4) + ')';
    railI.style.top = (clamp((cam.e) / Math.max(1, DATA.length - 1)) * 100).toFixed(2) + '%';
    const nn = Math.round(clamp(cam.e, 0, DATA.length - 1));
    numB.textContent = String(nn + 1).padStart(2,'0');
  }

  function frame(now){
    raf = (open || closing) ? requestAnimationFrame(frame) : 0;
    const dt = Math.min(.05, (now - last) / 1000); last = now;
    introT += dt;
    const k = 1 - Math.exp(-dt * (reduce ? 40 : 5.4));
    cam.e += (target - cam.e) * k;
    cam.v = (target - cam.e);
    settled = Math.abs(target - cam.e) < .006;

    if(closing){
      const u = clamp((now - closeT) / 820);
      // reverse: the whole spiral unwinds — the camera pulls back out,
      // the cards turn away and the graph closes onto the button
      cam.e += (DATA.length * .5 - cam.e) * (1 - Math.exp(-dt * 3.4));
      cam.z = 1 - eIO(u) * .42;
      ov.style.setProperty('--o', (1 - u).toFixed(3));
      ov.style.opacity = (1 - u * .96).toFixed(3);
      ov.querySelector('.rvc-ar').style.transform = 'scale(' + (1 - u * 1.4).toFixed(3) + ')';
      if(u >= 1){ finish(); return; }
    }
    render();
  }

  function go(i){
    target = clamp(i, 0, DATA.length - 1);
    if(!raf){ last = performance.now(); raf = requestAnimationFrame(frame); }
  }
  function step(dir){ go(Math.round(target) + dir); }

  function openFilm(){
    if(open) return;
    open = true; closing = false; introT = 0;
    ov.classList.add('live'); document.body.classList.add('rvc-open');
    size();
    target = 0; cam.e = -2.4; cam.z = .78;
    ov.style.opacity = ''; ov.style.setProperty('--o', 1);
    ov.querySelector('.rvc-ar').style.transform = '';
    const r = btn.getBoundingClientRect();
    ov.style.setProperty('--bx', (r.left + r.width/2) + 'px');
    ov.style.setProperty('--by', (r.top + r.height/2) + 'px');
    last = performance.now();
    if(!raf) raf = requestAnimationFrame(frame);
    requestAnimationFrame(()=>{
      setTimeout(()=>{ ov.classList.add('shown'); go(0); }, 20);
    });
    setTimeout(()=>ov.querySelector('.rvc-close').focus({preventScroll:true}), 80);
  }
  function closeFilm(){
    if(!open || closing) return;
    closing = true; open = false; closeT = performance.now();
    if(!raf){ last = performance.now(); raf = requestAnimationFrame(frame); }
  }
  function finish(){
    closing = false;
    ov.classList.remove('live','shown');
    document.body.classList.remove('rvc-open');
    ov.style.opacity = ''; ov.style.removeProperty('--o');
    cx.clearRect(0,0,W,H);
    if(raf){ cancelAnimationFrame(raf); raf = 0; }
    btn.focus({preventScroll:true});
  }

  btn.addEventListener('click', openFilm);
  ov.querySelector('.rvc-close').addEventListener('click', closeFilm);
  ov.querySelector('.rvc-next').addEventListener('click', ()=>step(1));
  ov.querySelector('.rvc-prev').addEventListener('click', ()=>step(-1));

  addEventListener('keydown', e=>{
    if(!open) return;
    if(e.key === 'Escape'){ e.preventDefault(); closeFilm(); }
    else if(e.key === 'ArrowRight'){ e.preventDefault(); step(1); }
    else if(e.key === 'ArrowLeft'){ e.preventDefault(); step(-1); }
    else if(e.key === 'Home'){ e.preventDefault(); go(0); }
    else if(e.key === 'End'){ e.preventDefault(); go(DATA.length - 1); }
  });

  /* wheel scrubs the spiral, with a short lock so a trackpad does not fly */
  let wheelLock = 0;
  ov.addEventListener('wheel', e=>{
    if(!open) return;
    e.preventDefault();
    const now = performance.now();
    if(now - wheelLock < 230) return; wheelLock = now;
    if(Math.abs(e.deltaY) < 6) return;
    step(e.deltaY > 0 ? 1 : -1);
  }, {passive:false});

  /* drag the graph itself */
  let drag = null;
  ov.addEventListener('pointerdown', e=>{
    if(!open || e.target.closest('button, .rvc-card')) return;
    drag = {x:e.clientX, y:e.clientY, moved:0};
  });
  ov.addEventListener('pointermove', e=>{
    if(!drag) return;
    const dx = e.clientX - drag.x;
    drag.moved += Math.abs(dx);
    if(Math.abs(dx) > 70){ drag.x = e.clientX; step(dx < 0 ? 1 : -1); }
  }, {passive:true});
  ov.addEventListener('pointerup', ()=>{ drag = null; }, {passive:true});
  ov.addEventListener('pointercancel', ()=>{ drag = null; }, {passive:true});

  /* touch: swipe between stories */
  let tx = 0, ty = 0;
  ov.addEventListener('touchstart', e=>{ const t = e.touches[0]; tx = t.clientX; ty = t.clientY; }, {passive:true});
  ov.addEventListener('touchend', e=>{
    if(!open) return;
    const t = e.changedTouches[0], dx = t.clientX - tx, dy = t.clientY - ty;
    if(Math.abs(dx) > 44 && Math.abs(dx) > Math.abs(dy)) step(dx < 0 ? 1 : -1);
  }, {passive:true});

  /* click on empty space: the nearest node comes forward */
  ov.querySelector('.rvc-cv').addEventListener('click', e=>{
    if(!open) return;
    let best = -1, bd = 1e9;
    cards.forEach(c=>{ const d = Math.hypot(c.x - e.clientX, c.y - e.clientY); if(d < bd){ bd = d; best = c.i; } });
    if(best >= 0 && bd < 260) go(best);
  });
})();

/* =====================================================================
   3. FAQ — the question comes forward, the answer is written in
   ===================================================================== */
(function(){
  const list = $('#faqList');
  if(!list) return;
  const items = [...list.querySelectorAll('.faq-item')];
  items.forEach((it, i)=>{
    const q = it.querySelector('.faq-q'), a = it.querySelector('.faq-a');
    if(!q || !a) return;
    const inner = a.firstElementChild || a;
    // split the answer into lines of motion: each sentence rides in on its own beat
    if(!inner.dataset.split){
      inner.dataset.split = '1';
      const parts = inner.innerHTML.split(/(?<=[.!?])\s+/);
      inner.innerHTML = parts.map((p,k)=>'<span class="fa-l" style="--d:'+(k*70)+'ms"><span>'+p+'</span></span>').join(' ');
    }
  });
  // a single delegated handler: the native accordion keeps working, we only add motion
  let cur = -1;
  list.addEventListener('click', e=>{
    const q = e.target.closest('.faq-q');
    if(!q) return;
    const it = q.closest('.faq-item');
    const idx = items.indexOf(it);
    const willOpen = !it.classList.contains('open');
    // camera-ish focus: everything else recedes slightly
    list.classList.toggle('faq-focus', willOpen);
    items.forEach((o,k)=>{
      o.classList.toggle('faq-far', willOpen && k !== idx);
      o.classList.toggle('faq-near', willOpen && k === idx);
    });
    if(willOpen){ cur = idx; it.style.setProperty('--d', '0ms'); }
    else if(cur === idx){ cur = -1; list.classList.remove('faq-focus'); }
  }, true);
})();
})();
