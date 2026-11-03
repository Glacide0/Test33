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
   1. SERVERS — the map becomes a live instrument
   ===================================================================== */
(function(){
  const box = $('#mapBox'), svg = $('#mapSvg');
  if(!box || !svg || !window.XPN_MAP) return;
  const cv = document.createElement('canvas');
  cv.className = 'map-fx';
  box.appendChild(cv);
  const c = cv.getContext('2d');
  let W = 0, H = 0, dpr = 1, vis = false, raf = 0, last = 0, tt = 0, t0 = performance.now();

  function size(){
    const r = box.getBoundingClientRect();
    W = r.width; H = r.height;
    dpr = Math.min(devicePixelRatio || 1, 1.6);
    cv.width = Math.round(W*dpr); cv.height = Math.round(H*dpr);
    c.setTransform(dpr,0,0,dpr,0,0);
  }
  const api = window.XPN_MAP;   // {X, Y, cur:()=>server, me:{lat,lon}, minLen}
  function P(lat, lon){ return [api.X(lon), api.Y(lat)]; }

  function path(){
    const cur = api.current();
    if(!cur) return null;
    return {a: P(api.me.lat, api.me.lon), b: P(cur.lat, cur.lon), cur};
  }
  function frame(now){
    raf = vis ? requestAnimationFrame(frame) : 0;
    const dt = Math.min(.05, (now-last)/1000); last = now; tt += dt;
    const r = box.getBoundingClientRect();
    if(Math.abs(r.width-W) > .5){ size(); }
    c.clearRect(0,0,W,H);
    const sc = r.width / 1000;              // svg viewBox -> css px
    const off = box.scrollLeft;             // mobile scrolls the map horizontally
    c.save(); c.translate(-off,0); c.scale(sc, sc);
    const d = path();
    // ---- scanning sweep ----
    const sx = ((tt*.11)%1) * 1000;
    const g = c.createLinearGradient(sx-90,0,sx,0);
    g.addColorStop(0,'rgba(169,183,169,0)'); g.addColorStop(1,'rgba(169,183,169,.10)');
    c.fillStyle = g; c.fillRect(sx-90, 0, 90, 400);
    c.strokeStyle = 'rgba(205,220,204,.22)'; c.lineWidth = .8;
    c.beginPath(); c.moveTo(sx,0); c.lineTo(sx,400); c.stroke();
    if(d){
      const dx = d.b[0]-d.a[0], dy = d.b[1]-d.a[1], dist = Math.hypot(dx,dy) || 1;
      const lift = Math.min(110, dist*.32) + 26;
      const mid = [(d.a[0]+d.b[0])/2, (d.a[1]+d.b[1])/2 - lift];
      const at = p => { const q = 1-p; return [q*q*d.a[0]+2*q*p*mid[0]+p*p*d.b[0], q*q*d.a[1]+2*q*p*mid[1]+p*p*d.b[1]]; };
      // ---- the arc draws itself, then keeps breathing ----
      const draw = eIO(clamp(((now-t0)-200)/900));
      c.lineCap = 'round';
      c.beginPath();
      for(let i=0;i<=90;i++){ const p = (i/90)*draw, [x,y] = at(p); i?c.lineTo(x,y):c.moveTo(x,y); }
      c.strokeStyle = 'rgba(169,183,169,.30)'; c.lineWidth = 6; c.stroke();
      c.strokeStyle = 'rgba(214,232,210,.92)'; c.lineWidth = 1.5; c.stroke();
      // distance ticks along the arc — the route is measured, not decorated
      c.font = '500 9px ui-monospace,Menlo,Consolas,monospace'; c.textAlign = 'center';
      for(let i=1;i<5;i++){
        const p = i/5, [x,y] = at(p), [x2,y2] = at(p+.01);
        const ang = Math.atan2(y2-y, x2-x), nx = -Math.sin(ang), ny = Math.cos(ang);
        const a = draw > p ? .5 : 0;
        if(!a) continue;
        c.strokeStyle = 'rgba(214,212,204,'+a+')'; c.lineWidth = 1;
        c.beginPath(); c.moveTo(x-nx*3, y-ny*3); c.lineTo(x+nx*5, y+ny*5); c.stroke();
      }
      // ---- comet packet ----
      const cp = ((tt*.34)%1);
      for(let k=0;k<9;k++){
        const p = cp - k*.018; if(p<0) continue;
        const [x,y] = at(eIO(clamp(p/draw || 1)) * draw);
        const a = (1-k/9) * .8 * (draw>.99?1:0);
        c.fillStyle = 'rgba(224,236,220,'+a+')';
        c.beginPath(); c.arc(x,y, 2.6-k*.22, 0, 6.283); c.fill();
      }
      // ---- ripple on the destination ----
      for(let k=0;k<2;k++){
        const q = ((tt*.42 + k*.5)%1);
        c.strokeStyle = 'rgba(193,180,156,'+(1-q)*.5+')'; c.lineWidth = 1;
        c.beginPath(); c.ellipse(d.b[0], d.b[1], 6+q*26, (6+q*26)*.55, 0, 0, 6.283); c.stroke();
      }
      // ---- origin marker ----
      c.fillStyle = 'rgba(233,230,223,.9)';
      c.beginPath(); c.arc(d.a[0], d.a[1], 3, 0, 6.283); c.fill();
    }
    c.restore();
  }
  const io = new IntersectionObserver(es=>{
    es.forEach(e=>{
      vis = e.isIntersecting;
      if(vis && !raf){ last = performance.now(); raf = requestAnimationFrame(frame); }
    });
  }, {rootMargin:'120px'});
  size(); io.observe(box);
  addEventListener('resize', size, {passive:true});
  if(reduce){ vis = false; cv.style.display = 'none'; }
})();

