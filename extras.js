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
      init: (av ? av.textContent : '•').trim(),
      av:   (av ? av.className : '').replace('avatar', '').trim(),
      stars: Math.max(1, Math.min(5, stars))
    };
  });

  /* ---------------- overlay ---------------- */
  const ov = document.createElement('div');
  ov.className = 'rvc';
  ov.setAttribute('role', 'dialog');
  ov.setAttribute('aria-modal', 'true');
  ov.setAttribute('aria-label', 'Все отзывы');
  ov.innerHTML =
    '<div class="rvc-bg"></div>' +
    '<canvas class="rvc-cv"></canvas>' +
    '<div class="rvc-stage"></div>' +
    '<div class="rvc-ar" aria-hidden="true"></div>' +
    '<div class="rvc-ui">' +
      '<div class="rvc-top">' +
        '<div class="rvc-ttl">XPN <i></i> отзывы <em>4,8 · 92 000 оценок</em></div>' +
        '<button class="rvc-btn rvc-close" type="button">Закрыть</button>' +
      '</div>' +
      '<div class="rvc-rail" aria-hidden="true"><i></i></div>' +
      '<div class="rvc-bot">' +
        '<button class="rvc-btn rvc-prev" type="button">Назад</button>' +
        '<div class="rvc-hint-mid">' +
          '<span class="rvc-count"><b>01</b><i>/</i><span>' + DATA.length + '</span></span>' +
          '<small>выберите точку в графе или листайте</small>' +
        '</div>' +
        '<button class="rvc-btn rvc-next" type="button">Дальше</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(ov);

  const stage = ov.querySelector('.rvc-stage');
  const cvs = ov.querySelector('.rvc-cv'), cx = cvs.getContext('2d');
  const numB = ov.querySelector('.rvc-count b');
  const railI = ov.querySelector('.rvc-rail i');
  const halo = ov.querySelector('.rvc-ar');
  const N = DATA.length;

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
    stage.appendChild(el);
    el.addEventListener('click', ()=>{ if(live) go(i); });
    el.addEventListener('keydown', e=>{
      if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); if(live) go(i); }
    });
    prime({el});
    return {el, i};
  });

  /* ---------------- state ---------------- */
  let live = false, closing = false, raf = 0, last = 0, W = 0, H = 0, dpr = 1;
  let t = 0, closeAt = 0, target = 0, num = -1, idle = 0;
  const cam = {e: -2.2, z: .8};
  const SPREAD = () => Math.min(W * .33, 420);

  /* every card writes its style every frame, so the invariant parts are set
     once and the frame only touches transform / opacity / z-index */
  function prime(c){
    c.el.style.pointerEvents = '';
    c.el.style.willChange = 'transform,opacity';
    c.el.style.backfaceVisibility = 'hidden';
  }

  function size(){
    W = innerWidth; H = innerHeight; dpr = Math.min(devicePixelRatio || 1, 1.75);
    cvs.width = Math.round(W * dpr); cvs.height = Math.round(H * dpr);
    cx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /* one projection for both the canvas graph and the DOM cards.
     Cards tile outward and shrink in a fixed rhythm, so the coil reads as a
     graph that keeps going instead of a row of cards: neighbour at 1.0,
     next at 1.68, next at 2.28 of the base step, each smaller and dimmer. */
  function layout(i){
    const d = i - cam.e, ad = Math.abs(d), side = d < 0 ? -1 : 1;
    const ua = Math.min(ad, 3);
    const base = Math.min(W * .25, 360);
    return {
      d, ad, ua, side,
      x: side * Math.pow(ua, .75) * base,
      y: -ua * 16 + Math.sin(ua * 1.1) * 6,
      z: -ua * 110,
      scale: 1 / (1 + ua * .42),
      rotY: -side * Math.min(.62, ua * .34),
      rotZ: side * Math.min(.045, ua * .018),
      op: ua >= 2.98 ? 0 : clamp(1 - Math.pow(ua / 2.6, 2.6))
    };
  }

  function render(){
    const ox = W / 2, oy = H / 2;
    cx.clearRect(0, 0, W, H);
    cx.save();
    cx.translate(ox, oy);

    const pts = cards.map((c, i)=>({i, L: layout(i)}));

    /* threads between neighbours: a curve that leaves the coil */
    cx.lineCap = 'round';
    for(let k = 0; k < pts.length - 1; k++){
      const a = pts[k].L, b = pts[k + 1].L;
      const o = Math.min(a.op, b.op);
      if(o <= .03) continue;
      const ax = a.x * .92, ay = a.y + 96, bx = b.x * .92, by = b.y + 96;
      cx.strokeStyle = 'rgba(169,183,169,' + (o * .38).toFixed(3) + ')';
      cx.lineWidth = .7 + o * 1.1;
      cx.beginPath();
      cx.moveTo(ax, ay);
      const mx = (ax + bx) / 2, my = (ay + by) / 2 - 40 - o * 18;
      cx.quadraticCurveTo(mx, my, bx, by);
      cx.stroke();
      /* a bead of data runs the thread, always in reading order */
      const ph = ((t * .16 + k * .11) % 1), u = 1 - ph;
      const bx2 = u * u * ax + 2 * u * ph * mx + ph * ph * bx;
      const by2 = u * u * ay + 2 * u * ph * my + ph * ph * by;
      cx.fillStyle = 'rgba(214,232,210,' + (o * .8).toFixed(3) + ')';
      cx.beginPath(); cx.arc(bx2, by2, 1.6, 0, 6.283); cx.fill();
    }

    /* nodes: a dot per review, an active ring on the chosen one */
    pts.forEach(({L})=>{
      if(L.op <= .03) return;
      const px = L.x * .92, py = L.y + 96, cur = L.ua < .5;
      cx.fillStyle = 'rgba(214,232,210,' + (L.op * .95).toFixed(3) + ')';
      cx.beginPath(); cx.arc(px, py, cur ? 5.6 : 3.2, 0, 6.283); cx.fill();
      cx.strokeStyle = 'rgba(169,183,169,' + (L.op * (cur ? .45 : .2)).toFixed(3) + ')';
      cx.lineWidth = 1;
      cx.beginPath(); cx.arc(px, py, cur ? 12 : 8, 0, 6.283); cx.stroke();
      if(cur){
        const ph = (t * .55) % 1;
        cx.strokeStyle = 'rgba(193,180,156,' + ((1 - ph) * .75).toFixed(3) + ')';
        cx.lineWidth = 1.2;
        cx.beginPath(); cx.arc(px, py, 13 + ph * 30, 0, 6.283); cx.stroke();
      }
    });

    /* the spine of the coil, ticked once per review */
    const spine = pts.filter(p=>p.L.op > .05);
    if(spine.length > 1){
      cx.strokeStyle = 'rgba(169,183,169,.13)';
      cx.lineWidth = 1;
      cx.beginPath();
      spine.forEach(({L}, k)=>{
        const x = L.x * .92, y = L.y + 140;
        k ? cx.lineTo(x, y) : cx.moveTo(x, y);
      });
      cx.stroke();
    }
    cx.restore();

    /* DOM cards ride the same projection */
    cards.forEach((c, i)=>{
      const L = layout(i);
      const near = L.ua < .5;
      /* a card that is fully away costs nothing: we skip it entirely and only
         wake it up when it becomes visible again */
      if(L.op <= .02){
        if(c.vis !== false){ c.el.style.opacity = '0'; c.el.style.pointerEvents = 'none'; c.vis = false; }
        return;
      }
      if(c.vis === false){ c.el.style.pointerEvents = L.op > .55 ? 'auto' : 'none'; c.vis = true; }
      c.el.style.transform =
        'translate3d(' + (ox + L.x).toFixed(1) + 'px,' + (oy + L.y).toFixed(1) + 'px,0) ' +
        'translate(-50%,-50%) perspective(1400px) translateZ(' + L.z.toFixed(0) + 'px) ' +
        'scale(' + (L.scale * cam.z).toFixed(4) + ') ' +
        'rotateY(' + L.rotY.toFixed(3) + 'rad) rotateZ(' + L.rotZ.toFixed(3) + 'rad)';
      c.el.style.opacity = L.op.toFixed(3);
      c.el.style.zIndex = String(100 - Math.round(L.ua * 10));
      if(near !== c.front){ c.front = near; c.el.classList.toggle('is-front', near); }
      c.x = ox + L.x; c.y = oy + L.y;
    });

    /* rail + counter */
    if(!railI.dataset.once){ railI.style.transform = 'scaleY(' + (1 / N).toFixed(4) + ')'; railI.dataset.once = '1'; }
    railI.style.top = (clamp(cam.e / Math.max(1, N - 1), 0, 1) * 100).toFixed(2) + '%';
    /* text nodes are expensive: repaint the counter only when the number moves */
    const nn = Math.round(clamp(cam.e, 0, N - 1));
    if(nn !== num){ num = nn; numB.textContent = String(nn + 1).padStart(2, '0'); }
    /* the halo breathes with the camera, brighter when the coil moves */
    const mv = Math.min(1, Math.abs(target - cam.e) * 2.2);
    halo.style.opacity = (.55 + mv * .45).toFixed(2);
    halo.style.transform = 'scale(' + (1 + mv * .16).toFixed(3) + ')';
  }

  function frame(now){
    const dt = Math.min(.05, (now - last) / 1000);
    last = now;
    t += dt;
    const k = 1 - Math.exp(-dt * (reduce ? 40 : 5.2));
    cam.e += (target - cam.e) * k;
    /* an exponential ease never quite lands (always ~0.1% left), which keeps
       the throttle below from ever engaging — so settle it explicitly */
    if(!closing && Math.abs(target - cam.e) < .0025) cam.e = target;
    /* when the camera has arrived the coil keeps a slow idle breath, but it
       does not need a full repaint every frame: one frame in four is enough */
    const still = !closing && cam.e === target;
    raf = (live || closing) ? requestAnimationFrame(frame) : 0;
    if(still && (++idle % 4)) return;

    if(closing){
      /* the reverse: the whole graph folds back into the button it came from,
         cards and threads together, so nothing is cut and nothing lingers */
      const u = clamp((now - closeAt) / 820);
      const q = eIO(u);
      const sc = 1 - q * .9;
      const tr = 'scale(' + sc.toFixed(4) + ')';
      stage.style.transform = tr;
      cvs.style.transform = tr;
      halo.style.transform = 'scale(' + (1 - q * 1.6).toFixed(3) + ')';
      ov.style.opacity = (1 - q * q).toFixed(3);
      if(u >= 1){ finish(); return; }
    }
    render();
  }

  /* the entry button folds the graph in; it must fold out before a reopen */
  function unfoldBtn(){
    btn.style.transition = 'transform .42s cubic-bezier(.16,.84,.28,1)';
    btn.style.transform = '';
  }

  function go(i){
    target = clamp(i, 0, N - 1);
    if(!raf){ last = performance.now(); raf = requestAnimationFrame(frame); }
  }
  function step(dir){ go(Math.round(target) + dir); }

  function openFilm(){
    if(live) return;
    live = true; closing = false; t = 0;
    size();
    target = 0; cam.e = -2.2; cam.z = .8;
    ov.style.opacity = '';
    btn.style.transform = '';
    ov.classList.add('live');
    document.body.classList.add('rvc-open');
    const r = btn.getBoundingClientRect();
    stage.style.transformOrigin = (r.left + r.width/2) + 'px ' + (r.top + r.height/2) + 'px';
    cvs.style.transformOrigin = stage.style.transformOrigin;
    last = performance.now();
    if(!raf) raf = requestAnimationFrame(frame);
    requestAnimationFrame(()=>{ setTimeout(()=>ov.classList.add('shown'), 20); });
    setTimeout(()=>{ const c = ov.querySelector('.rvc-close'); if(c) c.focus({preventScroll:true}); }, 90);
  }
  function closeFilm(){
    if(!live || closing) return;
    closing = true; live = false; closeAt = performance.now();
    ov.classList.remove('shown');
    if(!raf){ last = performance.now(); raf = requestAnimationFrame(frame); }
  }
  function finish(){
    closing = false;
    ov.classList.remove('live', 'shown');
    document.body.classList.remove('rvc-open');
    ov.style.opacity = '';
    stage.style.transform = ''; cvs.style.transform = '';
    cx.clearRect(0, 0, W, H);
    if(raf){ cancelAnimationFrame(raf); raf = 0; }
    unfoldBtn();
    btn.focus({preventScroll:true});
  }

  btn.addEventListener('click', ()=>{
    /* the button is the origin of the fold: it dips as the graph leaves it */
    if(!live){
      btn.style.transition = 'transform .5s cubic-bezier(.16,.84,.28,1),opacity .5s';
      btn.style.transform = 'scale(.94)';
      setTimeout(()=>{ if(!live) btn.style.transform = ''; }, 420);
    }
    openFilm();
  });
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

  /* wheel scrubs the coil */
  let lock = 0;
  ov.addEventListener('wheel', e=>{
    if(!live) return;
    e.preventDefault();
    const now = performance.now();
    if(now - lock < 220) return;
    lock = now;
    if(Math.abs(e.deltaY) < 6) return;
    step(e.deltaY > 0 ? 1 : -1);
  }, {passive:false});

  /* drag the graph */
  let drag = null;
  ov.addEventListener('pointerdown', e=>{
    if(!live || e.target.closest('button, .rvc-card')) return;
    drag = {x: e.clientX};
  });
  ov.addEventListener('pointermove', e=>{
    if(!drag) return;
    const dx = e.clientX - drag.x;
    if(Math.abs(dx) > 70){ drag.x = e.clientX; step(dx < 0 ? 1 : -1); }
  }, {passive:true});
  ov.addEventListener('pointerup', ()=>{ drag = null; }, {passive:true});
  ov.addEventListener('pointercancel', ()=>{ drag = null; }, {passive:true});

  /* swipe */
  let tx = 0, ty = 0;
  ov.addEventListener('touchstart', e=>{ const p = e.touches[0]; tx = p.clientX; ty = p.clientY; }, {passive:true});
  ov.addEventListener('touchend', e=>{
    if(!live) return;
    const p = e.changedTouches[0];
    const dx = p.clientX - tx, dy = p.clientY - ty;
    if(Math.abs(dx) > 44 && Math.abs(dx) > Math.abs(dy)) step(dx < 0 ? 1 : -1);
  }, {passive:true});

  /* a click near a node pulls it forward */
  cvs.addEventListener('click', e=>{
    if(!live) return;
    let best = -1, bd = 1e9;
    cards.forEach(c=>{
      const d = Math.hypot(c.x - e.clientX, c.y - e.clientY);
      if(d < bd){ bd = d; best = c.i; }
    });
    if(best >= 0 && bd < 300) go(best);
  });

  /* resize while open */
  addEventListener('resize', ()=>{ if(live || closing) size(); }, {passive:true});
  window.__RVC = {go, close:closeFilm, open:openFilm, st:()=>({live, closing, e:+cam.e.toFixed(2), target})};
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