/* =====================================================================
   2. REVIEWS — a spiral of stories, camera travels, reverse on close
   ===================================================================== */
(function(){
  const src = $$('#reviews .testi');
  const btn = $('.rv-open');
  if(!src.length || !btn) return;

  const DATA = src.map(el=>({
    text: (el.querySelector('p')||{}).textContent || '',
    who:  (el.querySelector('.who b')||{}).textContent || '',
    meta: (el.querySelector('.who small')||{}).textContent || '',
    init: (el.querySelector('.avatar')||{}).textContent || '•',
    av:   (el.querySelector('.avatar')||{}).className.replace('avatar','').trim()
  }));

  const ov = document.createElement('div');
  ov.className = 'rvc';
  ov.setAttribute('role','dialog'); ov.setAttribute('aria-modal','true'); ov.setAttribute('aria-label','Все отзывы');
  ov.innerHTML =
    '<div class="rvc-bg"></div>'+
    '<div class="rvc-cv"><canvas></canvas></div>'+
    '<div class="rvc-stage"></div>'+
    '<div class="rvc-ui">'+
      '<div class="rvc-top"><div class="rvc-ttl">XPN <i></i> отзывы</div>'+
        '<button class="pcx-btn rvc-close" type="button">Закрыть</button></div>'+
      '<div class="rvc-bot"><button class="pcx-btn rvc-prev" type="button">Назад</button>'+
        '<div class="rvc-count"><b>01</b><i>/</i><span>12</span></div>'+
        '<button class="pcx-btn rvc-next" type="button">Дальше</button></div>'+
    '</div>';
  document.body.appendChild(ov);

  const stage = ov.querySelector('.rvc-stage');
  const cvs = ov.querySelector('canvas'), cx = cvs.getContext('2d');
  const numB = ov.querySelector('.rvc-count b'), numS = ov.querySelector('.rvc-count span');

  const cards = DATA.map((d,i)=>{
    const el = document.createElement('article');
    el.className = 'rvc-card';
    el.innerHTML =
      '<div class="rvc-stars">★★★★★</div>'+
      '<p class="rvc-q">«'+d.text.replace(/^«|»\.?$/g,'')+'»</p>'+
      '<div class="rvc-who"><span class="avatar '+d.av+'">'+d.init+'</span>'+
      '<div><b>'+d.who+'</b><small>'+d.meta+'</small></div></div>'+
      '<div class="rvc-ix">'+String(i+1).padStart(2,'0')+'</div>';
    stage.appendChild(el);
    el.addEventListener('click', ()=>{ if(!open) return; if(Math.abs(cam.p - i) < .02) return; go(i); });
    return {el, i};
  });
  numS.textContent = String(DATA.length).padStart(2,'0');

  let open = false, closing = false, raf = 0, last = 0, W=0, H=0, dpr=1, vis=false;
  const cam = {x:0, p:0, e:0, v:0, z:0};          // e = eased position along the spiral
  let target = 0, tgtEase = 0;
  const RAD = 470, PER = .92, RISE = 150;

  function size(){
    W = innerWidth; H = innerHeight; dpr = Math.min(devicePixelRatio||1, 1.6);
    cvs.width = Math.round(W*dpr); cvs.height = Math.round(H*dpr);
    cx.setTransform(dpr,0,0,dpr,0,0);
  }
  size(); addEventListener('resize', ()=>{ if(open||closing) size(); }, {passive:true});

  const N = ()=>cards.length;
  function place(i){
    // ring layout: neighbours appear on both sides, like a carousel you can walk around
    let d = i - cam.e;
    const n = N();
    d = ((d % n) + n) % n; if(d > n/2) d -= n;
    const a = d * PER;
    const R = RAD * (1 + Math.abs(d) * .03);
    const depth = Math.cos(a);
    const x = Math.sin(a) * R;
    const z = depth * R;
    const y = d * 26 + Math.sin(a * .5) * 22;      // a shallow helix, not a flat wheel
    return {x, y, z, depth, a, d};
  }
  function render(){
    const persp = 1100;
    const s0 = 1 / (1 + (RAD)/persp);             // base scale of the front card
    const items = [];
    for(const {el,i} of cards){
      const p = place(i);
      // strong size falloff: the neighbours read as smaller objects in depth
      const sc = persp / (persp + (RAD - p.z) * 2.1) * .92;
      const vis = p.depth > -.32;
      const o = clamp((p.depth + .32) / .9) * (p.depth>.99?1:.9);
      const near = clamp(1 - Math.abs(i - cam.e));
      const px = clamp(p.x, -(W/2 - 150), W/2 - 150);
      el.style.transform = 'translate3d(' + (W/2 + px).toFixed(1) + 'px,' + (H/2 + p.y).toFixed(1) + 'px,0) '+
        'translate(-50%,-50%) scale(' + sc.toFixed(4) + ') rotateY(' + (-p.a*.5).toFixed(2) + 'rad)';
      el.style.opacity = (vis ? o : 0).toFixed(3);
      el.style.zIndex = String(Math.round(p.z));
      el.classList.toggle('is-front', near > .86);
      items.push({p, o, near});
    }
    // the spiral is one continuous drawing: a helix through every visible card
    cx.clearRect(0,0,W,H);
    cx.save(); cx.translate(W/2, H/2);
    const seq = cards.map(({i})=>place(i)).sort((a,b)=>a.d-b.d);
    for(let i=0;i<seq.length-1;i++){
      const a = seq[i], b = seq[i+1];
      if(a.depth < -.25 || b.depth < -.25) continue;
      const sa = persp/(persp+(RAD-a.z)*2.1), sb = persp/(persp+(RAD-b.z)*2.1);
      const p1 = [a.x*sa, a.y*sa], p2 = [b.x*sb, b.y*sb];
      const o = clamp(Math.min(a.depth,b.depth)) * .55;
      cx.strokeStyle = 'rgba(169,183,169,'+o.toFixed(3)+')';
      cx.lineWidth = 1;
      cx.beginPath(); cx.moveTo(p1[0],p1[1]);
      cx.quadraticCurveTo((p1[0]+p2[0])/2, (p1[1]+p2[1])/2 - 40, p2[0], p2[1]);
      cx.stroke();
      // a node where the thread meets the card
      cx.fillStyle = 'rgba(214,232,210,'+(o*1.3).toFixed(3)+')';
      cx.beginPath(); cx.arc(p2[0], p2[1], 2.2, 0, 6.283); cx.fill();
    }
    cx.restore();
  }
  function frame(now){
    raf = (open||closing) ? requestAnimationFrame(frame) : 0;
    const dt = Math.min(.05, (now-last)/1000); last = now;
    // critically damped travel along the spiral
    const k = 1 - Math.exp(-dt * (reduce ? 40 : 5.2));
    cam.e += (target - cam.e) * k;
    cam.x += (target - cam.x) * k;
    if(closing){
      cam.e += (DATA.length * .5 - cam.e) * (1 - Math.exp(-dt*4));
      ov.style.setProperty('--o', clamp(1 - (now - closeT)/700).toFixed(3));
      if(now - closeT > 700){ finish(); return; }
    }
    render();
    const n = Math.round(cam.e);
    numB.textContent = String(clamp(n+1,1,DATA.length)).padStart(2,'0');
    ov.classList.toggle('ready', Math.abs(cam.e - target) < .02);
  }
  function go(i){
    target = clamp(i, 0, DATA.length - 1);
    if(!raf){ last = performance.now(); raf = requestAnimationFrame(frame); }
  }
  let closeT = 0;
  function openFilm(){
    if(open) return;
    open = true; closing = false;
    ov.classList.add('live');
    document.body.classList.add('rvc-open');
    size();
    target = 0; cam.e = -1.6; cam.x = -1.6;
    ov.style.setProperty('--o', 1);
    last = performance.now();
    if(!raf) raf = requestAnimationFrame(frame);
    go(clamp(Math.round(cam.e),0,DATA.length-1));
    setTimeout(()=>ov.classList.add('shown'), 20);
  }
  function closeFilm(){
    if(!open || closing) return;
    closing = true; open = false; closeT = performance.now();
  }
  function finish(){
    closing = false;
    ov.classList.remove('live','shown','ready');
    document.body.classList.remove('rvc-open');
    cx.clearRect(0,0,W,H);
    if(raf){ cancelAnimationFrame(raf); raf = 0; }
    btn.focus({preventScroll:true});
  }
  btn.addEventListener('click', openFilm);
  ov.querySelector('.rvc-close').addEventListener('click', closeFilm);
  ov.querySelector('.rvc-next').addEventListener('click', ()=>go(Math.round(target)+1));
  ov.querySelector('.rvc-prev').addEventListener('click', ()=>go(Math.round(target)-1));
  addEventListener('keydown', e=>{
    if(!open) return;
    if(e.key === 'Escape'){ e.preventDefault(); closeFilm(); }
    if(e.key === 'ArrowRight'){ e.preventDefault(); go(Math.round(target)+1); }
    if(e.key === 'ArrowLeft'){ e.preventDefault(); go(Math.round(target)-1); }
  });
  // wheel / trackpad scrubs the spiral
  let wheelLock = 0;
  ov.addEventListener('wheel', e=>{
    if(!open) return;
    e.preventDefault();
    const now = performance.now();
    if(now - wheelLock < 260) return; wheelLock = now;
    if(Math.abs(e.deltaY) < 8) return;
    go(Math.round(target) + (e.deltaY > 0 ? 1 : -1));
  }, {passive:false});
  // touch: swipe between stories
  let tx = 0, ty = 0;
  ov.addEventListener('touchstart', e=>{ const t = e.touches[0]; tx = t.clientX; ty = t.clientY; }, {passive:true});
  ov.addEventListener('touchend', e=>{
    if(!open) return;
    const t = e.changedTouches[0], dx = t.clientX - tx, dy = t.clientY - ty;
    if(Math.abs(dx) > 46 && Math.abs(dx) > Math.abs(dy)) go(Math.round(target) + (dx < 0 ? 1 : -1));
  }, {passive:true});
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
