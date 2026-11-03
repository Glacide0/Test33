/* =====================================================================
   XPN FILM ENGINE
   One timeline (T, "seconds") drives everything:
   headline -> liquid collapse -> dot -> travels -> unfolds into card
   -> card folds back into dot -> dot erupts into the next headline.
   A 3D particle world morphs in sync (field > shield > tunnel > globe >
   warp > devices > halo) with a continuous camera.
   ===================================================================== */
(function(){
'use strict';
const $ = id => document.getElementById(id);
const film = $('film');
if(!film) return;

const stage = $('filmStage'), cv = $('filmCv'), ctx = cv.getContext('2d');
const blob = $('blob'), glow = $('blobGlow'), hint = $('filmHint');
const gooBlur = $('fGooBlur'), gooMat = $('fGooMat');
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const fine = matchMedia('(hover:hover) and (pointer:fine)').matches;

const clamp = (v, a = 0, b = 1) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const sm = t => { t = clamp(t); return t * t * (3 - 2 * t); };
const smr = t => { t = clamp(t); return t * t * t * (t * (t * 6 - 15) + 10); };
const eOut3 = t => 1 - Math.pow(1 - clamp(t), 3);
const eInOut = t => { t = clamp(t); return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
const eBack = t => { t = clamp(t); const c1 = 1.5, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
const gauss = (x, m, s) => Math.exp(-((x - m) * (x - m)) / (2 * s * s));
const fmt2 = n => String(n).padStart(2, '0');

const NCH = 7, U = 10, T0 = 1.2;
// chapter lengths (timeline seconds). Chapter 4 is longer: it contains the route sequence.
const CL = [10, 10, 10, 13, 10, 10, 10.5];
const CS = CL.reduce((a, l, i) => { a.push(i ? a[i - 1] + CL[i - 1] : 0); return a; }, []);
const T1 = CS[NCH - 1] + CL[NCH - 1];
const J_SH = 3.0;          // extra seconds the route sequence adds to chapter 4
const J0 = 3.55, J1 = J0 + J_SH;  // route sequence window inside chapter 4 (local time)
const chOf = T => { let c = 0; for(let i = 1; i < NCH; i++) if(T >= CS[i]) c = i; return c; };
// "generic" local time: the shared choreography clock (route window frozen)
const genU = (c, u) => c !== 3 ? u : (u < J0 ? u : u < J1 ? J0 : u - J_SH);
// ---- intro slates live on their own stretch of the scroll ("outer" time).
// While a slate plays, the film clock is frozen, so nothing underneath moves
// or overlaps it; once the slate opens, the chapter starts from its first frame.
const IL = [0, 1.7, 1.7, 1.7, 1.7, 1.7, 1.7];
const CSo = CS.map((v, i) => v + IL.slice(0, i + 1).reduce((a, b) => a + b, 0));
const S1 = T1 + IL.reduce((a, b) => a + b, 0);
const toOuter = T => { const c = chOf(T); return CSo[c] + IL[c] + (T - CS[c]); };
const toInner = X => {
  let c = 0; for(let i = 1; i < NCH; i++) if(X >= CSo[i]) c = i;
  const iu = X - CSo[c];
  return {c, iu, T: CS[c] + Math.max(0, iu - IL[c])};
};
const CH_NAMES = ['Что о вас видно', 'Шифрование', 'Туннель', 'Весь мир', 'Скорость', 'Устройства', 'Готово'];
const chapterIntros = [...film.querySelectorAll('.chapter-intro')].map(el => {
  // split every display line into masked glyphs once
  const b = el.querySelector('b');
  const letters = [];
  if(b){
    const lines = b.innerHTML.split(/<br\s*\/?>/i);
    b.innerHTML = '';
    lines.forEach((ln, li) => {
      const tmp = document.createElement('span'); tmp.innerHTML = ln;
      const em = tmp.querySelector('em');
      const txt = tmp.textContent;
      const row = document.createElement('span'); row.className = 'ci-row' + (em ? ' ci-em' : '');
      [...txt].forEach(ch => {
        const m = document.createElement('span'); m.className = 'ci-m';
        const g = document.createElement('span'); g.className = 'ci-g'; g.textContent = ch === ' ' ? '\u00a0' : ch;
        m.appendChild(g); row.appendChild(m);
        letters.push({el: g, row: li});
      });
      b.appendChild(row);
    });
  }
  const n = letters.length;
  letters.forEach((l, i) => { l.i = i; l.k = n > 1 ? i / (n - 1) : 0; });
  return {el, b, letters, small: el.querySelector('small'), num: el.querySelector('i'),
    line: el.querySelector('.ci-line'), dot: el.querySelector('.ci-dot'), cap: el.querySelector('.ci-cap'),
    top: el.querySelector('.ci-sh.t'), bot: el.querySelector('.ci-sh.b'), on: false};
});
let introBeat = -1;
const eIn3 = t => { t = clamp(t); return t * t * t; };
/* one shared "point" that the slates fold into / unfold from, and that the
   headline then keeps unfolding from: the same dot carries the motion across */
const coreEl = document.createElement('span'); coreEl.className = 'ci-core'; coreEl.setAttribute('aria-hidden', 'true');
stage.appendChild(coreEl);
const CORE = {x: 0, y: 0, s: 0, f: 0, _k: '', busy: false};
function coreSet(x, y, sc, flash){ if(sc > CORE.s){ CORE.x = x; CORE.y = y; CORE.s = sc; CORE.f = Math.max(CORE.f, flash || 0); } }
function coreApply(){
  const k = CORE.s > .01 ? CORE.x.toFixed(1) + ',' + CORE.y.toFixed(1) + ',' + CORE.s.toFixed(3) + ',' + CORE.f.toFixed(2) : '0';
  if(k !== CORE._k){
    CORE._k = k;
    if(CORE.s <= .01) coreEl.style.opacity = '0';
    else {
      coreEl.style.opacity = Math.min(1, CORE.s * 1.6).toFixed(3);
      coreEl.style.transform = 'translate3d(' + CORE.x.toFixed(1) + 'px,' + CORE.y.toFixed(1) + 'px,0) scale(' + (CORE.s * (1 + CORE.f * .9)).toFixed(3) + ')';
      coreEl.style.setProperty('--f', CORE.f.toFixed(3));
    }
  }
  CORE.s = 0; CORE.f = 0; CORE.busy = false;
}
function measureIntro(o){
  const sr = stage.getBoundingClientRect();
  o.lr = o.letters.map(l => { const r = l.el.parentNode.getBoundingClientRect(); return {x: r.left - sr.left + r.width / 2, y: r.top - sr.top + r.height / 2}; });
  o.lw = innerWidth; o.lh = innerHeight;
}
let introCover = 0;
function paintIntro(o, a, noNeg, ci){
  // a: 0..1 progress through the slate. The slate is a fold of the point:
  //  .00-.30  UNFOLD  the point swells, the plate opens around it as a circle,
  //                   glyphs are thrown out of the point onto their places
  //  .22-.56  the rule is drawn, the caption is written along it
  //  .40-.62  hold (readable) - meanwhile the fold centre glides to the next
  //           chapter's point (invisible: the plate covers the screen)
  //  .60-.90  FOLD    glyphs are pulled into that point and melt (goo) into a drop
  //  .82-1.0  the plate closes onto the point; the dot stays and the chapter's
  //           headline unfolds out of that very dot
  CORE.busy = a < .985;
  const Wv = stage.clientWidth || innerWidth, Hv = stage.clientHeight || innerHeight;
  if(!o.lr || o.lw !== innerWidth || o.lh !== innerHeight) measureIntro(o);
  if(!o.p0) o.p0 = {x: clamp(PT.x || Wv / 2, 40, Wv - 40), y: clamp(PT.y || Hv / 2, 40, Hv - 40)};
  const sc = scenes[ci];
  const p1 = sc && sc.C ? sc.C : {x: Wv / 2, y: Hv * .47};
  const mv = eInOut((a - .34) / .3);
  const px = lerp(o.p0.x, p1.x, mv), py = lerp(o.p0.y, p1.y, mv);
  const maxR = Math.hypot(Math.max(px, Wv - px), Math.max(py, Hv - py)) * 1.04;
  const grow = eOut3((a - .03) / .27), shut = eInOut((a - .83) / .17);
  const rr = Math.max(0, maxR * grow * (1 - shut));
  // PERF: пока круг заставки перекрывает весь кадр, сцену за ней можно
  // не перерисовывать — плита становится плоской непрозрачной заливкой
  const cov = (grow >= .995 && shut <= .005) ? 1 : 0;
  if(o._cv !== cov){ o._cv = cov; o.el.classList.toggle('ci-cover', !!cov); }
  if(cov) introCover = 1;
  const ck = Math.round(rr) + '|' + Math.round(px) + '|' + Math.round(py);
  if(o._cp !== ck){ o._cp = ck; o.el.style.clipPath = 'circle(' + rr.toFixed(1) + 'px at ' + px.toFixed(1) + 'px ' + py.toFixed(1) + 'px)'; }
  // the dot: swells before the unfold, reappears as the fold completes
  const cIn = sm(a / .05) * (1 - sm((a - .1) / .08));
  const cOut = sm((a - .8) / .08);
  if(cIn > .01) coreSet(o.p0.x, o.p0.y, cIn, sm((a - .02) / .06) * (1 - sm((a - .08) / .06)));
  if(cOut > .01) coreSet(px, py, cOut, sm((a - .86) / .05) * (1 - sm((a - .93) / .07)));
  const sh = sm(a / .2) * (1 - shut);
  o.el.style.setProperty('--sh', sh.toFixed(3));
  if(!noNeg){
    const neg = clamp(1 - Math.abs(a - .88) / .035) * .6;
    const nf = neg > .02 ? 'invert(' + neg.toFixed(3) + ')' : '';
    if(o._nf !== nf){ o._nf = nf; o.el.style.filter = nf; }
  }
  // glyphs
  let conv = 0;
  const n = o.letters.length;
  for(let i = 0; i < n; i++){
    const l = o.letters[i], r = o.lr[i];
    const li = eOut3((a - .05 - l.k * .14) / .3);
    // far glyphs leave first so that all of them arrive together
    const dd = Math.hypot(p1.x - r.x, p1.y - r.y) / (Wv * .5);
    const lo = eInOut((a - .6 - (1 - clamp(dd)) * .06) / .26);
    conv += lo;
    let x = 0, y = 0, s = 1, rot = 0;
    if(li < 1){ x = (o.p0.x - r.x) * (1 - li); y = (o.p0.y - r.y) * (1 - li); s = .04 + .96 * li; rot = (1 - li) * (l.k > .5 ? 34 : -34); }
    if(lo > 0){ x += (px - r.x) * lo; y += (py - r.y) * lo; s *= 1 - .5 * lo; rot += lo * (l.k > .5 ? -12 : 12); }
    const key = (x | 0) + ',' + (y | 0) + ',' + (s * 1000 | 0) + ',' + (rot * 10 | 0);
    if(l._k === key) continue; l._k = key;
    l.el.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0) rotate(' + rot.toFixed(1) + 'deg) scale(' + s.toFixed(3) + ')';
  }
  conv = n ? conv / n : 0;
  // liquid fold: goo only while glyphs are being compressed into the drop
  const gk = sm((a - .62) / .1) * (.3 + .7 * conv) * (1 - sm((a - .9) / .04));
  if(o.b){
    if(gk > .01){ if(o.b.style.filter !== 'url(#fGoo)') o.b.style.filter = 'url(#fGoo)'; setGoo(gk); }
    else if(o.b.style.filter) o.b.style.filter = '';
    const bs = 1 - .96 * sm((a - .74) / .18);
    o.b.style.transformOrigin = (px - (o.bx || 0)) + 'px ' + (py - (o.by || 0)) + 'px';
    o.b.style.transform = bs < .999 ? 'scale(' + bs.toFixed(4) + ')' : '';
    o.b.style.opacity = (1 - sm((a - .92) / .05)).toFixed(3);
  }
  const sIn = eOut3((a - .14) / .22), sOut = sm((a - .6) / .12);
  o.small.style.opacity = (sIn * (1 - sOut)).toFixed(3);
  o.small.style.transform = 'translate3d(' + ((1 - sIn) * -24).toFixed(1) + 'px,' + (sOut * -14).toFixed(1) + 'px,0)';
  o.small.style.letterSpacing = (.34 + (1 - sIn) * .3 - sOut * .2).toFixed(3) + 'em';
  const nIn = eOut3((a - .1) / .4), nOut = sm((a - .6) / .2);
  o.num.style.opacity = (nIn * (1 - nOut) * .9).toFixed(3);
  o.num.style.transform = 'translate3d(0,' + ((1 - nIn) * 30).toFixed(1) + 'px,0) scale(' + (1.12 - .12 * nIn - nOut * .5).toFixed(4) + ')';
  // rule drawn left->right with the dot on its head; on the fold it retracts
  // into its own head, and the head flies into the point with the glyphs
  const d = eInOut((a - .22) / .3), back = eInOut((a - .6) / .18);
  o.line.style.transformOrigin = '100% 50%';
  o.line.style.transform = 'scaleX(' + (d < 1 ? d : 1 - back).toFixed(4) + ')';
  if(d < 1) o.line.style.transformOrigin = '0 50%';
  o.line.style.opacity = (1 - back).toFixed(3);
  o.dot.style.left = (d * 100).toFixed(2) + '%';
  o.dot.style.opacity = (d > .01 && back < .98 ? 1 - back : 0).toFixed(3);
  o.cap.style.clipPath = 'inset(-4px ' + ((1 - d) * 100).toFixed(2) + '% -4px ' + (back * 100).toFixed(2) + '%)';
}
function renderIntro(c, iu){
  chapterIntros.forEach((o, i) => {
    const L = IL[i] || 1;
    const a = i === c && iu < IL[i] ? clamp(iu / L) : -1;
    const on = a >= 0 && a < 1;
    if(o.on !== on){ o.on = on; o.el.style.visibility = on ? 'visible' : 'hidden'; o.p0 = null; if(on){ measureIntro(o); const br = o.b.getBoundingClientRect(), sr = stage.getBoundingClientRect(); o.bx = br.left - sr.left; o.by = br.top - sr.top; } }
    if(on) paintIntro(o, a, false, i);
  });
  const inI = iu < IL[c];
  // one optical beat on the scene as the shutters open; never a permanent filter
  if(inI && iu / IL[c] > .76 && iu / IL[c] < .9 && introBeat !== c){ introBeat = c; shadeCue('intro', .6); }
  if(!inI || iu / IL[c] < .1) introBeat = inI ? introBeat : -1;
  film.classList.toggle('in-intro', inI && iu / IL[c] > .12 && iu / IL[c] < .86);
}

/* --- opening slate for chapter 1: plays once on load (time based) --- */
const openSlate = chapterIntros[0];
if(chapterIntros[0]) chapterIntros[0].el.classList.add('ci-open');
let openT = -1, openEnd = -1;
function runOpening(now){
  if(!openSlate || matchMedia('(prefers-reduced-motion: reduce)').matches || film.classList.contains('static')) return false;
  if(openT < 0) openT = now;
  const a = (now - openT) / 3400;
  if(a >= 1 || scrollY > filmTop + 40){ if(openEnd < 0) openEnd = scrollY > filmTop + 40 ? -1e9 : now; if(openSlate.on){ openSlate.on = false; openSlate.el.style.visibility = 'hidden'; film.classList.remove('in-intro'); } openT = 1e12; return false; }
  // the opening unfolds out of a dot in the middle of the dark frame
  const aa = a;
  if(!openSlate.on){ openSlate.on = true; openSlate.el.style.visibility = 'visible'; openSlate.p0 = {x: (stage.clientWidth || innerWidth) / 2, y: (stage.clientHeight || innerHeight) * .47}; measureIntro(openSlate); const br = openSlate.b.getBoundingClientRect(), sr = stage.getBoundingClientRect(); openSlate.bx = br.left - sr.left; openSlate.by = br.top - sr.top; }
  paintIntro(openSlate, aa, true, 0);
  film.classList.toggle('in-intro', aa < .86);
  return true;
}

/* ============== real browser data for chapter 1 ============== */
const ua = navigator.userAgent;
const tz = (Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Tallinn');
const TZ_RU = {Tallinn:'Таллин', Moscow:'Москва', Riga:'Рига', Vilnius:'Вильнюс', Helsinki:'Хельсинки', Berlin:'Берлин', London:'Лондон',
  Kiev:'Киев', Kyiv:'Киев', Minsk:'Минск', Almaty:'Алматы', Warsaw:'Варшава', Paris:'Париж', Amsterdam:'Амстердам', Stockholm:'Стокгольм',
  Istanbul:'Стамбул', Tbilisi:'Тбилиси', Yerevan:'Ереван', Baku:'Баку', Tashkent:'Ташкент', New_York:'Нью-Йорк', Los_Angeles:'Лос-Анджелес',
  Chicago:'Чикаго', Tokyo:'Токио', Dubai:'Дубай', Prague:'Прага', Vienna:'Вена', Rome:'Рим', Madrid:'Мадрид', Samara:'Самара',
  Yekaterinburg:'Екатеринбург', Novosibirsk:'Новосибирск', Krasnoyarsk:'Красноярск', Vladivostok:'Владивосток', Kaliningrad:'Калининград', Bishkek:'Бишкек'};
const TZ_GEO = {Tallinn:[59.44,24.75], Moscow:[55.75,37.62], Riga:[56.95,24.1], Vilnius:[54.69,25.28], Helsinki:[60.17,24.94], Berlin:[52.52,13.4],
  London:[51.5,-0.12], Kiev:[50.45,30.52], Kyiv:[50.45,30.52], Minsk:[53.9,27.56], Almaty:[43.24,76.9], Warsaw:[52.23,21.01], Paris:[48.86,2.35],
  New_York:[40.7,-74], Tokyo:[35.68,139.7], Istanbul:[41,28.97], Tbilisi:[41.7,44.8], Dubai:[25.2,55.27], Yekaterinburg:[56.84,60.6], Novosibirsk:[55,82.9]};
const tzKey = tz.split('/').pop();
const myCity = TZ_RU[tzKey] || tzKey.replace(/_/g, ' ');
const ME = (() => { const g = TZ_GEO[tzKey] || [59.44, 24.75]; return {lat:g[0], lon:g[1], name:TZ_GEO[tzKey] ? myCity : 'Таллин'}; })();
const os = /iPhone/.test(ua) ? 'iPhone (iOS)' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' :
  /Mac OS X|Macintosh/.test(ua) ? 'Mac (macOS)' : /CrOS/.test(ua) ? 'Chromebook' : /Linux/.test(ua) ? 'Linux' : 'Компьютер';
const br = /YaBrowser/.test(ua) ? 'Яндекс Браузер' : /Edg\//.test(ua) ? 'Microsoft Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' :
  /Chrome\//.test(ua) ? 'Google Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Браузер';
const now0 = new Date();
const FX = {
  city: myCity + ' (по часовому поясу)',
  os, br,
  scr: (screen.width || 0) + ' × ' + (screen.height || 0) + (devicePixelRatio > 1 ? ' · ×' + (Math.round(devicePixelRatio * 10) / 10) : ''),
  lang: (navigator.language || 'ru').toUpperCase() + ' · ' + fmt2(now0.getHours()) + ':' + fmt2(now0.getMinutes()),
  ip: 'открыт для всех'
};
const fxEls = [...film.querySelectorAll('[data-fx]')];

/* ============== cipher helpers ============== */
function hash(str, seed){ let h = (seed >>> 0) || 2166136261; for(let i = 0; i < str.length; i++){ h = Math.imul(h ^ str.charCodeAt(i), 16777619); } return h >>> 0; }
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const GLY = '#%&*+=/<>0123456789ABCDEFXYZ';
function cipherOf(text){
  let out = '', h = hash(text, 91);
  const len = Math.max(24, Math.ceil(text.length * 1.36 / 4) * 4 + 16);
  for(let i = 0; i < len; i++){ h = Math.imul(h ^ (h >>> 13), 1274126177) + i * 2654435761 >>> 0; out += B64[h & 63]; }
  return out;
}
function scramble(target, p, seed, from){
  // timeline-driven reveal: chars switch from noise to final as p sweeps left->right
  let out = '';
  const n = target.length;
  for(let i = 0; i < n; i++){
    const th = i / Math.max(1, n) * .75;
    if(p >= th + .25) out += target[i];
    else if(p > th){ const r = hash(seed + ':' + i + ':' + Math.floor(p * 40), 7); out += target[i] === ' ' ? ' ' : GLY[r % GLY.length]; }
    else out += from ? (from[i] || '') : '';
  }
  return out;
}

/* ============== scenes (headline + side typography) ============== */
const scenes = [...film.querySelectorAll('.sc')].map(sc => {
  const hl = sc.querySelector('.sc-hl'), title = sc.querySelector('.sc-title'), sub = sc.querySelector('.sc-sub');
  const cta = sc.querySelector('.sc-cta'), side = sc.querySelector('.sc-side'), big = sc.querySelector('.sc-big');
  const letters = [];
  if(!reduce){
    title.querySelectorAll('.ln').forEach(ln => {
      const txt = ln.textContent; ln.textContent = '';
      for(const ch of txt){
        const s = document.createElement('span');
        s.className = 'lc' + (ch === ' ' ? ' sp' : '');
        s.textContent = ch === ' ' ? '\u00A0' : ch;
        s.setAttribute('aria-hidden', 'true');
        ln.appendChild(s);
        letters.push({el:s, dx:0, dy:0, d:0, set:false});
      }
    });
  }
  return {sc, hl, title, sub, cta, side, big, letters,
    num: side.querySelector('.sc-num'), lead: side.querySelector('.sc-lead'), unit: side.querySelector('.sc-unit'),
    bigO: big.querySelector('.o'), bigF: big.querySelector('.f'), to: +big.dataset.to || 0, suf: big.dataset.suf || '',
    hlOn: false, sideOn: false, cache: {}};
});
const panels = [...blob.querySelectorAll('.pnl')];
panels.forEach(p => [...p.children].forEach((c, i) => c.style.setProperty('--i', i)));
panels.forEach((p, i) => p.dataset.num = fmt2(i + 1));
const fars = [...film.querySelectorAll('.film-far')];

/* ---------- reduced motion: render as a regular readable section ---------- */
if(reduce){
  film.classList.add('static');
  scenes.forEach((s, i) => { s.sc.appendChild(panels[i]); panels[i].classList.add('on'); });
  fxEls.forEach(el => el.textContent = FX[el.dataset.fx]);
}

/* ============== interactive panels ============== */
// ch2 cipher
const encIn = $('fEncIn'), encOut = $('fEncOut');
let encText = encIn.value, encCipher = cipherOf(encText), encLive = false;
encIn.addEventListener('input', () => { encText = encIn.value || ' '; encCipher = cipherOf(encText); encLive = true; encOut.textContent = encCipher; });
if(reduce) encOut.textContent = encCipher;

// ch3 tunnel toggle
const who = $('fWho'), tunBtns = [...film.querySelectorAll('[data-tun]')];
let tunOverride = null, tunState = null;
function setTun(on){
  if(tunState === on) return; tunState = on;
  who.classList.toggle('safe', on);
  who.querySelectorAll('li').forEach(li => {
    const sm_ = li.querySelector('small'); sm_.textContent = on ? sm_.dataset.on : sm_.dataset.off;
    li.querySelector('.w-st').textContent = on ? 'не видит' : 'видит';
  });
  tunBtns.forEach(b => b.classList.toggle('on', (b.dataset.tun === '1') === on));
}
tunBtns.forEach(b => b.addEventListener('click', () => { tunOverride = b.dataset.tun === '1'; setTun(tunOverride); }));
setTun(false);

// ch4 globe countries
const GEO = [
  {cc:'NL', name:'Нидерланды', city:'Амстердам', lat:52.37, lon:4.9, ip:'185.107.56', ping:24},
  {cc:'DE', name:'Германия', city:'Франкфурт', lat:50.11, lon:8.68, ip:'91.198.174', ping:21},
  {cc:'US', name:'США', city:'Нью-Йорк', lat:40.71, lon:-74, ip:'104.244.42', ping:96},
  {cc:'JP', name:'Япония', city:'Токио', lat:35.68, lon:139.7, ip:'45.76.103', ping:182},
  {cc:'TR', name:'Турция', city:'Стамбул', lat:41, lon:28.97, ip:'78.135.86', ping:48},
  {cc:'BR', name:'Бразилия', city:'Сан-Паулу', lat:-23.55, lon:-46.63, ip:'177.54.150', ping:204},
];
const geoBox = $('fGeo');
let geoSel = 0;
GEO.forEach((g, i) => {
  const b = document.createElement('button');
  b.type = 'button'; b.innerHTML = '<span class="cc">' + g.cc + '</span><em>' + g.name + '</em>';
  b.addEventListener('click', () => selectGeo(i));
  geoBox.appendChild(b);
});
function kmBetween(a, b){
  const R = 6371, t = Math.PI / 180, dLa = (b.lat - a.lat) * t, dLo = (b.lon - a.lon) * t;
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(a.lat * t) * Math.cos(b.lat * t) * Math.sin(dLo / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}
let arcStart = 0;
function selectGeo(i){
  geoSel = i; const g = GEO[i];
  [...geoBox.children].forEach((b, k) => b.classList.toggle('on', k === i));
  $('fGeoCity').textContent = g.city;
  $('fGeoIp').textContent = g.ip + '.' + (40 + (i * 37) % 200) ;
  $('fGeoPing').textContent = g.ping + ' мс';
  $('fGeoKm').textContent = kmBetween(ME, g).toLocaleString('ru-RU') + ' км';
  arcStart = performance.now();
}
selectGeo(0);

/* 105 countries: they light up on the globe in step with the «105 стран» counter,
   spreading outward from the visitor's own city */
const COUNTRIES = [
['Нидерланды',52.37,4.9],['Германия',52.52,13.4],['Франция',48.86,2.35],['Великобритания',51.5,-.12],['Испания',40.42,-3.7],['Италия',41.9,12.5],
['Португалия',38.72,-9.14],['Бельгия',50.85,4.35],['Швейцария',46.95,7.45],['Австрия',48.21,16.37],['Польша',52.23,21.01],['Чехия',50.08,14.43],
['Словакия',48.15,17.11],['Венгрия',47.5,19.04],['Румыния',44.43,26.1],['Болгария',42.7,23.32],['Греция',37.98,23.73],['Сербия',44.79,20.45],
['Хорватия',45.81,15.98],['Словения',46.06,14.51],['Босния',43.86,18.41],['Черногория',42.44,19.26],['Албания',41.33,19.82],['Македония',42,21.43],
['Молдова',47.01,28.86],['Украина',50.45,30.52],['Литва',54.69,25.28],['Латвия',56.95,24.1],['Эстония',59.44,24.75],['Финляндия',60.17,24.94],
['Швеция',59.33,18.06],['Норвегия',59.91,10.75],['Дания',55.68,12.57],['Исландия',64.15,-21.94],['Ирландия',53.35,-6.26],['Люксембург',49.61,6.13],
['Мальта',35.9,14.51],['Кипр',35.17,33.36],['Турция',39.93,32.86],['Грузия',41.72,44.79],['Армения',40.18,44.51],['Азербайджан',40.41,49.87],
['Казахстан',51.17,71.45],['Узбекистан',41.3,69.24],['Кыргызстан',42.87,74.59],['Израиль',32.08,34.78],['ОАЭ',24.45,54.38],['Саудовская Аравия',24.71,46.68],
['Катар',25.29,51.53],['Египет',30.04,31.24],['Марокко',34.02,-6.83],['Тунис',36.81,10.18],['Алжир',36.75,3.06],['Нигерия',9.08,7.4],
['Гана',5.6,-.19],['Кения',-1.29,36.82],['ЮАР',-25.75,28.19],['Ангола',-8.84,13.23],['Эфиопия',9.03,38.74],['Танзания',-6.79,39.21],
['Индия',28.61,77.21],['Пакистан',33.68,73.05],['Бангладеш',23.81,90.41],['Шри-Ланка',6.93,79.86],['Непал',27.72,85.32],['Таиланд',13.76,100.5],
['Вьетнам',21.03,105.85],['Малайзия',3.14,101.69],['Сингапур',1.35,103.82],['Индонезия',-6.21,106.85],['Филиппины',14.6,120.98],['Камбоджа',11.56,104.92],
['Гонконг',22.32,114.17],['Тайвань',25.03,121.56],['Южная Корея',37.57,126.98],['Япония',35.68,139.7],['Монголия',47.92,106.92],['Австралия',-35.28,149.13],
['Новая Зеландия',-41.29,174.78],['США',38.9,-77.04],['Канада',45.42,-75.7],['Мексика',19.43,-99.13],['Гватемала',14.63,-90.51],['Коста-Рика',9.93,-84.08],
['Панама',8.98,-79.52],['Колумбия',4.71,-74.07],['Венесуэла',10.48,-66.9],['Эквадор',-.18,-78.47],['Перу',-12.05,-77.04],['Бразилия',-15.79,-47.88],
['Боливия',-16.5,-68.15],['Чили',-33.45,-70.67],['Аргентина',-34.6,-58.38],['Уругвай',-34.9,-56.16],['Парагвай',-25.26,-57.58],['Ямайка',18.02,-76.8],
['Доминикана',18.49,-69.93],['Пуэрто-Рико',18.47,-66.11],['Багамы',25.05,-77.36],['Багладеш2',0,0],['Андорра',42.51,1.52],
['Лихтенштейн',47.14,9.52],['Бахрейн',26.23,50.59],['Оман',23.59,58.38],['Иордания',31.95,35.93],['Ливан',33.89,35.5]
].filter(c => c[0] !== 'Багладеш2');

let cPrep = false;
function prepCountries(){
  cPrep = true;
  const a = llv(ME.lat, ME.lon);
  COUNTRIES.forEach(c => { const b = llv(c[1], c[2]); c[3] = Math.acos(clamp(a[0]*b[0] + a[1]*b[1] + a[2]*b[2], -1, 1)); });
  COUNTRIES.sort((x, y) => x[3] - y[3]);
}
const COUNT_DUR = 2.6;          // seconds (chapter-local) the counter needs to reach 105
let geoCountP = 0;              // 0..1 progress of the count, shared by the counter and the globe

// ch5 speed
const ACTS = [
  {need:25, txt:'<b>С большим запасом.</b> Для 4K нужно около 25 Мбит/с — с XPN у вас примерно 91.'},
  {need:15, txt:'<b>Отлично для игр.</b> Пинг вырастет всего на 3–6 мс — вы этого не заметите.'},
  {need:4, txt:'<b>Звонки без зависаний.</b> Видеосвязи хватает 4 Мбит/с, а у вас в 20 раз больше.'},
  {need:50, txt:'<b>Быстро.</b> Фильм на 4 ГБ скачается примерно за 6 минут — почти как без VPN.'},
];
let actSel = 0, actT = 0;
const actBtns = [...$('fActs').children];
function setAct(i){
  actSel = i; actT = performance.now();
  actBtns.forEach((b, k) => b.classList.toggle('on', k === i));
  $('fNeed').textContent = ACTS[i].need + ' Мбит/с';
  $('fVerdict').innerHTML = ACTS[i].txt;
}
actBtns.forEach((b, i) => b.addEventListener('click', () => setAct(i)));
setAct(0);

// ch5 live chart inside the card (timeline-revealed, then streams like a monitor)
const chCv = $('fChart'), chCtx = chCv ? chCv.getContext('2d') : null;
let chW = 0, chH = 0, needA = 25;
function drawSpeedChart(g, now){
  if(!chCtx) return;
  // eased draw-on: no linear reveal or stepped graph head
  g = smr(g);
  const w = chCv.clientWidth, h = chCv.clientHeight;
  if(!w || !h) return;
  const dpr = Math.min(2, devicePixelRatio || 1);
  if(w !== chW || h !== chH){ chW = w; chH = h; chCv.width = Math.round(w * dpr); chCv.height = Math.round(h * dpr); }
  const c = chCtx; c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, w, h);
  // a wider right inset: the live head is a glowing dot, and it used to be cut
  // in half by the canvas edge when it reached the newest sample
  const L = 30, R = 17, Tp = 8, B = 16, pw = w - L - R, ph = h - Tp - B, MAX = 110;
  const Y = v => Tp + ph - v / MAX * ph;
  needA += (ACTS[actSel].need - needA) * .12;
  c.font = '500 9.5px ui-monospace,Menlo,Consolas,monospace'; c.textBaseline = 'middle'; c.textAlign = 'right';
  [0, 50, 100].forEach(v => {
    c.strokeStyle = 'rgba(233,230,223,.06)'; c.beginPath(); c.moveTo(L, Y(v) + .5); c.lineTo(w - R, Y(v) + .5); c.stroke();
    c.fillStyle = 'rgba(233,230,223,.32)'; c.fillText(String(v), L - 6, Y(v));
  });
  c.textAlign = 'left'; c.fillStyle = 'rgba(233,230,223,.26)'; c.fillText('секунды →', L, h - 6);
  // Once the curve is fully drawn, the live head stays pinned to the newest
  // sample instead of sliding off the right edge.
  const N_ = 56, off = now / 1000 * 3.4;
  const head = g >= .999 ? N_ : g * N_;
  const val = (k, xp) => {
    const q = k + off, ramp = 1 - Math.exp(-(k + 1) * (g < 1 ? .55 : 9));
    return ((xp ? 90.6 : 93.8) + 2.6 * Math.sin(q * .9 + xp * 1.7) + 1.6 * Math.sin(q * 2.3 + 1 + xp) + 1.2 * Math.sin(q * .21)) * ramp;
  };
  const X = k => L + k / N_ * pw;
  const trace = (xp) => { c.beginPath(); for(let k = 0; k <= head; k++){ const yy = Y(val(k, xp)); if(k) c.lineTo(X(k), yy); else c.moveTo(X(k), yy); } if(head % 1){ c.lineTo(X(head), Y(val(head, xp))); } };
  if(head > .5){
    c.lineJoin = 'round'; c.lineCap = 'round';
    // XPN area
    trace(1); c.lineTo(X(head), Y(0)); c.lineTo(X(0), Y(0)); c.closePath();
    const gr = c.createLinearGradient(0, Tp, 0, Tp + ph); gr.addColorStop(0, 'rgba(169,183,169,.22)'); gr.addColorStop(1, 'rgba(169,183,169,0)');
    c.fillStyle = gr; c.fill();
    trace(0); c.strokeStyle = 'rgba(233,230,223,.32)'; c.lineWidth = 1.2; c.stroke();
    trace(1); c.strokeStyle = '#a9b7a9'; c.lineWidth = 1.8; c.stroke(); c.lineWidth = 1;
  }
  // need threshold
  c.setLineDash([4, 4]); c.strokeStyle = 'rgba(191,174,141,.75)';
  c.beginPath(); c.moveTo(L, Y(needA)); c.lineTo(L + pw * eOut3(clamp(g * 1.8)), Y(needA)); c.stroke(); c.setLineDash([]);
  c.fillStyle = 'rgba(191,174,141,.9)'; c.textAlign = 'right'; c.font = '600 10px ' + "'Segoe UI',system-ui,sans-serif";
  c.fillText('нужно ' + Math.round(needA), w - R - 2, Y(needA) - 8);
  // scan head
  if(head > .5){
    const hx = X(head), v1 = val(head, 1), v0 = val(head, 0);
    const sg = c.createLinearGradient(hx - 40, 0, hx, 0); sg.addColorStop(0, 'rgba(169,183,169,0)'); sg.addColorStop(1, 'rgba(169,183,169,.12)');
    c.fillStyle = sg; c.fillRect(hx - 40, Tp, 40, ph);
    c.strokeStyle = 'rgba(169,183,169,.5)'; c.beginPath(); c.moveTo(hx + .5, Tp); c.lineTo(hx + .5, Tp + ph); c.stroke();
    const rg = c.createRadialGradient(hx, Y(v1), 0, hx, Y(v1), 10); rg.addColorStop(0, 'rgba(215,226,213,.9)'); rg.addColorStop(1, 'rgba(169,183,169,0)');
    c.fillStyle = rg; c.beginPath(); c.arc(hx, Y(v1), 10, 0, 6.283); c.fill();
    c.fillStyle = '#dfe6dc'; c.beginPath(); c.arc(hx, Y(v1), 2.6, 0, 6.283); c.fill();
    const a = Math.round(v0), b = Math.round(v1);
    if(panelCache.v0 !== a){ panelCache.v0 = a; $('fV0').textContent = a; }
    if(panelCache.v1 !== b){ panelCache.v1 = b; $('fV1').textContent = b; }
  } else if(panelCache.v1 !== 0){ panelCache.v0 = panelCache.v1 = 0; $('fV0').textContent = '0'; $('fV1').textContent = '0'; }
}

// ch6 devices
const DEVS = [['i-phone','Телефон'],['i-laptop','Ноутбук'],['i-tv','Телевизор'],['i-phone','Планшет'],['i-monitor','Компьютер'],
  ['i-phone','Мамин'],['i-router','Роутер'],['i-gamepad','Приставка'],['i-laptop','Рабочий'],['i-phone','Детский']];
const devOn = DEVS.map((d, i) => i < 3);
const devBox = $('fDevs');
const devGlow = new Float32Array(10);
DEVS.forEach((d, i) => {
  const b = document.createElement('button');
  b.type = 'button'; b.setAttribute('aria-pressed', devOn[i]);
  b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><use href="#' + d[0] + '"/></svg><span>' + d[1] + '</span>';
  b.addEventListener('click', () => { devOn[i] = !devOn[i]; b.setAttribute('aria-pressed', devOn[i]); $('fDevN').textContent = devOn.filter(Boolean).length; });
  devBox.appendChild(b);
});

// ch7 power
const pw = $('fPower');
let connected = false, burstT = -1e9;
pw.addEventListener('click', () => {
  connected = !connected;
  pw.classList.toggle('on', connected);
  pw.setAttribute('aria-pressed', connected);
  pw.setAttribute('aria-label', connected ? 'Выключить защиту' : 'Включить защиту');
  $('fPwSt').className = 'pn-st ' + (connected ? 'st-ok' : 'st-bad');
  $('fPwStT').textContent = connected ? 'Защищено' : 'Не защищено';
  $('fPwT').textContent = connected ? 'Вы защищены' : 'Нажмите на щит';
  $('fPwS').textContent = connected ? 'Сервер: ' + GEO[geoSel].city + ' · ' + GEO[geoSel].ping + ' мс. IP скрыт, трафик зашифрован.' : 'Так выглядит XPN: одна кнопка — и всё, что вы делаете в сети, скрыто.';
  const sig = $('fPwSignal');
  if(sig){
    sig.classList.toggle('live', connected);
    sig.querySelector('span').textContent = connected ? 'Контур защиты активен' : 'Контур защиты ожидает';
  }
  if(connected){
    burstT = performance.now();
    shadeCue('impact', 1);
    pw.classList.remove('is-burst'); void pw.offsetWidth; pw.classList.add('is-burst');
  }
});

if(reduce) return; // static version is complete
document.documentElement.style.scrollBehavior = 'auto';

/* ============== layout ============== */
let W = 0, H = 0, DPR = 1, mobile = false, LB = 0, S = 1;
const geo = {C:{x:0, y:0}, K:[], W:440, H:[], fit:[], side:{x:0, y:0}};
// Enough particles to retain the volumetric silhouette, but with a much lower
// fill-rate budget on phones and high-DPI screens.
const N = innerWidth < 820 ? 680 : 1250;

function layout(){
  W = stage.clientWidth; H = stage.clientHeight; mobile = W < 820;
  DPR = Math.min(devicePixelRatio || 1, mobile ? 1.3 : 1.5);
  cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  const lbEl = document.querySelector('.letterbox.bot');
  LB = lbEl ? lbEl.getBoundingClientRect().height : 0;
  stage.style.setProperty('--lbh', LB + 'px');
  S = Math.min(W * (mobile ? .9 : .5), H) * (mobile ? .4 : .34);

  film.style.height = Math.round(H + (S1 - T0) * H * (mobile ? .13 : .16)) + 'px';

  geo.C = {x: W / 2, y: H * (mobile ? .45 : .47)};
  // headlines: fit to width, then measure letter offsets to the collapse point
  scenes.forEach(s => {
    s.letters.forEach(l => { l.el.style.transform = ''; l.set = false; });
    s.title.style.transform = ''; s.title.style.filter = '';
    const base = mobile ? Math.min(W * .15, H * .09, 70) : Math.min(W * .088, H * .14, 140);
    s.title.style.fontSize = base + 'px';
    const lw = Math.max(...[...s.title.querySelectorAll('.ln')].map(l => l.offsetWidth));
    const maxW = W * (mobile ? .9 : .84);
    if(lw > maxW) s.title.style.fontSize = (base * maxW / lw) + 'px';
    s.hl.style.transform = 'none';
    const tcx = s.title.offsetLeft + s.title.offsetWidth / 2, tcy = s.title.offsetTop + s.title.offsetHeight / 2;
    // centre the whole typographic block in the free frame; collapse point = title centre
    const topF = 80, botF = H - LB - 84, hh = s.hl.offsetHeight;
    const blockTop = Math.max(topF, topF + (botF - topF - hh) / 2 - (mobile ? 0 : 6));
    s.C = {x: W / 2, y: blockTop + tcy};
    s.base = {x: W / 2 - s.hl.offsetWidth / 2, y: blockTop, ox: tcx, oy: tcy};
    let maxd = 1;
    s.letters.forEach(l => {
      const lx = l.el.offsetLeft + l.el.offsetWidth / 2, ly = l.el.offsetTop + l.el.offsetHeight / 2;
      l.dx = tcx - lx; l.dy = tcy - ly; l.dist = Math.hypot(l.dx, l.dy); if(l.dist > maxd) maxd = l.dist;
    });
    s.letters.forEach(l => { l.d = l.dist / maxd; });
    s.hl.style.transformOrigin = tcx + 'px ' + tcy + 'px';
  });

  // card geometry
  geo.W = mobile ? Math.min(W - 24, 440) : Math.round(Math.min(460, Math.max(380, W * .33)));
  blob.style.width = geo.W + 'px';
  const top = mobile ? 0 : 84, bottom = H - LB - 76;
  panels.forEach((p, i) => {
    const h = p.offsetHeight; geo.H[i] = h;
    if(mobile){
      // side typography takes the top; card sits above the player
      const sideTop = 70 + LB;
      const sideH = scenes[i].side.offsetHeight;
      const avail = bottom - (sideTop + sideH + 12);
      geo.fit[i] = Math.min(1, avail / h);
      const hh = h * geo.fit[i];
      geo.K[i] = {x: W / 2, y: bottom - hh / 2 - 4};
    } else {
      const avail = bottom - top - 16;
      geo.fit[i] = Math.min(1, avail / h);
      geo.K[i] = {x: W - Math.max(28, W * .055) - geo.W / 2, y: clamp(H * .5, top + h * geo.fit[i] / 2 + 8, bottom - h * geo.fit[i] / 2 - 8)};
    }
  });
  scenes.forEach(s => {
    if(mobile){
      s.side.style.width = (W - 40) + 'px';
      s.sidePos = {x: 20, y: 70 + LB};
    } else {
      const sw = Math.min(W * .3, 430);
      s.side.style.width = sw + 'px';
      s.sidePos = {x: Math.max(28, W * .055), y: H * .5 - s.side.offsetHeight / 2};
    }
  });
  measureScroll();
}

/* ============== scroll <-> timeline ============== */
let filmTop = 0, range = 1, target = T0, cur = 0, inited = false;
function measureScroll(){ filmTop = film.getBoundingClientRect().top + scrollY; range = Math.max(1, film.offsetHeight - H); }
const yForS = X => filmTop + clamp((X - T0) / (S1 - T0)) * range;
const sForY = y => T0 + clamp((y - filmTop) / range) * (S1 - T0);
const yForT = T => yForS(toOuter(T));
const tForY = y => toInner(sForY(y)).T;

let playing = false, playT = T0, ss = null, snapTimer = 0, lastDir = 1, lastY = scrollY;
const plPlay = $('plPlay');
function setPlaying(on){
  playing = on;
  if(on){ ss = null; playT = sForY(scrollY); if(playT >= S1 - .05){ playT = T0; scrollTo(0, yForS(T0)); } }
  plPlay.querySelector('.pi-play').style.display = on ? 'none' : '';
  plPlay.querySelector('.pi-pause').style.display = on ? '' : 'none';
  plPlay.setAttribute('aria-label', on ? 'Пауза' : 'Смотреть фильм');
}
function smoothScroll(y, dur){ ss = {y0: scrollY, y, t0: performance.now(), dur: dur || clamp(420 + Math.abs(y - scrollY) * .1, 600, 1700)}; }
function goT(T, keepPlay){ const was = playing; if(!keepPlay) setPlaying(false); smoothScroll(yForT(T)); if(keepPlay && was) playT = toOuter(T); }
const stopAuto = () => { if(playing) setPlaying(false); ss = null; };
addEventListener('wheel', stopAuto, {passive:true});
addEventListener('touchstart', e => { if(!e.target.closest('.player')) stopAuto(); }, {passive:true});
addEventListener('keydown', e => { if(['ArrowDown','ArrowUp','PageDown','PageUp','Home','End',' '].includes(e.key) && !e.target.closest('input,textarea')) stopAuto(); });
blob.addEventListener('pointerdown', () => { if(playing) setPlaying(false); });

addEventListener('scroll', () => {
  const y = scrollY; if(y !== lastY){ lastDir = y > lastY ? 1 : -1; lastY = y; }
  if(!playing) target = sForY(y);
  if(playing || ss) return;
  clearTimeout(snapTimer);
  snapTimer = setTimeout(trySnap, 190);
}, {passive:true});

function trySnap(){
  if(playing || ss || window.XPN_NOSNAP) return;
  const y = scrollY;
  if(y < filmTop - 2 || y > filmTop + range - 2) return;
  const T = sForY(y);
  if(T >= S1 - .02) return;
  const pts = [];
  for(let c = 0; c < NCH; c++){ pts.push(toOuter(Math.max(T0, CS[c] + 1.9))); pts.push(toOuter(CS[c] + 6.6 + (c === 3 ? J_SH : 0))); }
  let best = null, bd = 1e9;
  for(const p of pts){
    const d = p - T;
    const ad = Math.abs(d);
    const ahead = Math.sign(d) === lastDir;
    const lim = ahead ? 2.7 : 1.05;
    if(ad < lim && ad < bd){ bd = ad; best = p; }
  }
  if(best !== null && bd > .04) smoothScroll(yForS(best), 560 + bd * 160);
}

/* ============== player ============== */
const track = $('plTrack');
const segs = CH_NAMES.map((n, i) => {
  const b = document.createElement('button');
  b.className = 'pl-seg'; b.type = 'button';
  b.setAttribute('aria-label', 'Глава ' + (i + 1) + ': ' + n);
  b.innerHTML = '<i></i><em>' + fmt2(i + 1) + ' · ' + n + '</em>';
  b.addEventListener('click', () => goT(Math.max(T0, CS[i] + 1.9), true));
  track.appendChild(b);
  return b.firstChild;
});
$('plDur').textContent = fmt2(Math.floor(Math.round(S1) / 60)) + ':' + fmt2(Math.round(S1) % 60);
plPlay.addEventListener('click', () => setPlaying(!playing));
film.querySelectorAll('[data-film-play]').forEach(b => b.addEventListener('click', () => setPlaying(true)));
document.querySelectorAll('[data-film-skip]').forEach(b => b.addEventListener('click', () => {
  setPlaying(false);
  const p = document.getElementById('pricing');
  const y = b.closest('.sc-cta') && p ? p.getBoundingClientRect().top + scrollY - 70 : filmTop + film.offsetHeight - 60;
  smoothScroll(y, 1400);
}));
film.querySelectorAll('[data-film-next]').forEach(b => b.addEventListener('click', () => {
  const c = toInner(cur).c; goT(CS[Math.min(NCH - 1, c + 1)] + 1.9);
}));
const plCur = $('plCur'), plCh = $('plCh');

/* ============== pointer (camera parallax) ============== */
let mx = 0, my = 0, smx = 0, smy = 0;
if(fine) addEventListener('pointermove', e => { mx = e.clientX / innerWidth - .5; my = e.clientY / innerHeight - .5; }, {passive:true});

/* ============== particle world ============== */
const R1 = new Float32Array(N), R2 = new Float32Array(N), R3 = new Float32Array(N), R4 = new Float32Array(N);
let seed = 1337;
const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
for(let i = 0; i < N; i++){ R1[i] = rnd(); R2[i] = rnd(); R3[i] = rnd(); R4[i] = rnd(); }
// fibonacci sphere
const FX_ = new Float32Array(N), FY_ = new Float32Array(N), FZ_ = new Float32Array(N);
for(let i = 0; i < N; i++){ const y = 1 - (i / (N - 1)) * 2, r = Math.sqrt(1 - y * y), th = i * 2.399963; FX_[i] = Math.cos(th) * r; FY_[i] = y; FZ_[i] = Math.sin(th) * r; }
// land points for the globe
const GLA = new Float32Array(N), GLO = new Float32Array(N);
(function(){
  const LAND = window.XPN_LAND || [];
  const inPoly = (x, y, poly) => { let c = false; for(let i = 0, j = poly.length - 1; i < poly.length; j = i++){ const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1]; if(((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) c = !c; } return c; };
  const pts = [];
  let row = 0;
  for(let lat = 78; lat > -56; lat -= 2.2, row++){
    const step = 2.2 / Math.max(.25, Math.cos(lat * Math.PI / 180));
    for(let lon = -180 + (row % 2) * step / 2; lon < 180; lon += step){
      if(!LAND.length || LAND.some(p => inPoly(lon, lat, p))) pts.push([lat, lon]);
    }
  }
  for(let i = 0; i < N; i++){
    const p = pts[Math.floor(R1[(i * 7) % N] * pts.length)] || [0, 0];
    GLA[i] = (p[0] + (R2[i] - .5) * 1.6) * Math.PI / 180;
    GLO[i] = (p[1] + (R3[i] - .5) * 1.6) * Math.PI / 180;
  }
})();

// shapes: 0 field, 1 shield, 2 tunnel, 3 globe, 4 warp, 5 devices, 6 halo
const CAM = [
  {yaw:.25, pitch:.12, dist:3.5, sc:1.0},
  {yaw:-.2, pitch:.28, dist:3.7, sc:1.05},
  {yaw:0, pitch:0, dist:2.5, sc:1.0},
  {yaw:0, pitch:0, dist:3.4, sc:1.08},
  {yaw:-.42, pitch:.34, dist:2.55, sc:1.02},
  {yaw:0, pitch:.5, dist:3.6, sc:1.02},
  {yaw:0, pitch:0, dist:3.3, sc:1.0},
];
const TINT = [[200,184,160],[178,192,178],[168,182,196],[214,212,204],[168,184,198],[178,192,178],[180,196,180]];
const HI = [[226,200,170],[205,220,204],[200,214,226],[190,206,190],[214,224,232],[200,216,198],[210,224,208]];

const out = [0, 0, 0];
let gYaw = 0, gPitch = 0, gYawT = 0, gPitchT = 0, tunFlow = 0, spFlow = 0;
let RY = 0, RP = 0, lastCam = null;           // rendered globe rotation + camera of the current frame
// route sequence state (chapter 4): camera focus, zoom, progress
const J = {w:0, z:1, lat:0, lon:0, tp:0, arc:1, om:0, on:false, u:0};
// 3D speed chart helpers (chapter 5)
const SP_SPAN = 3.4, SP_BASE = -.72, SP_AMP = 1.34;
let SP_X = -.4;
const spF = (q, xp) => (xp ? 89.6 : 93.2) + 3.6 * Math.sin(q * 1.9) + 2.3 * Math.sin(q * 4.7 + 1.3) + 1.5 * Math.sin(q * .7 + xp * .5);
const spY = v => SP_BASE + v / 100 * SP_AMP;
/* ---- geo helpers ---- */
const D2R = Math.PI / 180;
const llv = (lat, lon) => { const la = lat * D2R, lo = lon * D2R, cl = Math.cos(la); return [cl * Math.sin(lo), Math.sin(la), cl * Math.cos(lo)]; };
function slerpV(A, B, om, f){
  const so = Math.sin(om); if(so < 1e-5) return A.slice();
  const ka = Math.sin((1 - f) * om) / so, kb = Math.sin(f * om) / so;
  return [A[0] * ka + B[0] * kb, A[1] * ka + B[1] * kb, A[2] * ka + B[2] * kb];
}
// apply the rendered globe rotation to a unit vector (same convention as shapePos case 3)
function rotV(v, r){
  const lo = Math.atan2(v[0], v[2]) + RY, la = Math.asin(clamp(v[1], -1, 1)), cl = Math.cos(la);
  const x = cl * Math.sin(lo), y = Math.sin(la), z = cl * Math.cos(lo), cp = Math.cos(RP), sp = Math.sin(RP);
  return [x * r, (y * cp - z * sp) * r, (y * sp + z * cp) * r];
}
const routeLift = (f, om) => 1.1 + Math.sin(Math.PI * f) * (.12 + om * .14);
function computeJourney(c, u){
  J.on = c === 3; J.u = u;
  if(!J.on){ J.w = 0; J.z = 1; J.arc = 1; return; }
  const g = GEO[geoSel], A = llv(ME.lat, ME.lon), B = llv(g.lat, g.lon);
  const om = Math.acos(clamp(A[0] * B[0] + A[1] * B[1] + A[2] * B[2], -1, 1)); J.om = om;
  J.w = smr((u - 3.4) / 1.0) * (1 - smr((u - 6.45) / 1.15));
  J.tp = eInOut((u - 4.45) / 1.4);
  J.arc = u < 4.45 ? 0 : J.tp;
  const v = slerpV(A, B, om, J.tp);
  J.lat = Math.asin(clamp(v[1], -1, 1)); J.lon = Math.atan2(v[0], v[2]);
  const dip = Math.sin(Math.PI * J.tp) * Math.min(1.3, .22 + om * 1.15);
  J.z = 1 + J.w * (1.75 - dip) + .12 * gauss(u, 5.9, .14) * J.w;
  // the caption is written along the route after the point arrives
  J.lw = clamp((u - 5.02) / 2.05);
  // the camera leans in while the line is being written, then releases
  J.z *= 1 + .07 * Math.sin(Math.PI * clamp(J.lw)) * J.w;
  if(J.tp >= .995 && !J.arrived){ J.arrived = true; shadeCue('switch', 1); }
  else if(J.tp < .9) J.arrived = false;
}
/* detailed land points around the route (built lazily, cached per destination) */
let detail = null, detailKey = -1;
function buildDetail(){
  const g = GEO[geoSel]; detailKey = geoSel;
  const LAND = window.XPN_LAND || [];
  const inPoly = (x, y, poly) => { let c = false; for(let i = 0, j = poly.length - 1; i < poly.length; j = i++){ const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1]; if(((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) c = !c; } return c; };
  const la0 = Math.max(-56, Math.min(ME.lat, g.lat) - 16), la1 = Math.min(78, Math.max(ME.lat, g.lat) + 16);
  let lo0 = Math.min(ME.lon, g.lon) - 26, lo1 = Math.max(ME.lon, g.lon) + 26;
  if(lo1 - lo0 > 200){ lo0 = -180; lo1 = 180; }
  const step = Math.max(.62, Math.sqrt((la1 - la0) * (lo1 - lo0) / 5200));
  const pts = []; let row = 0;
  for(let lat = la1; lat > la0; lat -= step, row++){
    const st = step / Math.max(.3, Math.cos(lat * D2R));
    for(let lon = lo0 + (row % 2) * st / 2; lon < lo1; lon += st){
      if(!LAND.length || LAND.some(pl => inPoly(lon, lat, pl))) pts.push(lat + (Math.sin(lon * 91.7) * .5) * step * .5, lon + (Math.cos(lat * 77.3) * .5) * st * .5);
    }
  }
  detail = new Float32Array(pts);
}
const EU_CITIES = [['Таллин',59.44,24.75],['Рига',56.95,24.1],['Вильнюс',54.69,25.28],['Хельсинки',60.17,24.94],['Стокгольм',59.33,18.06],
  ['Варшава',52.23,21.01],['Берлин',52.52,13.4],['Прага',50.08,14.43],['Минск',53.9,27.56],['Копенгаген',55.68,12.57],['Вена',48.21,16.37],
  ['Париж',48.86,2.35],['Лондон',51.5,-.12],['Москва',55.75,37.62],['Санкт-Петербург',59.94,30.31],['Стамбул',41,28.97],['Франкфурт',50.11,8.68]];
function shapePos(sh, i, t, T){
  // returns highlight flag; writes out[]
  switch(sh){
    case 0: { // field: exposed data cloud
      out[0] = (R1[i] - .5) * 3.8 + Math.sin(t * .21 + R4[i] * 6.28) * .06;
      out[1] = (R2[i] - .5) * 2.1 + Math.cos(t * .17 + R1[i] * 6.28) * .06;
      out[2] = (R3[i] - .5) * 2.8;
      return i % 23 === 0 ? 1 : 0;
    }
    case 1: { // shield sphere + orbit
      if(i % 8 === 0){
        const a = R1[i] * 6.2832 + t * .35, rr = 1.42 + (R2[i] - .5) * .05;
        const x = Math.cos(a) * rr, z = Math.sin(a) * rr, y = (R3[i] - .5) * .04;
        const ct = Math.cos(.42), st = Math.sin(.42);
        out[0] = x; out[1] = y * ct - z * st; out[2] = y * st + z * ct;
        return 1;
      }
      const a = t * .16, ca = Math.cos(a), sa = Math.sin(a), r = 1 + Math.sin(t * 1.4 + i) * .012;
      out[0] = (FX_[i] * ca + FZ_[i] * sa) * r; out[1] = FY_[i] * r; out[2] = (-FX_[i] * sa + FZ_[i] * ca) * r;
      return 0;
    }
    case 2: { // tunnel: rings flowing toward camera
      const L = 9, rings = 30;
      const ring = Math.floor(R2[i] * rings);
      let z = ((ring / rings) * L + tunFlow) % L; z = z - L + 2.1;
      const core = i % 7 === 0;
      const rad = core ? .15 + R3[i] * .6 : 1 + (R3[i] - .5) * .07;
      const a = R1[i] * 6.2832 + ring * .07;
      out[0] = Math.cos(a) * rad; out[1] = Math.sin(a) * rad; out[2] = core ? z + (R4[i] - .5) * .3 : z;
      return core ? 1 : 0;
    }
    case 3: { // globe
      const lat = GLA[i], lon = GLO[i] + gYaw, cl = Math.cos(lat);
      const x = cl * Math.sin(lon), y = Math.sin(lat), z = cl * Math.cos(lon);
      const cp = Math.cos(gPitch), sp = Math.sin(gPitch);
      out[0] = x * 1.1; out[1] = (y * cp - z * sp) * 1.1; out[2] = (y * sp + z * cp) * 1.1;
      return 0;
    }
    case 4: { // drifting dust in front of the velocity terrain (drawn as lines below)
      const z = (R2[i] - .5) * 3.2;
      const x = (R1[i] - .5) * 4.4 + SP_X;
      const y = SP_BASE + .1 + Math.pow(R3[i], 1.6) * 1.5 + Math.sin(t * .5 + R4[i] * 6.28) * .04;
      out[0] = x; out[1] = y; out[2] = z;
      return R4[i] > .97 ? 1 : 0;
    }
    case 5: { // devices: a hub with ten clean orbital rings, one per device
      if(i % 11 === 0){ out[0] = FX_[i] * .16; out[1] = FY_[i] * .16; out[2] = FZ_[i] * .16; return 1; }
      const cl = i % 10, on = devGlow[cl];
      const tilt = (cl / 10 - .5) * 1.5, rr = 1.12 + (on ? 0 : .16);
      // each ring is a thin, evenly sampled circle — deliberately graphic, not cloudy
      const a = (Math.floor(R1[i] * 90) / 90) * 6.2832 + t * (on ? .42 : .12) * (cl % 2 ? 1 : -1);
      const x = Math.cos(a) * rr, z = Math.sin(a) * rr, y = 0;
      const cy = Math.cos(tilt), sy = Math.sin(tilt);
      out[0] = x; out[1] = y * cy - z * sy; out[2] = y * sy + z * cy;
      return on > .5 && i % 4 === 0 ? 1 : 0;
    }
    default: { // halo
      const bt = (performance.now() - burstT) / 1000, burst = bt > 0 && bt < 2.4 ? Math.sin(Math.min(1, bt / .35) * Math.PI / 2) * Math.exp(-bt * 1.6) : 0;
      const band = i % 3, a = R1[i] * 6.2832 + t * (connected ? .45 : .1) * (band === 1 ? -1 : 1);
      const loose = connected ? .012 : .06;
      const rr = (1.02 + band * .14 + (R2[i] - .5) * loose * 2 + Math.sin(t * 2.2 + i) * loose * .4) * (1 + burst * .7 * R4[i]);
      out[0] = Math.cos(a) * rr; out[1] = Math.sin(a) * rr; out[2] = (R3[i] - .5) * (connected ? .05 : .22);
      return connected ? 1 : (i % 11 === 0 ? 1 : 0);
    }
  }
}

const SX = new Float32Array(N), SY = new Float32Array(N), SZ = new Float32Array(N), SV = new Uint8Array(N);
const paths = [new Path2D(), new Path2D(), new Path2D(), new Path2D(), new Path2D(), new Path2D(), new Path2D(), new Path2D()];
const ALPHA = [.16, .32, .55, .85];
const trail = [];
const FIELD_LABELS = [
  'IP-адрес: открыт', 'город: ' + myCity, os, br, 'поиск: «билеты в Рим»', 'Wi-Fi «Cafe_Free»', 'история посещений', 'cookies: 148 шт.', 'онлайн-банк', 'геопозиция'
];
const TUN_WORDS = ['AES-256', 'WireGuard', 'ключ 9F3A', 'без логов', 'зашифровано', 'ChaCha20', 'XPN', 'туннель'];
const SPH_WORDS = ['9f3a', 'c41e', 'x7Qp', '0b2d', 'Kz4=', 'e88a', 'r1Vw', '5d0c'];

function project(x, y, z, cam){
  const x1 = x * cam.cy + z * cam.sy, z1 = -x * cam.sy + z * cam.cy;
  const y1 = y * cam.cp - z1 * cam.sp, z2 = y * cam.sp + z1 * cam.cp;
  const zc = cam.dist - z2;
  if(zc < .22) return null;
  const s = cam.S * cam.dist / zc;
  return [cam.ox + x1 * s, cam.oy - y1 * s, zc, s];
}

/* ---------- moment shaders -------------------------------------------
   The grade is NOT always on. It fires on cues: the typographic collapse,
   the instant the IP address switches, the shield impact. Each cue is a
   short beat of bloom + chromatic split + a real negative flash, and the
   film canvas itself leans back in 3D for the duration.                  */
let postCv = null, postCtx = null, postW = 0, postH = 0, postTick = 0;
let invCv = null, invCtx = null;
const postOK = (() => { try { const c = document.createElement('canvas').getContext('2d'); c.filter = 'blur(1px)'; return c.filter === 'blur(1px)'; } catch(e){ return false; } })();
const SHADE = {e: 0, kind: '', hold: 0, age: 0};
function shadeCue(kind, power){
  if(!(power > 0)) return;
  SHADE.kind = kind; SHADE.e = Math.max(SHADE.e, Math.min(1, power)); SHADE.age = 0;
}
function shadeFrame(dt){
  SHADE.hold *= Math.exp(-dt * 4.2);
  const e = Math.max(SHADE.hold, SHADE.e);
  SHADE.e *= Math.exp(-dt * (SHADE.kind === 'impact' ? 2.1 : 3.6));
  SHADE.age += dt;
  if(!postOK || window.__NOPOST || e < .015){
    if(cv._sh){ cv.style.transform = ''; cv._sh = 0; }
    return;
  }
  const kind = SHADE.kind;
  if(!postCv){ postCv = document.createElement('canvas'); postCtx = postCv.getContext('2d'); }
  const w = Math.max(2, Math.round(W * .25)), h = Math.max(2, Math.round(H * .25));
  if(w !== postW || h !== postH){ postW = w; postH = h; postCv.width = w; postCv.height = h; }
  if((postTick++ % 3) === 0){
    postCtx.setTransform(1, 0, 0, 1, 0, 0);
    postCtx.globalCompositeOperation = 'source-over';
    postCtx.clearRect(0, 0, postW, postH);
    postCtx.filter = 'blur(4px) brightness(1.45) saturate(.85)';
    postCtx.drawImage(cv, 0, 0, postW, postH);
    postCtx.filter = 'none';
  }
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = .12 + e * .5;
  ctx.drawImage(postCv, 0, 0, W, H);
  // chromatic split, a lens artefact rather than a constant filter
  if(e > .1){
    const off = 1.2 + e * 8;
    ctx.globalAlpha = .08 + e * .46;
    ctx.filter = 'hue-rotate(-16deg) saturate(1.7)';
    ctx.drawImage(postCv, -off, -off * .18, W, H);
    ctx.globalAlpha = .08 + e * .4;
    ctx.filter = 'hue-rotate(168deg) saturate(1.5)';
    ctx.drawImage(postCv, off, off * .12, W, H);
    ctx.filter = 'none';
  }
  // negative flash with a real grade (kept short, then it releases)
  const inv = (kind === 'switch' || kind === 'impact') ? clamp((e - .35) / .65) * clamp(1 - SHADE.age / .62) : 0;
  if(inv > .01){
    if(!invCv){ invCv = document.createElement('canvas'); invCtx = invCv.getContext('2d'); }
    const iw = Math.max(2, Math.round(W * .5)), ih = Math.max(2, Math.round(H * .5));
    if(invCv.width !== iw || invCv.height !== ih){ invCv.width = iw; invCv.height = ih; }
    invCtx.filter = 'invert(1) contrast(1.25) saturate(.45) brightness(.92)';
    invCtx.drawImage(cv, 0, 0, iw, ih);
    invCtx.filter = 'none';
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = inv * .62;
    ctx.drawImage(invCv, 0, 0, W, H);
  }
  ctx.restore();
  // 3D: the whole frame tips away from the viewer for one beat
  const tilt = e * (kind === 'impact' ? 3.4 : 2.1);
  cv.style.transform = 'perspective(1250px) rotateX(' + tilt.toFixed(2) + 'deg) scale(' + (1 + e * .022).toFixed(3) + ')';
  cv._sh = 1;
}
const CO = {nx:0, ny:-1, side:1};   // route callout orientation (smoothed)
function sphRing(lat, lon, ang, al, lw, cam){
  if(al < .01) return;
  const n = llv(lat, lon), ax = Math.abs(n[1]) < .9 ? [0, 1, 0] : [1, 0, 0];
  let e1 = [n[1]*ax[2] - n[2]*ax[1], n[2]*ax[0] - n[0]*ax[2], n[0]*ax[1] - n[1]*ax[0]];
  const l1 = Math.hypot(e1[0], e1[1], e1[2]); e1 = e1.map(q => q / l1);
  const e2 = [n[1]*e1[2] - n[2]*e1[1], n[2]*e1[0] - n[0]*e1[2], n[0]*e1[1] - n[1]*e1[0]];
  const ca = Math.cos(ang), sa = Math.sin(ang);
  ctx.strokeStyle = 'rgba(226,206,172,' + al.toFixed(3) + ')'; ctx.lineWidth = lw;
  ctx.beginPath(); let st = false;
  for(let k = 0; k <= 90; k++){
    const th = k / 90 * 6.2832, c_ = Math.cos(th) * sa, s_ = Math.sin(th) * sa;
    const v = rotV([n[0]*ca + e1[0]*c_ + e2[0]*s_, n[1]*ca + e1[1]*c_ + e2[1]*s_, n[2]*ca + e1[2]*c_ + e2[2]*s_], 1.1);
    if(v[2] < 0){ st = false; continue; }
    const p = project(v[0], v[1], v[2], cam); if(!p){ st = false; continue; }
    if(st) ctx.lineTo(p[0], p[1]); else { ctx.moveTo(p[0], p[1]); st = true; }
  }
  ctx.stroke(); ctx.lineWidth = 1;
}

/* ---------- WebGL atmosphere shader for the globe ----------
   A real fragment shader behind the particle canvas: fresnel rim light,
   slow aurora noise inside the sphere, a warm wavefront that follows the
   country count, and a light that shifts with camera motion.           */
const GLP = {on:false, cx:0, cy:0, R:0, a:0, wx:0, wy:0, wa:0, wAng:0, zoom:1, motion:0};
const GLX = (() => {
  const cv = document.getElementById('filmGl'); if(!cv) return null;
  let gl = null;
  try { gl = cv.getContext('webgl', {alpha:true, premultipliedAlpha:true, antialias:false, depth:false}); } catch(e){}
  if(!gl) return null;
  const vs = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
  const fs = `precision mediump float;
uniform vec2 uRes;uniform vec2 uC;uniform float uR;uniform float uT;uniform float uA;
uniform vec3 uW;uniform float uWA;uniform float uZ;uniform float uM;
float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
 return mix(mix(h(i),h(i+vec2(1.,0.)),f.x),mix(h(i+vec2(0.,1.)),h(i+vec2(1.,1.)),f.x),f.y);}
float fbm(vec2 p){float s=0.,a=.5;for(int k=0;k<3;k++){s+=a*n(p);p=p*2.03+vec2(1.7,9.2);a*=.5;}return s;}
void main(){
 vec2 p=vec2(gl_FragCoord.x,uRes.y-gl_FragCoord.y);
 vec2 q=(p-uC)/uR; float d=length(q);
 vec3 sage=vec3(.58,.68,.60), sand=vec3(.82,.71,.55), ink=vec3(.20,.24,.27);
 float inside=1.-smoothstep(.985,1.005,d);
 vec2 L=normalize(vec2(-.55+uM*.4,-.8)); float lit=clamp(dot(q,L)*.55+.5,0.,1.);
 float rim=exp(-max(d-1.,0.)*9.)*smoothstep(.78,1.,d);
 float fres=pow(clamp(d,0.,1.),2.6)*inside;
 float z0=1./max(uZ,1.);
 vec3 col=mix(sage,sand,.2+.25*lit)*(rim*.24+fres*.11)*(.4+.7*lit)*(.45+.55*z0);
 float z=1./max(uZ,1.);
 vec2 fp=q*2.4+vec2(uT*.035,-uT*.02);
 float a=fbm(fp+vec2(n(fp*1.3-uT*.03))*1.2);
 col+=mix(ink,sage,lit)*smoothstep(.45,.9,a)*inside*.085*z*(1.-d*.35);
 col+=ink*inside*.05*(1.-lit);
 float wd=length(p-uW.xy), wr=wd-uW.z, ww=3.+uW.z*.03;
 col+=sand*exp(-wr*wr/(2.*ww*ww))*uWA*inside*.22;
 col+=sand*step(wr,0.)*uWA*inside*.03;
 col+=sage*exp(-max(d-1.,0.)*3.2)*step(1.,d)*.04*z0;
 col*=uA;
 col+=(h(p+fract(uT*7.)*97.)-.5)*.012*uA;
 col=max(col,0.);
 gl_FragColor=vec4(col,max(max(col.r,col.g),col.b));
}`;
  const sh = (t, src) => { const s_ = gl.createShader(t); gl.shaderSource(s_, src); gl.compileShader(s_); return gl.getShaderParameter(s_, gl.COMPILE_STATUS) ? s_ : null; };
  const v = sh(gl.VERTEX_SHADER, vs), f = sh(gl.FRAGMENT_SHADER, fs); if(!v || !f) return null;
  const pr = gl.createProgram(); gl.attachShader(pr, v); gl.attachShader(pr, f); gl.linkProgram(pr);
  if(!gl.getProgramParameter(pr, gl.LINK_STATUS)) return null;
  gl.useProgram(pr);
  const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const U = {}; ['uRes','uC','uR','uT','uA','uW','uWA','uZ','uM'].forEach(k => U[k] = gl.getUniformLocation(pr, k));
  return {cv, gl, U, k: .34, w: 0, h: 0, shown: false, last: 0, dts: 0, nf: 0, off: false};
})();
function renderGL(t){
  if(!GLX || GLX.off) return;
  // adaptive quality: if frames get slow while the shader runs, halve its resolution, then drop it
  const now_ = performance.now();
  if(GLX.shown && GLX.last){ GLX.dts += now_ - GLX.last; GLX.nf++; }
  GLX.last = now_;
  if(GLX.nf >= 45){
    const avg = GLX.dts / GLX.nf; GLX.dts = 0; GLX.nf = 0;
    if(avg > 40){ if(GLX.k > .2) GLX.k = .2; else { GLX.off = true; GLX.cv.style.visibility = 'hidden'; return; } }
  }
  const {cv, gl, U} = GLX;
  if(!GLP.on || GLP.a < .01){
    if(GLX.shown){ gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); cv.style.visibility = 'hidden'; GLX.shown = false; }
    return;
  }
  if(!GLX.shown){ cv.style.visibility = 'visible'; GLX.shown = true; }
  const k = GLX.k, w = Math.max(2, Math.round(W * k)), h = Math.max(2, Math.round(H * k));
  if(w !== GLX.w || h !== GLX.h){ GLX.w = cv.width = w; GLX.h = cv.height = h; gl.viewport(0, 0, w, h); }
  gl.uniform2f(U.uRes, w, h); gl.uniform2f(U.uC, GLP.cx * k, GLP.cy * k); gl.uniform1f(U.uR, Math.max(4, GLP.R * k));
  gl.uniform1f(U.uT, t); gl.uniform1f(U.uA, GLP.a); gl.uniform1f(U.uZ, GLP.zoom); gl.uniform1f(U.uM, GLP.motion);
  gl.uniform3f(U.uW, GLP.wx * k, GLP.wy * k, GLP.wAng * GLP.R * k); gl.uniform1f(U.uWA, GLP.wa);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

function renderWorld(T, t, dt, blobState){
  if(!cPrep) prepCountries();
  GLP.on = false;
  const Tw = T + 1.0;
  let bI = chOf(Tw), aI = clamp(bI - 1, 0, NCH - 1);
  let m = sm((Tw - CS[bI]) / 2.8);
  if(bI === 0) { aI = 0; m = 1; }
  const wts = new Float32Array(NCH); wts[aI] += 1 - m; wts[bI] += m;

  // camera blend + subtle drift + pointer parallax
  const ca = CAM[aI], cb = CAM[bI], mm = smr(m);
  const c = chOf(clamp(T, 0, T1)), u = T - CS[c];
  const bAge = (performance.now() - burstT) / 1000;
  const punch = (bAge > 0 && bAge < 1.2 && connected) ? Math.exp(-bAge * 4.2) : 0;
  let yaw = lerp(ca.yaw, cb.yaw, mm) + Math.sin(t * .07) * .05 + smx * .32 + (u - 5) * .012;
  // motivated orbit: the camera never sits still, it circles the subject slowly
  yaw += Math.sin(t * .13 + c * 1.7) * .085 * (1 - J.w * .75);
  let pitchDrift = Math.cos(t * .1 + c * 2.1) * .055 * (1 - J.w * .7);
  if(punch > .001) yaw += punch * .03 * Math.sin(t * 22);
  let pitch = lerp(ca.pitch, cb.pitch, mm) + smy * .18 + pitchDrift;
  if(wts[0] > 0) yaw += t * .03 * wts[0];
  const pulse = 1 - .07 * gauss(u, 3.35, .22) + .05 * gauss(u, 4.55, .3);

  const dist = lerp(ca.dist, cb.dist, mm);
  // shape centre drifts toward the free area while a card is open
  const open = blobState.o;
  let ox = mobile ? W / 2 : W * (.5 - .03 * open);
  let oy = mobile ? lerp(H * .45, H * .3, open) : H * .5;
  // route sequence: the camera locks onto the travelling point and dollies in
  const jw = J.w;
  if(jw > 0){
    yaw = lerp(yaw, smx * .07, jw); pitch = lerp(pitch, smy * .05, jw);
    ox = lerp(ox, W / 2, jw); oy = lerp(oy, H * (mobile ? .47 : .5), jw);
  }
  // count progress for chapter 4 (same easing as the on-screen counter)
  if(c === 3){ const ug_ = genU(3, u); geoCountP = clamp((ug_ - 4.35) / COUNT_DUR); }
  else geoCountP = c > 3 ? 1 : 0;
  // slow, motivated zooms: every chapter breathes in while you read it and eases
  // back out before the hand-off; the globe pulls back while the countries light up
  const chLen = (CS[c + 1] || T1) - CS[c];
  const kb = 1 + .055 * sm(u / 4.5) * (1 - sm((u - chLen + 3.2) / 3.0)) * (1 - jw);
  const cz = c === 3 ? 1 - .1 * sm(geoCountP / .45) * (1 - .55 * sm((geoCountP - .5) / .5)) : 1;
  const cam = {cy: Math.cos(yaw), sy: Math.sin(yaw), cp: Math.cos(pitch), sp: Math.sin(pitch), dist,
    S: S * kb * cz * lerp(ca.sc, cb.sc, mm) * pulse * (1 + punch * .16) * (mobile ? lerp(1, .62, open * (1 - jw)) : 1) * J.z, ox, oy};

  // globe target
  if(wts[3] > 0){
    const g = GEO[geoSel];
    let mlon = (ME.lon + g.lon) / 2; if(Math.abs(ME.lon - g.lon) > 180) mlon += 180;
    gYawT = -mlon * Math.PI / 180; gPitchT = ((ME.lat + g.lat) / 2) * Math.PI / 180 * .85;
    let d = gYawT - gYaw; while(d > Math.PI) d -= 2 * Math.PI; while(d < -Math.PI) d += 2 * Math.PI;
    const k = 1 - Math.exp(-dt * 2.4);
    gYaw += d * k + (wts[3] < .99 ? dt * .25 * (1 - wts[3]) : 0); gPitch += (gPitchT - gPitch) * k;
  }
  const freeYaw = gYaw, freePitch = gPitch;
  if(J.w > 0){
    let d = -J.lon - gYaw; while(d > Math.PI) d -= 2 * Math.PI; while(d < -Math.PI) d += 2 * Math.PI;
    gYaw = freeYaw + d * J.w; gPitch = lerp(freePitch, J.lat, J.w);
  }
  RY = gYaw; RP = gPitch; lastCam = cam;
  if(wts[2] > 0) tunFlow = t * .55 + (T - 20) * .5;
  if(wts[4] > 0){ spFlow = t * .85 + (T - CS[4]) * .35; SP_X = mobile ? 0 : -.4; }
  for(let k = 0; k < 10; k++) devGlow[k] += ((devOn[k] ? 1 : 0) - devGlow[k]) * (1 - Math.exp(-dt * 5));

  ctx.clearRect(0, 0, W, H);
  for(let k = 0; k < 8; k++) paths[k] = new Path2D();
  const warpW = wts[4];
  const baseSz = mobile ? 1.5 : 1.35;
  for(let i = 0; i < N; i++){
    const delay = R4[i] * .45;
    const e = smr((m * 1.45 - delay));
    let x, y, z, hi;
    if(e <= 0 || aI === bI){
      hi = shapePos(aI === bI ? bI : aI, i, t, T); x = out[0]; y = out[1]; z = out[2];
    } else if(e >= 1){
      hi = shapePos(bI, i, t, T); x = out[0]; y = out[1]; z = out[2];
    } else {
      shapePos(aI, i, t, T); const ax = out[0], ay = out[1], az = out[2];
      hi = shapePos(bI, i, t, T);
      const sw = Math.sin(Math.PI * e) * .55;
      x = ax + (out[0] - ax) * e + Math.sin(R1[i] * 40 + t) * sw;
      y = ay + (out[1] - ay) * e + Math.cos(R2[i] * 40 + t) * sw * .7;
      z = az + (out[2] - az) * e + Math.sin(R3[i] * 40) * sw;
    }
    const p = project(x, y, z, cam);
    if(!p){ SV[i] = 0; continue; }
    SV[i] = 1; SX[i] = p[0]; SY[i] = p[1]; SZ[i] = p[2];
    let a = clamp(1.3 - p[2] / (dist * 1.55));
    // hide globe back side
    if(wts[3] > 0 && z < 0 && (aI === 3 || bI === 3)) a *= 1 - wts[3] * .82;
    if(p[2] < .6) a *= clamp((p[2] - .22) / .38);
    const bk = Math.min(3, Math.floor(a * 4));
    if(a < .05) continue;
    let sz = baseSz * (p[3] / cam.S) * (.55 + R4[i] * .9) * (1 + (J.z - 1) * .4);
    sz = clamp(sz, .5, 4.2);
    const wlen = (warpW > .01 && bI !== 4 && aI !== 4) ? sz * (1 + warpW * 3.2 * (.4 + R3[i])) : sz;
    paths[bk + (hi ? 4 : 0)].rect(p[0] - wlen / 2, p[1] - sz / 2, wlen, sz);
  }
  const tA_ = TINT[aI], tB_ = TINT[bI], hA = HI[aI], hB = HI[bI];
  const col = [0, 1, 2].map(k => Math.round(lerp(tA_[k], tB_[k], mm)));
  const hcol = [0, 1, 2].map(k => Math.round(lerp(hA[k], hB[k], mm)));
  for(let k = 0; k < 4; k++){
    ctx.fillStyle = 'rgba(' + col[0] + ',' + col[1] + ',' + col[2] + ',' + ALPHA[k] * .8 + ')';
    ctx.fill(paths[k]);
    ctx.fillStyle = 'rgba(' + hcol[0] + ',' + hcol[1] + ',' + hcol[2] + ',' + Math.min(1, ALPHA[k] * 1.15) + ')';
    ctx.fill(paths[k + 4]);
  }

  // ---------- 3D typography & overlays per shape ----------
  ctx.textBaseline = 'middle';
  if(wts[0] > .02){ // floating exposed data labels anchored to particles
    ctx.textAlign = 'left';
    FIELD_LABELS.forEach((txt, k) => {
      const i = (k * 131 + 17) % N; if(!SV[i]) return;
      const cdx = (SX[i] - W / 2) / (W * .34), cdy = (SY[i] - H * .5) / (H * .26);
      const clear = blobState.hl ? clamp(Math.hypot(cdx, cdy) - .55) : 1;
      const dim = T < CL[0] ? 1 - .5 * clamp((T - 4.2) / 1.2) : 1;
      const a = wts[0] * dim * clamp(1.4 - SZ[i] / (dist * 1.3)) * (.55 + .45 * Math.sin(t * .8 + k)) * (.15 + .85 * clear);
      if(a < .04) return;
      const fs = clamp(11 * cam.S * dist / SZ[i] / cam.S, 9, 15);
      ctx.font = '500 ' + fs.toFixed(1) + 'px ui-monospace,Menlo,Consolas,monospace';
      ctx.fillStyle = 'rgba(214,196,168,' + (a * .85).toFixed(3) + ')';
      ctx.strokeStyle = 'rgba(214,196,168,' + (a * .35).toFixed(3) + ')';
      ctx.beginPath(); ctx.moveTo(SX[i], SY[i]); ctx.lineTo(SX[i] + 14, SY[i] - 10); ctx.lineTo(SX[i] + 22, SY[i] - 10); ctx.stroke();
      ctx.beginPath(); ctx.arc(SX[i], SY[i], 2.2, 0, 6.283); ctx.fill();
      ctx.fillText(txt, SX[i] + 26, SY[i] - 10);
    });
  }
  if(wts[1] > .02){ // cipher fragments riding the orbit
    ctx.textAlign = 'center';
    SPH_WORDS.forEach((w, k) => {
      const a0 = k / SPH_WORDS.length * 6.2832 + t * .35;
      const x = Math.cos(a0) * 1.62, z0 = Math.sin(a0) * 1.62, ct = Math.cos(.42), st = Math.sin(.42);
      const p = project(x, -z0 * st, z0 * ct, cam); if(!p) return;
      const a = wts[1] * clamp(1.5 - p[2] / (dist * 1.2));
      ctx.font = '600 ' + clamp(12 * p[3] / cam.S, 8, 16).toFixed(1) + 'px ui-monospace,Menlo,Consolas,monospace';
      ctx.fillStyle = 'rgba(190,206,190,' + (a * .7).toFixed(3) + ')';
      ctx.fillText(w, p[0], p[1]);
    });
  }
  if(wts[2] > .02){ // words flying through the tunnel toward the camera
    ctx.textAlign = 'center';
    TUN_WORDS.forEach((w, k) => {
      const L = 9; let z = ((k / TUN_WORDS.length) * L + tunFlow * 1.0) % L; z = z - L + 2.1;
      const ang = k * 2.1 + .6;
      const p = project(Math.cos(ang) * .62, Math.sin(ang) * .42, z, cam); if(!p) return;
      let a = wts[2] * clamp((p[2] - .35) / .8) * clamp(1.6 - p[2] / 4);
      if(a < .03) return;
      ctx.font = '700 ' + clamp(15 * p[3] / cam.S, 7, 64).toFixed(1) + 'px ' + getComputedStyleFont;
      ctx.fillStyle = 'rgba(200,214,226,' + (a * .75).toFixed(3) + ')';
      ctx.fillText(w.toUpperCase(), p[0], p[1]);
    });
  }
  if(wts[3] > .02){ // globe: you, servers, arc with a travelling packet
    const toV = (lat, lon, r) => { const la = lat * Math.PI / 180, lo = lon * Math.PI / 180 + gYaw, cl = Math.cos(la);
      const x = cl * Math.sin(lo), y = Math.sin(la), z = cl * Math.cos(lo), cp = Math.cos(gPitch), sp = Math.sin(gPitch);
      return [x * r, (y * cp - z * sp) * r, (y * sp + z * cp) * r]; };
    const a0 = wts[3];
    {
      const pc0 = project(0, 0, 0, cam);
      GLP.on = !!pc0; GLP.a = a0; GLP.wa = 0;
      if(pc0){ GLP.cx = pc0[0]; GLP.cy = pc0[1]; GLP.R = 1.1 * pc0[3]; }
      GLP.zoom = J.z; GLP.motion = Math.min(1, SHADE.e + SHADE.hold);
      const vme = toV(ME.lat, ME.lon, 1.1), pme = project(vme[0], vme[1], vme[2], cam);
      if(pme){ GLP.wx = pme[0]; GLP.wy = pme[1]; }
    }
    ctx.textAlign = 'left';
    GEO.forEach((g, k) => {
      const v = toV(g.lat, g.lon, 1.1); if(v[2] < 0) return;
      const p = project(v[0], v[1], v[2], cam); if(!p) return;
      const sel = k === geoSel;
      ctx.fillStyle = sel ? 'rgba(205,220,204,' + a0 + ')' : 'rgba(214,212,204,' + (a0 * .5) + ')';
      ctx.beginPath(); ctx.arc(p[0], p[1], sel ? 3.6 : 2.4, 0, 6.283); ctx.fill();
      if(sel){ ctx.strokeStyle = 'rgba(169,183,169,' + (a0 * .5) + ')'; ctx.beginPath(); ctx.arc(p[0], p[1], 8 + Math.sin(t * 3) * 2, 0, 6.283); ctx.stroke(); }
      ctx.font = (sel ? '600 13px ' : '500 11px ') + getComputedStyleFont;
      ctx.fillStyle = sel ? 'rgba(235,232,225,' + a0 + ')' : 'rgba(200,198,190,' + (a0 * .55) + ')';
      ctx.fillText(g.city, p[0] + 10, p[1] - 1);
    });
    const vm = toV(ME.lat, ME.lon, 1.1);
    const pm = vm[2] > -.1 ? project(vm[0], vm[1], vm[2], cam) : null;
    if(pm){
      ctx.fillStyle = 'rgba(226,200,170,' + a0 + ')';
      ctx.beginPath(); ctx.arc(pm[0], pm[1], 3.6, 0, 6.283); ctx.fill();
      ctx.font = '600 12px ' + getComputedStyleFont; ctx.textAlign = 'right';
      ctx.fillText('Вы · ' + ME.name, pm[0] - 10, pm[1] - 1);
    }
    // ---- route sequence: detailed map, graticule, cities (only while the camera is in close) ----
    if(J.w > .02){
      if(detailKey !== geoSel) buildDetail();
      const dw = J.w * a0;
      // graticule
      ctx.strokeStyle = 'rgba(214,212,204,' + (dw * .07).toFixed(3) + ')'; ctx.lineWidth = 1;
      ctx.beginPath();
      for(let lat = -60; lat <= 75; lat += 10){
        let pen = false;
        for(let lon = -180; lon <= 180; lon += 4){
          const v = rotV(llv(lat, lon), 1.1); if(v[2] < .05){ pen = false; continue; }
          const p = project(v[0], v[1], v[2], cam); if(!p){ pen = false; continue; }
          if(pen) ctx.lineTo(p[0], p[1]); else { ctx.moveTo(p[0], p[1]); pen = true; }
        }
      }
      for(let lon = -180; lon < 180; lon += 10){
        let pen = false;
        for(let lat = -70; lat <= 80; lat += 4){
          const v = rotV(llv(lat, lon), 1.1); if(v[2] < .05){ pen = false; continue; }
          const p = project(v[0], v[1], v[2], cam); if(!p){ pen = false; continue; }
          if(pen) ctx.lineTo(p[0], p[1]); else { ctx.moveTo(p[0], p[1]); pen = true; }
        }
      }
      ctx.stroke();
      // fine land dots
      const pA = new Path2D(), pB = new Path2D();
      const cp = Math.cos(RP), sp = Math.sin(RP), dsz = 1.15 + (J.z - 1) * .35;
      for(let k = 0; k < detail.length; k += 2){
        const la = detail[k] * D2R, lo = detail[k + 1] * D2R + RY, cl = Math.cos(la);
        const x = cl * Math.sin(lo), y = Math.sin(la), z = cl * Math.cos(lo);
        const zz = y * sp + z * cp; if(zz < .08) continue;
        const p = project(x * 1.1, (y * cp - z * sp) * 1.1, zz * 1.1, cam); if(!p) continue;
        if(p[0] < -10 || p[0] > W + 10 || p[1] < -10 || p[1] > H + 10) continue;
        (zz > .55 ? pA : pB).rect(p[0] - dsz / 2, p[1] - dsz / 2, dsz, dsz);
      }
      ctx.fillStyle = 'rgba(214,212,204,' + (dw * .42).toFixed(3) + ')'; ctx.fill(pA);
      ctx.fillStyle = 'rgba(214,212,204,' + (dw * .2).toFixed(3) + ')'; ctx.fill(pB);
      // neighbouring cities (context for ordinary people: "this is Europe")
      if(J.w > .3){
        ctx.font = '500 11px ' + getComputedStyleFont; ctx.textAlign = 'left';
        const ca_ = clamp((J.w - .3) / .4) * a0;
        EU_CITIES.forEach(cty => {
          if(cty[0] === ME.name || cty[0] === GEO[geoSel].city) return;
          const v = rotV(llv(cty[1], cty[2]), 1.1); if(v[2] < .2) return;
          const p = project(v[0], v[1], v[2], cam); if(!p || p[0] < 0 || p[0] > W || p[1] < 0 || p[1] > H) return;
          ctx.fillStyle = 'rgba(200,198,190,' + (ca_ * .5).toFixed(3) + ')';
          ctx.beginPath(); ctx.arc(p[0], p[1], 1.8, 0, 6.283); ctx.fill();
          ctx.fillStyle = 'rgba(200,198,190,' + (ca_ * .38).toFixed(3) + ')';
          ctx.fillText(cty[0], p[0] + 6, p[1]);
        });
      }
    }
    // ---- great-circle route ----
    const g = GEO[geoSel];
    const A = llv(ME.lat, ME.lon), B = llv(g.lat, g.lon);
    const om = Math.acos(clamp(A[0] * B[0] + A[1] * B[1] + A[2] * B[2], -1, 1));
    const grow = Math.min(clamp((performance.now() - arcStart) / 900), J.arc);
    const steps = 72, rp = [];
    for(let s = 0; s <= steps; s++){
      const f = s / steps, v0 = slerpV(A, B, om, f), v = rotV(v0, routeLift(f, om));
      rp.push(v[2] > -.15 ? project(v[0], v[1], v[2], cam) : null);
    }
    if(J.w > .01){ // planned route: dashed, faint
      ctx.setLineDash([3, 7]); ctx.lineDashOffset = -t * 14;
      ctx.strokeStyle = 'rgba(214,212,204,' + (a0 * .28 * J.w).toFixed(3) + ')'; ctx.lineWidth = 1.2;
      ctx.beginPath(); let st = false;
      rp.forEach(p => { if(!p){ st = false; return; } if(st) ctx.lineTo(p[0], p[1]); else { ctx.moveTo(p[0], p[1]); st = true; } });
      ctx.stroke(); ctx.setLineDash([]);
    }
    if(grow > 0){
      ctx.lineWidth = 1.4 + J.w * 1.2; ctx.strokeStyle = 'rgba(190,206,190,' + (a0 * .85) + ')';
      ctx.beginPath(); let st = false;
      const lim = Math.floor(steps * grow);
      for(let s = 0; s <= lim; s++){ const p = rp[s]; if(!p){ st = false; continue; } if(st) ctx.lineTo(p[0], p[1]); else { ctx.moveTo(p[0], p[1]); st = true; } }
      // exact head
      if(grow < 1 && st){ const f = grow, v = rotV(slerpV(A, B, om, f), routeLift(f, om)), p = project(v[0], v[1], v[2], cam); if(p) ctx.lineTo(p[0], p[1]); }
      ctx.stroke(); ctx.lineWidth = 1;
    }
    // Lettering is physically anchored to the route. It writes in the same
    // direction as the packet, and its tangent supplies the glyph rotation.
    const routeText = 'ЗАШИФРОВАННЫЙ МАРШРУТ';
    const written = Math.floor(routeText.length * (J.lw || 0));
    if(written > 0 && J.w > .2){
      ctx.save(); ctx.font = '700 9px ' + getComputedStyleFont; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(224,229,220,' + (a0 * .72 * J.w).toFixed(3) + ')';
      for(let k = 0; k < written; k++){
        const f = .12 + k / Math.max(1, routeText.length - 1) * .76;
        const si = Math.max(1, Math.min(steps - 1, Math.round(f * steps))), p = rp[si], p0 = rp[si - 1], p1 = rp[si + 1];
        if(!p || !p0 || !p1) continue;
        const ang = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]);
        ctx.save(); ctx.translate(p[0], p[1]); ctx.rotate(ang); ctx.fillText(routeText[k], 0, -10); ctx.restore();
      }
      // camera-follow reticle rides the writing head, making the tracking explicit
      const hi = Math.max(1, Math.min(steps - 1, Math.round((.12 + (J.lw || 0) * .76) * steps))), hp = rp[hi];
      if(hp && J.lw < .99){ ctx.strokeStyle = 'rgba(190,206,190,.55)'; ctx.beginPath(); ctx.arc(hp[0], hp[1], 7, 0, 6.283); ctx.stroke(); }
      ctx.restore();
    }
    // travelling packet (idle loop, only when the camera is out)
    if(grow >= 1 && J.w < .2){
      const pk = rp[Math.floor(((t * .45) % 1) * steps)];
      if(pk){
        const gr = ctx.createRadialGradient(pk[0], pk[1], 0, pk[0], pk[1], 14);
        gr.addColorStop(0, 'rgba(215,226,213,' + (a0 * (1 - J.w * 5)) + ')'); gr.addColorStop(1, 'rgba(169,183,169,0)');
        ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(pk[0], pk[1], 14, 0, 6.283); ctx.fill();
      }
    }
    // ---- impacts: landing at "you", shockwave at the server ----
    if(J.on){
      const uu = J.u;
      const ring = (lat, lon, ang, al, lw) => {
        if(al < .01) return;
        const n = llv(lat, lon), ax = Math.abs(n[1]) < .9 ? [0, 1, 0] : [1, 0, 0];
        let e1 = [n[1] * ax[2] - n[2] * ax[1], n[2] * ax[0] - n[0] * ax[2], n[0] * ax[1] - n[1] * ax[0]];
        const l1 = Math.hypot(e1[0], e1[1], e1[2]); e1 = e1.map(q => q / l1);
        const e2 = [n[1] * e1[2] - n[2] * e1[1], n[2] * e1[0] - n[0] * e1[2], n[0] * e1[1] - n[1] * e1[0]];
        const ca = Math.cos(ang), sa = Math.sin(ang);
        ctx.strokeStyle = 'rgba(205,220,204,' + al.toFixed(3) + ')'; ctx.lineWidth = lw;
        ctx.beginPath(); let st = false;
        for(let k = 0; k <= 56; k++){
          const th = k / 56 * 6.2832, c_ = Math.cos(th) * sa, s_ = Math.sin(th) * sa;
          const v = rotV([n[0] * ca + e1[0] * c_ + e2[0] * s_, n[1] * ca + e1[1] * c_ + e2[1] * s_, n[2] * ca + e1[2] * c_ + e2[2] * s_], 1.1);
          if(v[2] < 0){ st = false; continue; }
          const p = project(v[0], v[1], v[2], cam); if(!p){ st = false; continue; }
          if(st) ctx.lineTo(p[0], p[1]); else { ctx.moveTo(p[0], p[1]); st = true; }
        }
        ctx.stroke(); ctx.lineWidth = 1;
      };
      const a1 = uu - 4.38;
      if(a1 > 0 && a1 < 1.3){ ring(ME.lat, ME.lon, .006 + eOut3(a1 / 1.3) * .07, (1 - a1 / 1.3) * .8 * a0, 1.5); ring(ME.lat, ME.lon, .004 + eOut3(clamp((a1 - .15) / 1.15)) * .045, (1 - a1 / 1.3) * .5 * a0, 1); }
      const a2 = uu - 5.84;
      if(a2 > 0 && a2 < 1.8){
        for(let k = 0; k < 3; k++){ const ak = a2 - k * .14; if(ak > 0) ring(g.lat, g.lon, .006 + eOut3(ak / 1.5) * (.1 + k * .05), clamp(1 - ak / 1.5) * (.9 - k * .2) * a0, 1.8 - k * .4); }
        // spark burst along the surface
        const vC = rotV(B, 1.1), pc = project(vC[0], vC[1], vC[2], cam);
        if(pc){
          const fl = gauss(a2, .06, .12);
          if(fl > .02){
            const gr = ctx.createRadialGradient(pc[0], pc[1], 0, pc[0], pc[1], 120);
            gr.addColorStop(0, 'rgba(225,234,222,' + (fl * .55) + ')'); gr.addColorStop(1, 'rgba(169,183,169,0)');
            ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(pc[0], pc[1], 120, 0, 6.283); ctx.fill();
          }
          const sp_ = clamp(1 - a2 / 1.2);
          if(sp_ > 0){
            ctx.strokeStyle = 'rgba(215,226,213,' + (sp_ * .75 * a0).toFixed(3) + ')'; ctx.lineWidth = 1.3; ctx.lineCap = 'round';
            ctx.beginPath();
            for(let k = 0; k < 26; k++){
              const th = k / 26 * 6.2832 + R1[k] * .4, sp2 = (.5 + R2[k]) * J.z;
              const r0 = eOut3(a2 / 1.2) * 70 * sp2, r1 = r0 + 4 + 14 * sp_ * sp2;
              ctx.moveTo(pc[0] + Math.cos(th) * r0, pc[1] + Math.sin(th) * r0 * .82);
              ctx.lineTo(pc[0] + Math.cos(th) * r1, pc[1] + Math.sin(th) * r1 * .82);
            }
            ctx.stroke(); ctx.lineWidth = 1; ctx.lineCap = 'butt';
          }
        }
      }
    }
    // ---- 105 countries light up, spreading out from you ----
    {
      const litF = COUNTRIES.length * eOut3(geoCountP);
      const counting = geoCountP > 0 && geoCountP < 1;
      if(litF > .01){
        // a soft wavefront on the sphere surface marks the frontier of the count
        if(counting){
          const fr = COUNTRIES[Math.min(COUNTRIES.length - 1, Math.floor(litF))][3];
          sphRing(ME.lat, ME.lon, Math.min(3.1, fr + .02), a0 * .32 * Math.sin(Math.PI * geoCountP), 1.1, cam);
          GLP.wa = Math.sin(Math.PI * geoCountP); GLP.wAng = fr;
        }
        const tw = 1 - J.w;
        const nLit = Math.min(COUNTRIES.length, Math.ceil(litF));
        ctx.font = '500 11px ' + getComputedStyleFont; ctx.textAlign = 'left';
        for(let k = 0; k < nLit; k++){
          const cty = COUNTRIES[k];
          const v = toV(cty[1], cty[2], 1.1); if(v[2] < -.05) continue;
          const p = project(v[0], v[1], v[2], cam); if(!p) continue;
          const face = clamp(v[2] / .35 + .15);
          const age = litF - k, ap = clamp(age / 2.5);
          const al = a0 * tw * face;
          if(al < .02) continue;
          // the marker: a tiny beacon with a short-lived ring when it first lights
          const tws = .8 + .2 * Math.sin(t * 2.1 + k * 1.7);
          // a thin great-circle thread from you to each newly lit country
          if(age < 7 && counting){
            const A_ = llv(ME.lat, ME.lon), B_ = llv(cty[1], cty[2]), om_ = cty[3];
            const ta = al * (1 - sm((age - 2) / 5)) * .5, grow_ = eOut3(clamp(age / 2.2));
            if(ta > .02 && om_ > .01){
              ctx.strokeStyle = 'rgba(226,206,172,' + ta.toFixed(3) + ')'; ctx.lineWidth = .8;
              ctx.beginPath(); let st = false;
              for(let s_ = 0; s_ <= 18; s_++){
                const ff = s_ / 18 * grow_, vv = rotV(slerpV(A_, B_, om_, ff), 1.1 + Math.sin(Math.PI * ff) * om_ * .09);
                if(vv[2] < 0){ st = false; continue; }
                const pp = project(vv[0], vv[1], vv[2], cam); if(!pp){ st = false; continue; }
                if(st) ctx.lineTo(pp[0], pp[1]); else { ctx.moveTo(pp[0], pp[1]); st = true; }
              }
              ctx.stroke(); ctx.lineWidth = 1;
            }
          }
          const hr = 7 + 5 * (1 - ap);
          const hg = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], hr);
          hg.addColorStop(0, 'rgba(232,212,176,' + (al * ap * .42 * tws).toFixed(3) + ')'); hg.addColorStop(1, 'rgba(232,212,176,0)');
          ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(p[0], p[1], hr, 0, 6.283); ctx.fill();
          ctx.fillStyle = 'rgba(244,234,214,' + (al * ap * tws).toFixed(3) + ')';
          ctx.beginPath(); ctx.arc(p[0], p[1], 1.7 + ap * .6, 0, 6.283); ctx.fill();
          if(ap < 1){
            ctx.strokeStyle = 'rgba(232,212,176,' + (al * (1 - ap) * .9).toFixed(3) + ')';
            ctx.beginPath(); ctx.arc(p[0], p[1], 2.5 + eOut3(ap) * 15, 0, 6.283); ctx.stroke();
          }
          // name a few of them as they arrive, so the number reads as real places
          if(k % 6 === 0 && age < 16 && face > .5){
            const la = al * sm(age / 2) * (1 - sm((age - 9) / 7));
            if(la > .03){ ctx.fillStyle = 'rgba(232,222,204,' + (la * .85).toFixed(3) + ')'; ctx.fillText(cty[0], p[0] + 6, p[1] - 5); }
          }
        }
      }
    }
    // ---- the route reads its own numbers: distance and IP ride on the line ----
    if(J.on){
      const uu = J.u;
      const vis = a0 * sm((uu - 4.5) / .35) * (1 - sm((uu - 6.25) / .35));
      if(vis > .01){
        const total = kmBetween(ME, g), f = J.tp, arrived = uu >= 5.85;
        const RP_ = ff => { const v = rotV(slerpV(A, B, om, ff), routeLift(ff, om)); return v[2] > -.15 ? project(v[0], v[1], v[2], cam) : null; };
        const head = RP_(f), pa = RP_(Math.min(1, f + .025)), pb = RP_(Math.max(0, f - .025));
        // distance ticks, struck as the point passes them
        const step = [100, 250, 500, 1000, 2000, 2500, 5000].find(v => total / v <= 4.2) || 5000;
        ctx.font = '500 10px ui-monospace,Menlo,Consolas,monospace'; ctx.textAlign = 'center';
        for(let km = step; km < total - step * .4; km += step){
          const fk = km / total; if(fk > f) break;
          const p0 = RP_(fk), p1 = RP_(Math.min(1, fk + .01)); if(!p0 || !p1) continue;
          let tx = p1[0] - p0[0], ty = p1[1] - p0[1]; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
          let nx = -ty, ny = tx; if(ny > 0){ nx = -nx; ny = -ny; }
          const ta = vis * sm((f - fk) * 18);
          ctx.strokeStyle = 'rgba(214,212,204,' + (ta * .55).toFixed(3) + ')';
          ctx.beginPath(); ctx.moveTo(p0[0] - nx * 4, p0[1] - ny * 4); ctx.lineTo(p0[0] + nx * 7, p0[1] + ny * 7); ctx.stroke();
          ctx.fillStyle = 'rgba(214,212,204,' + (ta * .5).toFixed(3) + ')';
          ctx.fillText(km.toLocaleString('ru-RU'), p0[0] + nx * 17, p0[1] + ny * 17);
        }
        // origin: your old address is left behind, struck through
        const vm2 = toV(ME.lat, ME.lon, 1.1), po = vm2[2] > 0 ? project(vm2[0], vm2[1], vm2[2], cam) : null;
        if(po){
          const oa = vis * sm((uu - 4.7) / .4);
          if(oa > .02){
            ctx.font = '500 11px ui-monospace,Menlo,Consolas,monospace'; ctx.textAlign = 'right';
            const txt = MY_IP.replace(/\.\d+\.\d+$/, '.••.••'), tw_ = ctx.measureText(txt).width, ox_ = po[0] - 12, oy_ = po[1] - 30;
            ctx.fillStyle = 'rgba(20,22,24,' + (oa * .7).toFixed(3) + ')'; ctx.beginPath(); if(ctx.roundRect) ctx.roundRect(ox_ - tw_ - 8, oy_ - 11, tw_ + 14, 33, 6); else ctx.rect(ox_ - tw_ - 8, oy_ - 11, tw_ + 14, 33); ctx.fill();
            ctx.fillStyle = 'rgba(214,180,160,' + (oa * .6).toFixed(3) + ')'; ctx.fillText(txt, ox_, oy_);
            ctx.strokeStyle = 'rgba(214,180,160,' + (oa * .7).toFixed(3) + ')';
            const sx = sm((uu - 4.85) / .5);
            ctx.beginPath(); ctx.moveTo(ox_ - tw_ - 2, oy_); ctx.lineTo(ox_ - tw_ - 2 + (tw_ + 4) * sx, oy_); ctx.stroke();
            ctx.font = '500 9.5px ' + getComputedStyleFont; ctx.fillStyle = 'rgba(200,196,188,' + (oa * .45).toFixed(3) + ')';
            ctx.fillText('ваш адрес — скрыт', ox_, oy_ + 14);
          }
        }
        if(head){
          // a stable normal for the callout (smoothed, with hysteresis)
          let tx = 1, ty = 0;
          if(pa && pb){ tx = pa[0] - pb[0]; ty = pa[1] - pb[1]; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl; }
          let nx = -ty, ny = tx; if(ny > 0){ nx = -nx; ny = -ny; }
          CO.nx += (nx - CO.nx) * .12; CO.ny += (ny - CO.ny) * .12;
          const nl = Math.hypot(CO.nx, CO.ny) || 1, NX = CO.nx / nl, NY = CO.ny / nl;
          if(NX > .15) CO.side = 1; else if(NX < -.15) CO.side = -1;
          const L = mobile ? 40 : 58, lx = head[0] + NX * L, ly = head[1] + NY * L;
          // numbers
          const km = Math.round(total * J.arc);
          const newIp = g.ip + '.' + (40 + (geoSel * 37) % 200);
          const ipT = arrived ? newIp : scramble(newIp.padEnd(MY_IP.length, ' '), clamp((f - .15) / .9), 'ipl' + geoSel, MY_IP.padEnd(newIp.length, ' ')).trimEnd();
          const bw = mobile ? 168 : 206, bh = mobile ? 58 : 66, gap = 16;
          let bx = CO.side > 0 ? lx + gap : lx - gap - bw, by = ly - bh / 2;
          bx = clamp(bx, 10, W - bw - 10); by = clamp(by, 70, H - bh - 90);
          const ex = CO.side > 0 ? bx : bx + bw;
          // leader: head -> elbow -> card
          const la = vis * (arrived ? 1 : .9);
          ctx.strokeStyle = 'rgba(214,212,204,' + (la * .5).toFixed(3) + ')'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(head[0] + NX * 9, head[1] + NY * 9); ctx.lineTo(lx, ly); ctx.lineTo(ex, by + bh / 2); ctx.stroke();
          ctx.fillStyle = 'rgba(214,212,204,' + (la * .7).toFixed(3) + ')';
          ctx.beginPath(); ctx.arc(lx, ly, 1.8, 0, 6.283); ctx.fill();
          // the card (draws on with the leader)
          const ca_ = la * sm((uu - 4.6) / .35);
          ctx.save();
          ctx.globalAlpha = ca_;
          ctx.fillStyle = 'rgba(20,22,24,.74)';
          ctx.strokeStyle = arrived ? 'rgba(170,192,170,.55)' : 'rgba(214,212,204,.18)';
          ctx.beginPath();
          if(ctx.roundRect) ctx.roundRect(bx, by, bw, bh, 10); else ctx.rect(bx, by, bw, bh);
          ctx.fill(); ctx.stroke();
          // progress hairline along the card's bottom = share of the route covered
          ctx.fillStyle = 'rgba(190,206,190,.75)'; ctx.fillRect(bx + 12, by + bh - 6, (bw - 24) * J.arc, 1.2);
          ctx.fillStyle = 'rgba(214,212,204,.12)'; ctx.fillRect(bx + 12 + (bw - 24) * J.arc, by + bh - 6, (bw - 24) * (1 - J.arc), 1.2);
          ctx.textAlign = 'left';
          ctx.font = '600 ' + (mobile ? 19 : 22) + 'px ' + getComputedStyleFont;
          ctx.fillStyle = 'rgba(238,235,228,.96)';
          const kmS = km.toLocaleString('ru-RU');
          ctx.fillText(kmS, bx + 12, by + (mobile ? 18 : 21));
          const kw = ctx.measureText(kmS).width;
          ctx.font = '500 11px ' + getComputedStyleFont; ctx.fillStyle = 'rgba(214,212,204,.6)';
          ctx.fillText('км ' + (arrived ? '· пинг ' + g.ping + ' мс' : 'из ' + total.toLocaleString('ru-RU')), bx + 16 + kw, by + (mobile ? 19 : 22));
          ctx.font = '500 ' + (mobile ? 11 : 12) + 'px ui-monospace,Menlo,Consolas,monospace';
          ctx.fillStyle = 'rgba(200,196,188,.55)'; ctx.fillText('IP', bx + 12, by + (mobile ? 38 : 44));
          ctx.fillStyle = arrived ? 'rgba(196,220,194,.98)' : 'rgba(226,206,172,.9)';
          ctx.fillText(ipT, bx + 34, by + (mobile ? 38 : 44));
          ctx.restore();
        }
      }
    }
  }
  if(wts[4] > .02){ // velocity terrain, drawn as perspective wireframe lines
    const a0 = wts[4];
    const ROWS = 9, STEPS = 54, SPANX = 3.5;
    const wave = (x, z) => {
      const ph = (x - spFlow * .55) * 1.35 + z * .55;
      return .34 * Math.sin(ph * .85) + .15 * Math.sin(ph * 2.1 + 1.2) + .08 * Math.sin(ph * 4.4 - z * 1.4);
    };
    const baseY = SP_BASE + .42;
    ctx.save();
    ctx.lineCap = 'round';
    for(let r = 0; r < ROWS; r++){
      const z = (r / (ROWS - 1) - .5) * 2.9;
      const depth = r / (ROWS - 1);
      const al = a0 * (.085 + depth * .27);
      ctx.strokeStyle = 'rgba(196,210,196,' + al.toFixed(3) + ')';
      ctx.lineWidth = .7 + depth * .7;
      ctx.beginPath();
      let pen = false;
      for(let j = 0; j <= STEPS; j++){
        const x = (j / STEPS - .5) * SPANX + SP_X;
        const y = baseY + wave(x, z) * (.7 + depth * .3);
        const p = project(x, y, z, cam);
        if(!p){ pen = false; continue; }
        if(pen) ctx.lineTo(p[0], p[1]); else { ctx.moveTo(p[0], p[1]); pen = true; }
      }
      ctx.stroke();
    }
    // two longitudinal rails tie the rows together like a moving grid
    [0, .5, 1].forEach(k => {
      const x = (k - .5) * SPANX * .92 + SP_X;
      ctx.strokeStyle = 'rgba(196,210,196,' + (a0 * .12).toFixed(3) + ')';
      ctx.lineWidth = .8;
      ctx.beginPath(); let pen = false;
      for(let j = 0; j <= 40; j++){
        const z = (j / 40 - .5) * 2.9;
        const p = project(x, baseY + wave(x, z) * .85 - .30, z, cam);
        if(!p){ pen = false; continue; }
        if(pen) ctx.lineTo(p[0], p[1]); else { ctx.moveTo(p[0], p[1]); pen = true; }
      }
      ctx.stroke();
    });
    // the leading crest: a bright wave that the eye follows
    ctx.strokeStyle = 'rgba(228,238,224,' + (a0 * .62).toFixed(3) + ')';
    ctx.lineWidth = 1.6;
    ctx.beginPath(); let pen = false;
    for(let j = 0; j <= STEPS; j++){
      const x = (j / STEPS - .5) * SPANX + SP_X;
      const z = 1.05;
      const p = project(x, baseY + wave(x, z) * 1.0 + .02, z, cam);
      if(!p){ pen = false; continue; }
      if(pen) ctx.lineTo(p[0], p[1]); else { ctx.moveTo(p[0], p[1]); pen = true; }
    }
    ctx.stroke();
    // level labels
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.font = '500 10.5px ui-monospace,Menlo,Consolas,monospace';
    [0, 50, 100].forEach(v => {
      const y = baseY + (v / 100 - .5) * .9 - .12;
      const pa = project(-1.72 + SP_X, y, -1.45, cam), pb = project(1.78 + SP_X, y, -1.45, cam);
      if(!pa || !pb) return;
      ctx.strokeStyle = 'rgba(200,214,226,' + (a0 * .07).toFixed(3) + ')'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(pa[0], pa[1]); ctx.lineTo(pb[0], pb[1]); ctx.stroke();
      ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(200,214,226,' + (a0 * .32).toFixed(3) + ')';
      ctx.fillText(v + (v === 100 ? ' Мбит/с' : ''), pb[0] + 9, pb[1]);
    });
    // travelling scan
    const sxw = -SPANX / 2 + (((t * .11) % 1) * SPANX) + SP_X;
    const pTop = project(sxw, baseY + .85, -1.45, cam), pBot = project(sxw, baseY - .5, 1.45, cam);
    if(pTop && pBot){
      const gr = ctx.createLinearGradient(0, pTop[1], 0, pBot[1]);
      gr.addColorStop(0, 'rgba(205,220,204,0)');
      gr.addColorStop(.45, 'rgba(205,220,204,' + (a0 * .26).toFixed(3) + ')');
      gr.addColorStop(1, 'rgba(205,220,204,0)');
      ctx.strokeStyle = gr; ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.moveTo(pTop[0], pTop[1]); ctx.lineTo(pBot[0], pBot[1]); ctx.stroke();
    }
    // A readout that sits ON the leading crest (it used to float in the air above
    // the surface: the y was a constant instead of the wave's own height there).
    // The marker rides the same sample the bright line is drawn through, so it is
    // always exactly on the graph — during the whole chapter, not just at the end.
    if(!mobile){
      const cx3 = SP_X + .62, cz3 = 1.05;
      const cy3 = baseY + wave(cx3, cz3) * 1.0 + .02;
      const pC = project(cx3, cy3, cz3, cam);
      if(pC){
        // a soft halo so the point reads on top of the wireframe
        const hg = ctx.createRadialGradient(pC[0], pC[1], 0, pC[0], pC[1], 22);
        hg.addColorStop(0, 'rgba(226,238,222,' + (a0 * .22).toFixed(3) + ')');
        hg.addColorStop(1, 'rgba(169,183,169,0)');
        ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(pC[0], pC[1], 22, 0, 6.283); ctx.fill();
        // a hairline down to the surface axis: proves the point belongs to the curve
        ctx.strokeStyle = 'rgba(205,220,204,' + (a0 * .16).toFixed(3) + ')';
        ctx.setLineDash([2, 4]);
        ctx.beginPath(); ctx.moveTo(pC[0], pC[1] + 4); ctx.lineTo(pC[0], pC[1] + 26); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(232,240,228,' + (a0 * .96).toFixed(3) + ')';
        ctx.beginPath(); ctx.arc(pC[0], pC[1], 2.9, 0, 6.283); ctx.fill();
        ctx.strokeStyle = 'rgba(205,220,204,' + (a0 * .4).toFixed(3) + ')'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(pC[0], pC[1], 8 + Math.sin(t * 3) * 1.8, 0, 6.283); ctx.stroke();
        ctx.textAlign = 'left'; ctx.font = '600 11.5px ' + getComputedStyleFont;
        ctx.fillStyle = 'rgba(232,240,228,' + (a0 * .85).toFixed(3) + ')';
        ctx.fillText('91 Мбит/с · потеря 3%', pC[0] + 14, pC[1] - 12);
      }
    }
    ctx.restore();
  }


  if(wts[5] > .02){ // devices: ten orbital rings around a hub, links light up when connected
    const a0 = wts[5];
    ctx.textAlign = 'center';
    const hub = project(0, 0, 0, cam);
    if(hub){
      const hg = ctx.createRadialGradient(hub[0], hub[1], 0, hub[0], hub[1], 76);
      hg.addColorStop(0, 'rgba(226,236,222,' + (a0 * .5).toFixed(3) + ')');
      hg.addColorStop(1, 'rgba(169,183,169,0)');
      ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(hub[0], hub[1], 76, 0, 6.283); ctx.fill();
    }
    for(let k = 0; k < 10; k++){
      const tilt = (k / 10 - .5) * 1.5, rr = 1.12 + (devGlow[k] > .5 ? 0 : .16);
      const roll = k * .31 + t * .12 * (k % 2 ? 1 : -1);
      const on = devGlow[k];
      let pen = false;
      ctx.strokeStyle = 'rgba(' + Math.round(lerp(150, 205, on)) + ',' + Math.round(lerp(158, 220, on)) + ',' + Math.round(lerp(152, 204, on)) + ',' + (a0 * (.16 + on * .5)).toFixed(3) + ')';
      ctx.lineWidth = .8 + on * .9;
      ctx.beginPath();
      for(let j = 0; j <= 72; j++){
        const a = j / 72 * 6.2832 + roll;
        const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
        const y0 = 0;
        const cy = Math.cos(tilt), sy = Math.sin(tilt);
        const p = project(x, y0 * cy - z * sy, y0 * sy + z * cy, cam);
        if(!p){ pen = false; continue; }
        if(pen) ctx.lineTo(p[0], p[1]); else { ctx.moveTo(p[0], p[1]); pen = true; }
      }
      ctx.stroke();
      // a device node on the ring
      const a = roll + .9, cy = Math.cos(tilt), sy = Math.sin(tilt);
      const p = project(Math.cos(a) * rr, -Math.sin(a) * rr * sy, Math.sin(a) * rr * cy, cam);
      if(p){
        if(on > .02 && hub){
          ctx.strokeStyle = 'rgba(205,220,204,' + (a0 * on * .3).toFixed(3) + ')';
          ctx.setLineDash([2, 6]); ctx.lineDashOffset = -t * 22;
          ctx.beginPath(); ctx.moveTo(hub[0], hub[1]); ctx.lineTo(p[0], p[1]); ctx.stroke(); ctx.setLineDash([]);
        }
        ctx.fillStyle = 'rgba(226,236,222,' + (a0 * (.3 + on * .6)).toFixed(3) + ')';
        ctx.beginPath(); ctx.arc(p[0], p[1], 2 + on * 1.6, 0, 6.283); ctx.fill();
        ctx.font = '500 ' + clamp(11 * p[3] / cam.S, 8.5, 13).toFixed(1) + 'px ' + getComputedStyleFont;
        ctx.fillStyle = 'rgba(220,226,218,' + (a0 * (.2 + on * .62)) * clamp(1.6 - p[2] / (dist * 1.2)) + ')';
        ctx.fillText(DEVS[k][1], p[0], p[1] + 20 * p[3] / cam.S);
      }
    }
  }


  // ---- liquid suction: typography physically drains into the point ----
  if(collFX.on && collFX.k > .015){
    const kk = collFX.k, cx = collFX.x, cy = collFX.y;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    // converging fibres
    const n = 30, pull = smr(kk);
    for(let i = 0; i < n; i++){
      const a = i / n * 6.2832 + kk * 1.6 + R1[i] * .5;
      const r0 = (W * .34 + R2[i] * W * .26) * (1 - pull * .82);
      const r1 = r0 * (.5 + .16 * R3[i]) + 14;
      const s0 = cx + Math.cos(a) * r0, s1 = cy + Math.sin(a) * r0 * .62;
      const e0 = cx + Math.cos(a) * r1, e1 = cy + Math.sin(a) * r1 * .62;
      const al = pull * (.1 + .28 * R4[i]) * (1 - sm((kk - .82) / .18));
      if(al < .004) continue;
      const gr = ctx.createLinearGradient(s0, s1, e0, e1);
      gr.addColorStop(0, 'rgba(197,210,196,0)');
      gr.addColorStop(1, 'rgba(214,226,212,' + al.toFixed(3) + ')');
      ctx.strokeStyle = gr; ctx.lineWidth = .7 + R2[i] * 1.3;
      ctx.beginPath(); ctx.moveTo(s0, s1); ctx.lineTo(e0, e1); ctx.stroke();
    }
    // the mass itself: a soft liquid sphere that tightens
    const rr = (18 + 120 * (1 - pull)) * (1 + .04 * Math.sin(t * 9));
    const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(1, rr));
    rg.addColorStop(0, 'rgba(232,238,229,' + (.5 * pull).toFixed(3) + ')');
    rg.addColorStop(.4, 'rgba(190,206,189,' + (.22 * pull).toFixed(3) + ')');
    rg.addColorStop(1, 'rgba(169,183,169,0)');
    ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(cx, cy, Math.max(1, rr), 0, 6.283); ctx.fill();
    // compression rings
    for(let q = 0; q < 2; q++){
      const kq = clamp((pull - q * .18) / .82);
      ctx.strokeStyle = 'rgba(205,220,204,' + ((1 - kq) * .34 * pull).toFixed(3) + ')';
      ctx.lineWidth = 1.1 - q * .35;
      ctx.beginPath(); ctx.arc(cx, cy, 10 + (1 - kq) * (120 + q * 60), 0, 6.283); ctx.stroke();
    }
    // flash as the last glyph is absorbed
    const fl = gauss(kk, .97, .03);
    if(fl > .02){
      const fg = ctx.createRadialGradient(cx, cy, 0, cx, cy, 190);
      fg.addColorStop(0, 'rgba(240,244,236,' + (.55 * fl).toFixed(3) + ')');
      fg.addColorStop(.35, 'rgba(200,214,198,' + (.18 * fl).toFixed(3) + ')');
      fg.addColorStop(1, 'rgba(169,183,169,0)');
      ctx.fillStyle = fg; ctx.beginPath(); ctx.arc(cx, cy, 190, 0, 6.283); ctx.fill();
    }
    ctx.restore();
  }
  if(wts[6] > .02) renderShieldImpact(t, cam, wts[6]);
  shadeFrame(dt);
  renderGL(t);
  gYaw = freeYaw; gPitch = freePitch;
  // dot trail (the travelling data point)
  if(blobState.travel){
    trail.push([blobState.x, blobState.y]); if(trail.length > 22) trail.shift();
  } else if(trail.length){ trail.shift(); trail.shift(); }
  if(trail.length > 2){
    for(let k = 1; k < trail.length; k++){
      const f = k / trail.length;
      ctx.strokeStyle = 'rgba(190,204,189,' + (f * .5).toFixed(3) + ')';
      ctx.lineWidth = f * 8; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(trail[k - 1][0], trail[k - 1][1]); ctx.lineTo(trail[k][0], trail[k][1]); ctx.stroke();
    }
    ctx.lineWidth = 1;
  }
}
// The final interaction emits geometry from the actual shield centre. It is
// intentionally part of the same world renderer, so the effect follows the camera.
function renderShieldImpact(t, cam, alpha){
  const age = (performance.now() - burstT) / 1000;
  if(age < 0 || age > 3.2 || !connected) return;
  const p = project(0, 0, 0, cam); if(!p) return;
  const base = Math.min(W, H);
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  // 1. core flash — a short, hot bloom
  const flashAge = clamp(age / .55);
  if(flashAge < 1){
    const fa = Math.pow(1 - flashAge, 2) * alpha;
    const rg = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], base * (.1 + .32 * flashAge));
    rg.addColorStop(0, 'rgba(245,248,241,' + (.85 * fa).toFixed(3) + ')');
    rg.addColorStop(.25, 'rgba(212,226,208,' + (.34 * fa).toFixed(3) + ')');
    rg.addColorStop(1, 'rgba(169,183,169,0)');
    ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(p[0], p[1], base * (.1 + .32 * flashAge), 0, 6.283); ctx.fill();
  }
  // 2. three shock fronts (round, then a shield silhouette for the inner one)
  for(let q = 0; q < 3; q++){
    const k = clamp((age - q * .11) / 1.5);
    if(k >= 1) continue;
    const e = 1 - Math.pow(1 - k, 3);
    const rr = base * (.05 + e * (.30 + q * .16));
    const al = (1 - k) * alpha * (.55 - q * .14);
    ctx.strokeStyle = 'rgba(212,226,208,' + al.toFixed(3) + ')';
    ctx.lineWidth = 2 - q * .55;
    ctx.beginPath();
    if(q === 2){
      for(let i = 0; i <= 6; i++){
        const a = -Math.PI / 2 + i / 6 * Math.PI * 2;
        const stretch = (i === 0 || i === 6) ? .78 : 1;
        const x = p[0] + Math.cos(a) * rr * stretch, y = p[1] + Math.sin(a) * rr;
        if(i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
    } else ctx.arc(p[0], p[1], rr, 0, 6.283);
    ctx.stroke();
  }
  // 3. shards — thin streaks that carry the eye outward
  if(age < 1.6){
    const sa = Math.pow(1 - clamp(age / 1.6), 1.6) * alpha;
    ctx.strokeStyle = 'rgba(226,236,222,' + (sa * .5).toFixed(3) + ')';
    ctx.lineWidth = .9;
    ctx.beginPath();
    for(let i = 0; i < 44; i++){
      const a = i / 44 * 6.2832 + R1[i % 64] * .8;
      const r0 = base * (.06 + eOut3(clamp(age / .9)) * (.2 + R2[i % 64] * .22));
      const len = base * .03 + R3[i % 64] * base * .05 * (1 - clamp(age / 1.6));
      ctx.moveTo(p[0] + Math.cos(a) * r0, p[1] + Math.sin(a) * r0);
      ctx.lineTo(p[0] + Math.cos(a) * (r0 + len), p[1] + Math.sin(a) * (r0 + len));
    }
    ctx.stroke();
  }
  // 4. typographic labels orbiting the shield
  if(age < 2.1){
    const labels = ['ТРАФИК СКРЫТ', 'IP ЗАМЕНЁН', 'AES-256', 'NO-LOGS'];
    ctx.font = '700 9.5px ui-monospace,Menlo,Consolas,monospace';
    ctx.textAlign = 'center';
    labels.forEach((txt, i) => {
      const a = -1.9 + i * .95 + age * .22;
      const rr = base * (.16 + i * .035 + clamp(age / 1.4) * .06);
      const la = alpha * clamp((age - .12 * i) / .3) * clamp(1 - (age - 1.2) / .9);
      if(la <= .01) return;
      ctx.fillStyle = 'rgba(226,236,222,' + (la * .78).toFixed(3) + ')';
      ctx.fillText(txt, p[0] + Math.cos(a) * rr, p[1] + Math.sin(a) * rr * .9);
    });
  }
  ctx.restore();
}
const getComputedStyleFont = "'Segoe UI',system-ui,-apple-system,Roboto,Arial,sans-serif";

/* ============== headline: liquid emerge / collapse ============== */
let gooState = '';
function setGoo(k){
  const g = clamp(k);
  const blur = (1.4 + 10.6 * g * g).toFixed(2);
  const a = (1 + 22 * g).toFixed(2), b = (-9.2 * g).toFixed(2);
  const key = blur + a;
  if(key === gooState) return; gooState = key;
  gooBlur.setAttribute('stdDeviation', blur);
  gooMat.setAttribute('values', '1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 ' + a + ' ' + b);
}
let collFX = {x: 0, y: 0, k: 0, on: false, alpha: 0};
function renderHeadline(s, u, isCur, T){
  const on = isCur && u < 3.9;
  if(on !== s.hlOn){
    s.hlOn = on; s.hl.style.visibility = on ? 'visible' : 'hidden';
    if(!on){
      s.title.style.filter = ''; s.title.style.visibility = ''; s.title.style.opacity = '';
      s.title.style.transform = ''; s.sc.style.setProperty('--ink', '1');
      if(s.cta){ s.cta.style.visibility = 'hidden'; s.cta.style.pointerEvents = 'none'; }
    }
  }
  // publish suction state for the world renderer (streaks + liquid ring)
  if(!isCur) return;
  if(u > 2.42 && u < 3.95){
    collFX.on = true; collFX.x = s.C.x; collFX.y = s.C.y;
  } else collFX.on = false;
  if(!on){
    if(isCur) collFX.on = false;
    return;
  }
  let k;
  if(u < 1.15) k = 1 - eOut3(u / 1.15);
  else if(u < 2.45) k = 0;
  else k = Math.pow(sm((u - 2.45) / 1.12), 1.18);
  collFX.k = k;
  // the dot left behind by the slate keeps going: the headline unfolds out of it
  if(!CORE.busy && u < 1.15 && k > .3) coreSet(s.C.x, s.C.y, sm((k - .3) / .7), 0);
  // camera dolly + pointer tilt on the whole typographic block (3D)
  const dolly = 1 + .055 * sm((u - .6) / 2.2) - .22 * smr((k - .35) / .65);
  const rx = -smy * 7 + k * 26, ry = smx * 9 + k * 4;
  const push = smr(k) * -H * .02;
  s.hl.style.transform = 'translate3d(' + s.base.x.toFixed(1) + 'px,' + (s.base.y + push).toFixed(1) + 'px,0) perspective(1100px) rotateX(' + rx.toFixed(2) + 'deg) rotateY(' + ry.toFixed(2) + 'deg) scale(' + dolly.toFixed(4) + ')';
  // liquid form transition: the glyph cloud melts into one organic mass,
  // then that mass is drawn into the point and disappears completely.
  if(k > .2) SHADE.hold = Math.max(SHADE.hold, .62 * sm((k - .2) / .45) * (1 - sm((k - .88) / .12)));
  // COMPRESSION, not overlay. Three overlapping stages, all bound to k:
  //  1) k .00-.62  glyphs travel to the point (staggered by distance), losing ~45% size
  //  2) k .10-.90  goo strength follows how close the glyphs already are, so the
  //                filter only fuses letters that touch -> the word melts INTO a drop
  //  3) k .50-.97  the fused drop itself is squeezed into the point, then closes
  let conv = 0;
  for(const l of s.letters){
    const ki = clamp((k - (1 - l.d) * .14) / .5);
    const e = ki * ki * (3 - 2 * ki);
    conv += e;
    if(e < .0008){
      if(l.set){ l.el.style.transform = ''; l.set = false; }
      continue;
    }
    const swirl = e * .14 * (l.d > .5 ? 1 : -1);
    const cs = Math.cos(swirl), sn = Math.sin(swirl);
    const tx = (l.dx * cs - l.dy * sn) * e;
    const ty = (l.dx * sn + l.dy * cs) * e;
    const sc = 1 - .45 * e;
    l.el.style.transform = 'translate3d(' + tx.toFixed(1) + 'px,' + ty.toFixed(1) + 'px,0) rotate(' + (swirl * 20).toFixed(2) + 'deg) scale(' + sc.toFixed(3) + ')';
    l.set = true;
  }
  conv = s.letters.length ? conv / s.letters.length : k;
  const gk = sm((k - .03) / .22) * (.35 + .65 * conv) * (1 - sm((k - .95) / .04));
  if(gk > .01){ if(s.title.style.filter !== 'url(#fGoo)') s.title.style.filter = 'url(#fGoo)'; setGoo(gk * (.45 + .55 * conv)); }
  else if(s.title.style.filter) s.title.style.filter = '';
  const sq = smr((k - .5) / .47);
  const shrink = 1 - .985 * sq;
  const squash = shrink * (1 - .25 * sm((k - .4) / .4) * (1 - sq));
  s.title.style.transform = 'scale(' + shrink.toFixed(4) + ',' + squash.toFixed(4) + ')';
  s.title.style.opacity = (1 - sm((k - .93) / .05)).toFixed(3);
  s.title.style.visibility = k > .985 ? 'hidden' : '';
  s.sc.style.setProperty('--ink', clamp(1 - k * 1.35).toFixed(3));
  // subline: blur-in with typographic tightening, then it is sucked in as well
  const so = sm((u - .55) / .7) * (1 - sm((u - 2.3) / .38));
  const sk = sm((u - 2.3) / .5);
  const subT = 'translate3d(0,' + ((1 - sm((u - .55) / .7)) * 14 - sk * 26).toFixed(1) + 'px,0) scale(' + (1 - sk * .82).toFixed(3) + ',' + (1 - sk * .9).toFixed(3) + ')';
  s.sub.style.opacity = (so * (1 - sm((sk - .5) / .5))).toFixed(3);
  s.sub.style.transform = subT;
  s.sub.style.filter = so < .99 ? 'blur(' + ((1 - so) * 7 + sk * 6).toFixed(1) + 'px)' : (sk > .02 ? 'blur(' + (sk * 6).toFixed(1) + 'px)' : '');
  s.sub.style.letterSpacing = ((1 - sm((u - .55) / 1.1)) * .14 + sk * .1).toFixed(3) + 'em';
  if(s.cta){
    s.cta.style.opacity = so.toFixed(3);
    s.cta.style.transform = s.sub.style.transform;
    s.cta.style.pointerEvents = so > .6 ? 'auto' : 'none';
    s.cta.style.visibility = so > .02 ? 'visible' : 'hidden';
  }
}

/* ============== side typography ============== */
function renderSide(s, u, isCur, idx){
  const r = isCur ? sm((u - 4.2) / .8) * (1 - sm((u - 8.4) / .5)) : 0;
  const on = r > .003;
  if(on !== s.sideOn){ s.sideOn = on; s.side.style.visibility = on ? 'visible' : 'hidden'; }
  if(!on) return;
  const sp = s.sidePos;
  const exitK = sm((u - 8.4) / .5);
  s.side.style.transform = 'translate3d(' + (sp.x - exitK * 30).toFixed(1) + 'px,' + sp.y.toFixed(1) + 'px,0)';
  s.side.style.opacity = r.toFixed(3);
  const nr = sm((u - 4.2) / .6);
  s.num.style.transform = 'translate3d(0,' + ((1 - nr) * 18).toFixed(1) + 'px,0)';
  s.num.style.opacity = nr.toFixed(3);
  const p = eOut3((u - 4.35) / (idx === 3 ? COUNT_DUR : 1.5));
  const val = Math.round(s.to * p) + s.suf;
  if(s.cache.val !== val){ s.cache.val = val; s.bigO.textContent = val; s.bigF.textContent = val; }
  const ls = lerp(.22, -.05, eOut3((u - 4.2) / 1.3));
  s.big.style.letterSpacing = ls.toFixed(3) + 'em';
  s.big.style.setProperty('--w', (sm((u - 4.7) / 1.6) * 100).toFixed(1) + '%');
  const bb = 1 - sm((u - 4.2) / .9);
  s.big.style.filter = bb > .01 ? 'blur(' + (bb * 12).toFixed(1) + 'px)' : '';
  s.big.style.transform = 'translate3d(' + ((1 - sm((u - 4.2) / 1.1)) * -40).toFixed(1) + 'px,0,0) scale(' + lerp(1.12, 1, eOut3((u - 4.2) / 1.2)).toFixed(3) + ')';
  if(s.unit){ const ur = sm((u - 4.9) / .6); s.unit.style.opacity = ur.toFixed(3); s.unit.style.transform = 'translate3d(' + ((1 - ur) * 16).toFixed(1) + 'px,0,0)'; }
  const lr = sm((u - 5.0) / .7);
  s.lead.style.opacity = lr.toFixed(3);
  s.lead.style.transform = 'translate3d(0,' + ((1 - lr) * 12).toFixed(1) + 'px,0)';
}

/* ============== the dot / card ============== */
let curPanel = -1;
const bState = {x:0, y:0, o:0, travel:false};
function bez(A, B, p, sgn){
  const mx_ = (A.x + B.x) / 2, my_ = (A.y + B.y) / 2, dx = B.x - A.x, dy = B.y - A.y;
  const qx = mx_ - dy * .22 * sgn, qy = my_ + dx * .22 * sgn - Math.hypot(dx, dy) * .08;
  const ip = 1 - p;
  return [ip * ip * A.x + 2 * ip * p * qx + p * p * B.x, ip * ip * A.y + 2 * ip * p * qy + p * p * B.y];
}
const geoScreen = (v, r) => { if(!lastCam) return null; const w = rotV(v, r); return project(w[0], w[1], w[2], lastCam); };
let jPrev = null;
function routeDot(u, t){
  // chapter 4, local time J0..J1: dot dives into "you", rides the route, erupts at the server
  const g = GEO[geoSel], A = llv(ME.lat, ME.lon), B = llv(g.lat, g.lon), om = J.om;
  const C = scenes[3].C;
  let x, y, s = 1, travel = true;
  const pM = geoScreen(A, 1.1) || [C.x, C.y];
  if(u < 4.45){
    const p = eInOut((u - J0) / .9);
    const cx = (C.x + pM[0]) / 2 + (pM[0] < C.x ? -1 : 1) * W * .08, cy = Math.min(C.y, pM[1]) - H * .2;
    const ip = 1 - p;
    x = ip * ip * C.x + 2 * ip * p * cx + p * p * pM[0];
    y = ip * ip * C.y + 2 * ip * p * cy + p * p * pM[1];
    s = 1 + .6 * Math.sin(Math.PI * p) - .22 * p;      // comes toward the lens, then dives
  } else if(u < 5.85){
    const f = J.tp, v = rotV(slerpV(A, B, om, f), routeLift(f, om)), p = project(v[0], v[1], v[2], lastCam) || pM;
    x = p[0]; y = p[1]; s = .78 + .14 * Math.sin(Math.PI * f);
  } else {
    const p = geoScreen(B, 1.1) || [W / 2, H / 2];
    x = p[0]; y = p[1]; travel = false;
    s = .78 + 1.0 * gauss(u, 5.93, .1) + .35 * sm((u - 6.15) / .4);   // pop on arrival, charge before take-off
  }
  let str = 1, ang = 0;
  if(jPrev && travel){
    const v = Math.hypot(x - jPrev[0], y - jPrev[1]);
    str = 1 + Math.min(1.6, v * .07); ang = Math.atan2(y - jPrev[1], x - jPrev[0]);
  }
  jPrev = [x, y];
  PT.x = x; PT.y = y;   // the story point: DOM layers grow out of this
  return {x, y, s, travel, str, ang};
}
let PT = {x: 0, y: 0};
window.__PT = PT;
function renderBlob(c, u, t){
  const K = geo.K[c], Wc = geo.W, Hc = geo.H[c], fit = geo.fit[c];
  if(curPanel !== c){
    if(curPanel >= 0) panels[curPanel].classList.remove('on');
    panels[c].classList.add('on'); curPanel = c;
    blob.style.height = Hc + 'px';
  }
  const D = 15;
  let x, y, dotS = 0, wq = 0, hq = 0, ang = 0, str = 1, travel = false, closing = false;
  const sgn = c % 2 ? -1 : 1;
  const last = c === NCH - 1;
  let C = scenes[c].C;
  if(c === 3 && u >= J0 && u < J1){
    // ---------- the route sequence ----------
    const r = routeDot(u, t);
    x = r.x; y = r.y; dotS = r.s; travel = r.travel; str = r.str; ang = r.ang;
  } else {
    if(c === 3 && u >= J1){ u -= J_SH; const p = geoScreen(llv(GEO[geoSel].lat, GEO[geoSel].lon), 1.1); if(p) C = {x:p[0], y:p[1]}; }
    if(c !== 3 || u < J0) jPrev = null;
    x = C.x; y = C.y;
    if(u < .55){ dotS = 1 - sm(u / .55); }
    else if(u < 3.25){ dotS = 0; }
    else if(u < 3.55){ dotS = sm((u - 3.25) / .3); }
    else if(u < 4.25){
      const p = eInOut((u - 3.55) / .7), p2 = eInOut((u - 3.53) / .7);
      [x, y] = bez(C, K, p, sgn); const [x2, y2] = bez(C, K, p2, sgn);
      dotS = 1; travel = true;
      const v = Math.hypot(x - x2, y - y2);
      str = 1 + Math.min(1.8, v * .09); ang = Math.atan2(y - y2, x - x2);
    }
    if(u >= 4.05 && u < 8.6){
      x = K.x; y = K.y; dotS = 1;
      if(u < 4.25){ const p = eInOut((u - 3.55) / .7); [x, y] = bez(C, K, p, sgn); }
      const op = clamp((u - 4.05) / .9);
      wq = eBack(clamp(op * 1.12)); hq = eOut3(clamp((op - .14) / .86));
    } else if(u >= 8.6){
      const cp = clamp((u - 8.6) / .7);
      closing = true;
      hq = 1 - eInOut(clamp(cp / .72)); wq = 1 - eInOut(clamp((cp - .22) / .78));
      x = K.x; y = K.y; dotS = 1;
      if(u >= 9.2){
        if(last){
          // outro: the dot drops out of the film, down toward the page
          const p = clamp((u - 9.2) / 1.05), pe = p * p * (2.2 - 1.2 * p), pe2 = clamp(p - .02) ** 2 * (2.2 - 1.2 * clamp(p - .02));
          const E = {x: W / 2, y: H - 8};
          const q = {x: lerp(K.x, E.x, .25), y: K.y - H * .06};
          const at = f => { const ip = 1 - f; return [ip * ip * K.x + 2 * ip * f * q.x + f * f * E.x, ip * ip * K.y + 2 * ip * f * q.y + f * f * E.y]; };
          [x, y] = at(pe); const [x2, y2] = at(pe2);
          travel = true; const v = Math.hypot(x - x2, y - y2);
          str = 1 + Math.min(2.2, v * .08); ang = Math.atan2(y - y2, x - x2);
          if(u >= CL[NCH - 1] - .12) dotS = 0;
        } else {
          const p = eInOut((u - 9.2) / .8), p2 = eInOut((u - 9.18) / .8);
          const nC = scenes[Math.min(NCH - 1, c + 1)].C;
          [x, y] = bez(K, nC, p, -sgn); const [x2, y2] = bez(K, nC, p2, -sgn);
          travel = true; const v = Math.hypot(x - x2, y - y2);
          str = 1 + Math.min(1.8, v * .09); ang = Math.atan2(y - y2, x - x2);
        }
      }
    }
  }
  const openness = Math.min(wq, hq);
  const d = D * dotS;
  const visible = d > .4 || openness > 0;
  blob.style.visibility = visible ? 'visible' : 'hidden';
  glow.style.opacity = (Math.min(1, dotS) * (1 - sm(openness * 2.5)) * .95).toFixed(3);
  const pulse = 1 + Math.sin(t * 4) * .06;
  glow.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0) scale(' + ((.35 + dotS * .65) * pulse * (travel ? 1.25 : 1)).toFixed(3) + ')';
  bState.x = x; bState.y = y; bState.travel = travel; bState.o = openness;
  if(!visible) return;
  const w = d + (Wc - d) * clamp(wq, 0, 1.2), h = d + (Hc - d) * hq;
  const r = Math.min(h / 2, w / 2, lerp(d / 2, 22, openness) + (1 - hq) * 400);
  const ix = ((Wc - w) / 2), iy = ((Hc - h) / 2);
  blob.style.clipPath = 'inset(' + iy.toFixed(1) + 'px ' + ix.toFixed(1) + 'px round ' + Math.max(0, r).toFixed(1) + 'px)';
  const fs = lerp(1, fit, sm(openness));
  const tr = openness > 0 ? '' : ' rotate(' + ang.toFixed(3) + 'rad) scale(' + str.toFixed(3) + ',' + (1 / str).toFixed(3) + ')';
  blob.style.transform = 'translate3d(' + (x - Wc / 2).toFixed(1) + 'px,' + (y - Hc / 2).toFixed(1) + 'px,0) scale(' + fs.toFixed(4) + ')' + tr;
  const contentO = closing ? Math.pow(hq, 3) : openness;
  blob.style.setProperty('--o', contentO.toFixed(3));
  blob.style.setProperty('--dot', (1 - sm(openness * 2.4)).toFixed(3));
  blob.style.pointerEvents = openness > .97 ? 'auto' : 'none';
  if(openness > .02) renderPanelTimeline(c, u);
}

/* ============== route sequence typography + HUD (chapter 4) ============== */
const jCity = $('jCity'), jCityT = $('jCityT'), jCityK = $('jCityK'), jHud = $('jHud');
const jBar = $('jBar'), jKm = $('jKm'), jIp = $('jIp'), jPing = $('jPing'), jFrom = $('jFrom'), jTo = $('jTo');
const JC = {on:null, txt:'', km:'', ip:'', ping:'', k:''};
const MY_IP = '95.165.' + (20 + (hash(ua, 3) % 200)) + '.' + (10 + (hash(ua, 5) % 240));
function renderJourneyUI(c, u){
  const on = c === 3 && u > 4.05 && u < 7.1;
  if(on !== JC.on){ JC.on = on; jCity.style.visibility = jHud.style.visibility = on ? 'visible' : 'hidden'; }
  if(!on) return;
  const g = GEO[geoSel];
  const from = ME.name.toUpperCase(), to = g.city.toUpperCase();
  const n = Math.max(from.length, to.length);
  let txt;
  if(u < 4.62) txt = from;
  else if(u < 5.85) txt = scramble(to.padEnd(n, ' '), clamp((u - 4.62) / 1.2), 'jc' + geoSel, from.padEnd(n, ' ')).trimEnd();
  else txt = to;
  if(txt !== JC.txt){ JC.txt = txt; jCityT.textContent = txt; }
  const k = u < 5.85 ? 'Вы сейчас здесь' : 'Сайты видят вас здесь';
  if(k !== JC.k){ JC.k = k; jCityK.textContent = k; }
  // typographic motion: tracking opens on arrival, then the word collapses into the dot
  const a = sm((u - 4.15) / .45), col = sm((u - 6.15) / .45);
  const ls = lerp(.62, .1, eOut3((u - 4.15) / .8)) + .2 * gauss(u, 5.95, .14) - col * .32;
  jCityT.style.letterSpacing = (ls * (mobile ? .4 : 1)).toFixed(3) + 'em';
  jCity.style.opacity = (a * (1 - col)).toFixed(3);
  jCity.style.filter = (1 - a) + col > .01 ? 'blur(' + ((1 - a) * 10 + col * 8).toFixed(1) + 'px)' : '';
  jCity.style.transform = 'translate3d(-50%,0,0) scale(' + (1 - col * .55).toFixed(3) + ',' + (1 - col * .85).toFixed(3) + ')';
  // HUD lower third
  const ho = sm((u - 4.3) / .45) * (1 - sm((u - 6.35) / .4));
  jHud.style.opacity = ho.toFixed(3);
  jHud.style.transform = 'translate3d(0,' + ((1 - ho) * 16).toFixed(1) + 'px,0)';
  if(jFrom._v !== ME.name){ jFrom._v = ME.name; jFrom.textContent = ME.name; }
  if(jTo._v !== g.city){ jTo._v = g.city; jTo.textContent = g.city; }
  jBar.style.transform = 'scaleX(' + J.arc.toFixed(4) + ')';
  const km = Math.round(kmBetween(ME, g) * J.arc).toLocaleString('ru-RU') + ' км';
  if(km !== JC.km){ JC.km = km; jKm.textContent = km; }
  const newIp = g.ip + '.' + (40 + (geoSel * 37) % 200);
  const ip = u < 5.85 ? MY_IP : scramble(newIp.padEnd(MY_IP.length, ' '), clamp((u - 5.85) / .45), 'ip' + geoSel, MY_IP.padEnd(newIp.length, ' ')).trimEnd();
  if(ip !== JC.ip){ JC.ip = ip; jIp.textContent = ip; jIp.classList.toggle('t-ok', u >= 6.3); }
  const ping = u < 5.85 ? 'в пути…' : g.ping + ' мс';
  if(ping !== JC.ping){ JC.ping = ping; jPing.textContent = ping; }
}

/* timeline-driven moments inside cards (scrubbable like video) */
const panelCache = {};
function renderPanelTimeline(c, u){
  if(c === 0){
    fxEls.forEach((el, i) => {
      const p = clamp((u - 4.7 - i * .18) / 1.0);
      const v = scramble(FX[el.dataset.fx], p, 'fx' + i, '');
      if(el._v !== v){ el._v = v; el.textContent = v || '\u00A0'; }
    });
  } else if(c === 1){
    if(!encLive){
      const p = clamp((u - 5.0) / 1.3);
      const v = p >= 1 ? encCipher : scramble(encCipher, p, 'enc', encText.padEnd(encCipher.length, ' '));
      if(panelCache.enc !== v){ panelCache.enc = v; encOut.textContent = v; }
    }
  } else if(c === 2){
    setTun(tunOverride !== null ? tunOverride : u > 5.7);
  } else if(c === 4){
    drawSpeedChart(clamp((u - 4.75) / 1.6), performance.now());
  }
}

/* ============== far typography (deep camera plane) ============== */
function renderFar(c, u){
  u = u * 10 / CL[c];
  fars.forEach((f, i) => {
    const o = i === c ? sm(u / 1.6) * (1 - sm((u - 8.7) / 1.3)) : 0;
    if(f._o !== o){ f._o = o; f.style.opacity = o.toFixed(3); }
    if(o > 0){
      const x = W * (.12 - u * .045) - smx * 40;
      f.style.transform = 'translate3d(' + x.toFixed(1) + 'px,-50%,0)';
    }
  });
}

/* ============== player UI ============== */
let lastCh = -1, lastSec = -1;
function renderPlayer(T){
  segs.forEach((s, i) => {
    const f = clamp((T - CSo[i]) / (CL[i] + IL[i]));
    if(s._f !== f){ s._f = f; s.style.width = (f * 100).toFixed(2) + '%'; }
  });
  const sec = Math.floor(T);
  if(sec !== lastSec){ lastSec = sec; plCur.textContent = fmt2(Math.floor(sec / 60)) + ':' + fmt2(sec % 60); }
  const c = toInner(T).c;
  if(c !== lastCh){ lastCh = c; plCh.textContent = fmt2(c + 1) + ' · ' + CH_NAMES[c]; }
  hint.classList.toggle('off', !(T < 2.6 && !playing));
}

/* ============== main loop ============== */
let raf = 0, last = performance.now(), active = true;
function frame(now){
  raf = 0;
  if(document.body.classList.contains('pcx-open')){ last = now; if(active) raf = requestAnimationFrame(frame); return; }
  const dt = Math.min(.05, (now - last) / 1000); last = now;
  try { frameBody(now, dt); }
  catch(err){ if(!window.__XPN_ERR){ window.__XPN_ERR = String(err); console.error('film frame', err); } }
  if(active) raf = requestAnimationFrame(frame);
}
let covDt = 0, covPhase = 0;
function frameBody(now, dt){
  if(ss){
    const p = clamp((now - ss.t0) / ss.dur);
    const y = ss.y0 + (ss.y - ss.y0) * eInOut(p);
    scrollTo(0, y);
    target = sForY(y);
    if(p >= 1) ss = null;
  }
  if(playing){
    const pr = toInner(playT), pc = pr.c, u = genU(pc, pr.T - CS[pc]);
    const hold = pr.iu >= IL[pc] && ((u > 1.35 && u < 2.5) || (u > 4.95 && u < 8.5));
    playT = Math.min(S1, playT + (hold ? .5 : 1.05) * dt);
    scrollTo(0, yForS(playT));
    target = playT;
    if(playT >= S1) setPlaying(false);
  }
  const k = 1 - Math.exp(-dt * 5.5);
  cur += (target - cur) * k;
  if(Math.abs(target - cur) < 1e-4) cur = target;
  const R = toInner(cur), T = R.T, t = now / 1000;
  const c = R.c, u = T - CS[c], ug = genU(c, u);
  window.__T = T; window.__C = c; window.__U = u; window.__S = cur;
  // Pointer parallax remains lightweight; all optical grading beats are cued,
  // never run as a permanent animated filter.
  smx = lerp(smx, mx, 1 - Math.exp(-dt * 3)); smy = lerp(smy, my, 1 - Math.exp(-dt * 3));
  const PF = window.XPN_PROF, pf = PF ? (k, t0) => { PF[k] = (PF[k] || 0) + performance.now() - t0; } : null; let t0 = PF ? performance.now() : 0;
  introCover = 0;
  if(!runOpening(now)) renderIntro(c, R.iu);
  const cov = introCover;
  if(pf){ pf('intro', t0); t0 = performance.now(); }
  // after the opening slate folds into the point, the hero headline unfolds out of it
  const uH = c === 0 && openT !== 1e12 && openT >= 0 ? 0 : c === 0 && openEnd > 0 ? Math.min(u, (now - openEnd) / 1000 * 1.05) : u;
  if(cov){ const sc0 = scenes[c]; if(sc0){ renderHeadline(sc0, c === 0 ? uH : u, true, T); renderSide(sc0, ug, true, c); } }
  else scenes.forEach((s, i) => { renderHeadline(s, i === 0 ? uH : u, i === c, T); renderSide(s, ug, i === c, i); });
  if(pf){ pf('type', t0); t0 = performance.now(); }
  computeJourney(c, u);
  bState.hl = u < 3.9;
  covDt += dt;
  if(!cov || (covPhase ^= 1)){ renderWorld(T, t, covDt, bState); covDt = 0; }   // camera first: the dot is projected with this frame's camera
  if(pf){ pf('world', t0); t0 = performance.now(); }
  if(!cov){ renderBlob(c, u, t); renderJourneyUI(c, u); renderFar(c, u); }
  renderPlayer(cur);
  if(pf){ pf('rest', t0); PF.n = (PF.n || 0) + 1; }
  coreApply();
  const inF = scrollY < filmTop + range + H * .25;
  if(inF !== document.body.classList.contains('in-film')) document.body.classList.toggle('in-film', inF);
}
function start(){ if(!raf){ last = performance.now(); raf = requestAnimationFrame(frame); } }

const io = new IntersectionObserver(es => {
  es.forEach(e => {
    active = e.isIntersecting;
    if(active) start();
    else { document.body.classList.remove('in-film'); if(playing) setPlaying(false); }
  });
}, {threshold:[0, .3, .6]});
io.observe(film);

let rT = 0;
addEventListener('resize', () => { clearTimeout(rT); rT = setTimeout(() => { layout(); target = sForY(scrollY); }, 120); });
// QA hook: jump the timeline to an exact second (used to verify choreography)
window.XPN_SEEK = (T, instant) => { setPlaying(false); const X = toOuter(T); if(instant){ ss = null; scrollTo(0, yForS(X)); target = X; cur = X; } else smoothScroll(yForS(X), 700); };
window.XPN_SEEKS = (X, instant) => { setPlaying(false); if(instant){ ss = null; scrollTo(0, yForS(X)); target = X; cur = X; } else smoothScroll(yForS(X), 700); };
window.XPN_CSo = CSo; window.XPN_IL = IL;
addEventListener('load', () => { measureScroll(); target = sForY(scrollY); });

layout();
target = sForY(scrollY);
cur = target > T0 + .3 ? target : 0;
start();
// once fonts settle, re-measure letters
if(document.fonts && document.fonts.ready) document.fonts.ready.then(() => layout());
})();

/* ============== section intros: in-flow title cards for every page section ==============
   Each card sits in the document flow (it never overlaps content) and is scrubbed by
   its own position in the viewport: glyphs rise from masks, a rule is drawn with a
   travelling dot that writes the caption along it, and one narrow inverted band
   sweeps the title exactly once. */
(() => {
  const DATA = [
    ['cases',    '01', 'Зачем нужен VPN',   ['ЖИЗНЬ', 'как она есть'],   'блокировки · публичный Wi-Fi · слежка'],
    ['privacy',  '02', 'Наглядно',          ['ВЗГЛЯД', 'со стороны'],     'что видят провайдер и чужая сеть'],
    ['features', '03', 'Возможности',       ['ВСЁ', 'включено'],          'в любом тарифе, без доплат'],
    ['how',      '04', 'Запуск',            ['РАЗ, ДВА,', 'три'],         'две минуты от установки до защиты'],
    ['network',  '—',  'Сеть XPN',          ['СЕТЬ', 'без границ'],       'закрытый туннель между вами и интернетом'],
    ['servers',  '05', 'Серверы',           ['105', 'стран'],             '3200+ серверов, ближайший выбирается сам'],
    ['compare',  '06', 'Сравнение',         ['ЧЕСТНО', 'и без мелкого шрифта'], 'XPN против бесплатных и крупных'],
    ['devices',  '07', 'Устройства',        ['ОДИН', 'на всё'],           'телефон, ноутбук, планшет и ТВ'],
    ['pricing',  '08', 'Цены',              ['ЦЕНА', 'без звёздочек'],    'все функции в каждом плане'],
    ['reviews',  '09', 'Отзывы',            ['14 МЛН', 'человек'],        'средняя оценка 4,8 из 5'],
    ['faq',      '10', 'Вопросы',           ['СПРОСИТЕ', 'мы ответим'],   'простыми словами, без жаргона'],
    [null,       '11', 'Начать',            ['ВАШ', 'ход'],               '7 дней бесплатно, без карты']
  ];
  const clamp = (v, a = 0, b = 1) => v < a ? a : v > b ? b : v;
  const eOut = t => 1 - Math.pow(1 - clamp(t), 3);
  const eIO = t => { t = clamp(t); return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const cards = [];
  DATA.forEach(([id, num, kick, words, cap]) => {
    let sec = id ? document.getElementById(id) : null;
    if(!id){ const all = [...document.querySelectorAll('section')]; sec = all.find(s => s.querySelector('.cta-box')); }
    if(!sec || sec.querySelector('.sx')) return;
    const el = document.createElement('div');
    el.className = 'sx'; el.setAttribute('aria-hidden', 'true');
    const split = (t, cls) => '<span class="sx-row ' + cls + '">' + [...t].map(ch => '<span class="sx-m"><span class="sx-g">' + (ch === ' ' ? '&nbsp;' : ch) + '</span></span>').join('') + '</span>';
    el.innerHTML = '<div class="sx-in"><span class="sx-halo"></span><span class="sx-pen"></span><i class="sx-num">' + num + '</i><small class="sx-k"><em></em>' + kick + '</small>' +
      '<b class="sx-t">' + split(words[0], 'a') + split(words[1], 'b') + '<span class="sx-band"></span></b>' +
      '<div class="sx-rule"><span class="sx-line"></span><span class="sx-dot"></span><span class="sx-cap">' + cap + '</span></div></div>';
    sec.insertBefore(el, sec.firstChild);
    const g = [...el.querySelectorAll('.sx-g')];
    const nA = el.querySelectorAll('.sx-row.a .sx-g').length;
    cards.push({el, sec, g, nA, num: el.querySelector('.sx-num'), k: el.querySelector('.sx-k'),
      line: el.querySelector('.sx-line'), dot: el.querySelector('.sx-dot'), cap: el.querySelector('.sx-cap'),
      band: el.querySelector('.sx-band'), t: el.querySelector('.sx-t'), vis: false, last: -1,
      halo: el.querySelector('.sx-halo'), pen: el.querySelector('.sx-pen')});
  });
  if(!cards.length) return;
  if(reduce){ cards.forEach(c => c.el.classList.add('sx-static')); return; }

  function paint(c, H){
    const r = c.el.getBoundingClientRect();
    // a: entrance (card bottom enters -> card centre at 40% of the viewport)
    const a = clamp((H - r.top) / (H * .62 + r.height * .35));
    // x: exit (card scrolls off the top)
    const x = clamp(-r.top / Math.max(1, r.height * .9));
    const key = Math.round(a * 1000) * 2000 + Math.round(x * 1000);
    if(key === c.last) return; c.last = key;
    const n = c.g.length;
    c.g.forEach((el, i) => {
      const row2 = i >= c.nA;
      const k = n > 1 ? i / (n - 1) : 0;
      const li = eOut((a - .05 - k * .3) / .42);
      const y = (1 - li) * 112;
      const rx = (1 - li) * (row2 ? -55 : 62);
      const lo = x * (16 + k * 22);
      const ry = (1 - li) * (row2 ? 26 : -22);
      const tz = (1 - li) * 26;
      el.style.transform = 'translate3d(' + (row2 ? (1 - li) * 40 : 0).toFixed(1) + 'px,' + (y - lo).toFixed(1) + '%,' + tz.toFixed(1) + 'px) rotateX(' + rx.toFixed(1) + 'deg) rotateY(' + ry.toFixed(1) + 'deg)';
    });
    c.t.style.letterSpacing = (-.06 + x * .05).toFixed(3) + 'em';
    c.t.style.opacity = (1 - clamp((x - .55) / .45) * .7).toFixed(3);
    const ki = eOut((a - .02) / .35);
    c.k.style.opacity = ki.toFixed(3);
    c.k.style.transform = 'translate3d(' + ((1 - ki) * -26).toFixed(1) + 'px,0,0)';
    c.k.style.setProperty('--kl', ki.toFixed(3));
    const ni = eOut((a - .0) / .7);
    c.num.style.opacity = (ni * .9).toFixed(3);
    c.num.style.transform = 'translate3d(0,' + ((1 - ni) * 60 - x * 70).toFixed(1) + 'px,0) scale(' + (1.22 - ni * .22).toFixed(4) + ')';
    c.num.style.filter = ni < .98 ? 'blur(' + ((1 - ni) * 10).toFixed(1) + 'px)' : '';
    // rule + caption written along it
    const d = eIO((a - .38) / .5);
    c.line.style.transform = 'scaleX(' + d.toFixed(4) + ')';
    c.dot.style.left = (d * 100).toFixed(2) + '%';
    c.dot.style.opacity = (d > .005 && d < .995 ? 1 : d >= .995 ? .55 : 0).toFixed(2);
    c.cap.style.clipPath = 'inset(-4px ' + ((1 - d) * 100).toFixed(2) + '% -4px 0)';
    // a soft halo follows the writing head; the pen rides the line's tip
    if(c.halo){
      const hx = r.width * (.2 + d * .34), hy = r.height * .56;
      c.halo.style.transform = 'translate3d(' + hx.toFixed(0) + 'px,' + hy.toFixed(0) + 'px,0) scale(' + (.55 + d * .75).toFixed(3) + ')';
      c.halo.style.opacity = (Math.sin(clamp((a - .05) / .9) * Math.PI) * .85 * (1 - x * .6)).toFixed(3);
    }
    if(c.pen){
      const rule = c.line.parentElement.getBoundingClientRect();
      const hx = rule.left - r.left + d * rule.width, hy = rule.top - r.top;
      c.pen.style.transform = 'translate3d(' + hx.toFixed(1) + 'px,' + hy.toFixed(1) + 'px,0)';
      c.pen.style.opacity = (d > .01 && d < .995 ? .9 * (1 - x) : 0).toFixed(3);
    }
    // single inverted band crossing the title: a scoped colour-inversion beat
    const b = clamp((a - .55) / .4);
    c.band.style.transform = 'translate3d(' + (-30 + b * 160).toFixed(1) + '%,0,0) skewX(-14deg)';
    c.band.style.opacity = (b > 0 && b < 1 ? Math.sin(b * Math.PI) : 0).toFixed(3);
  }
  let raf = 0;
  const tick = () => {
    raf = 0;
    const H = innerHeight;
    for(const c of cards) if(c.vis) paint(c, H);
  };
  const req = () => { if(!raf) raf = requestAnimationFrame(tick); };
  const io = new IntersectionObserver(es => { es.forEach(e => { const c = cards.find(q => q.el === e.target); if(c){ c.vis = e.isIntersecting; if(c.vis) c.last = -1; } }); req(); }, {rootMargin: '120px 0px'});
  cards.forEach(c => { paint(c, innerHeight); io.observe(c.el); });
  addEventListener('scroll', req, {passive: true});
  addEventListener('resize', () => { cards.forEach(c => c.last = -1); req(); });
})();


/* =====================================================================
   SAME MOTIF ACROSS THE PAGE: section headings erupt from a dot
   (liquid expansion), kicker pills unfold from a point.
   ===================================================================== */
(function(){
if(matchMedia('(prefers-reduced-motion: reduce)').matches){ document.querySelectorAll('.sec-head h2, .gband h2').forEach(h => h.classList.add('cine-in')); return; }
const heads = [...document.querySelectorAll('.sec-head')].filter(h => h.querySelector('h2'));
let fid = 0;
function split(node){
  [...node.childNodes].forEach(n => {
    if(n.nodeType === 3){
      const parts = n.textContent.split(/(\s+)/);
      const frag = document.createDocumentFragment();
      parts.forEach(p => {
        if(!p) return;
        if(/^\s+$/.test(p)){ frag.appendChild(document.createTextNode(p)); return; }
        const w = document.createElement('span'); w.className = 'lq-w';
        for(const ch of p){ const c = document.createElement('span'); c.className = 'lq-c'; c.textContent = ch; w.appendChild(c); }
        frag.appendChild(w);
      });
      n.replaceWith(frag);
    } else if(n.nodeType === 1 && n.tagName !== 'BR') split(n);
  });
}
const sm = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
function play(head){
  const h2 = head.querySelector('h2');
  head.classList.remove('lq-wait');
  h2.classList.add('cine-in');
  const chars = [...h2.querySelectorAll('.lq-c')];
  const hr = h2.getBoundingClientRect(), cx = hr.left + hr.width / 2, cy = hr.top + hr.height / 2;
  let maxd = 1;
  const data = chars.map(c => { const r = c.getBoundingClientRect(); const dx = cx - (r.left + r.width / 2), dy = cy - (r.top + r.height / 2); const d = Math.hypot(dx, dy); if(d > maxd) maxd = d; return {c, dx, dy, d}; });
  data.forEach(o => o.d /= maxd);
  // unique goo filter for this heading
  const id = 'lqGoo' + (fid++);
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('width', 0); svg.setAttribute('height', 0); svg.style.position = 'absolute';
  svg.innerHTML = '<filter id="' + id + '" x="-20%" y="-40%" width="140%" height="180%" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="0"/><feColorMatrix mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0"/></filter>';
  document.body.appendChild(svg);
  const fb = svg.querySelector('feGaussianBlur'), fm = svg.querySelector('feColorMatrix');
  const dot = document.createElement('span'); dot.className = 'lq-dot';
  h2.classList.add('lq-host'); h2.appendChild(dot);
  dot.style.left = (cx - hr.left) + 'px'; dot.style.top = (cy - hr.top) + 'px';
  h2.style.filter = 'url(#' + id + ')';
  const t0 = performance.now(), dur = 1250;
  (function f(now){
    const p = Math.min(1, (now - t0) / dur);
    const k = 1 - (1 - Math.pow(1 - p, 3));      // 1 -> 0
    const g = sm(k / .25);
    fb.setAttribute('stdDeviation', (g * (2 + 8 * k)).toFixed(2));
    fm.setAttribute('values', '1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 ' + (1 + 22 * g).toFixed(2) + ' ' + (-9.5 * g).toFixed(2));
    data.forEach(o => {
      const ki = Math.max(0, Math.min(1, (k - (1 - o.d) * .4) / .6)), e = ki * ki * (3 - 2 * ki);
      o.c.style.transform = e < .001 ? '' : 'translate3d(' + (o.dx * e).toFixed(1) + 'px,' + (o.dy * e).toFixed(1) + 'px,0) scale(' + (1 - .9 * e).toFixed(3) + ',' + (1 - .5 * e + .38 * Math.sin(Math.PI * e)).toFixed(3) + ')';
    });
    h2.style.opacity = Math.min(1, p * 6).toFixed(3);
    dot.style.opacity = (p < .12 ? p / .12 : 1 - sm((p - .1) / .25)).toFixed(3);
    dot.style.transform = 'scale(' + (1 + Math.sin(Math.min(1, p / .3) * Math.PI) * .8).toFixed(3) + ')';
    if(p < 1) requestAnimationFrame(f);
    else { h2.style.filter = ''; svg.remove(); dot.remove(); data.forEach(o => o.c.style.transform = ''); }
  })(t0);
  head.classList.add('lq-go');
}
heads.forEach(head => { split(head.querySelector('h2')); head.classList.add('lq-wait'); });
const played = new WeakSet();
function playOnce(head){ if(played.has(head)) return; played.add(head); clearTimeout(head._lqT); play(head); }
// the courier dot (below) triggers the eruption when it lands; this is only a safety net
window.XPN_LQ = {play: h2 => { const head = h2.closest('.sec-head'); if(head && heads.includes(head)) playOnce(head); }};
const io = new IntersectionObserver(es => es.forEach(e => {
  const head = e.target; clearTimeout(head._lqT);
  if(e.isIntersecting) head._lqT = setTimeout(() => playOnce(head), 1100);
}), {rootMargin:'0px 0px -46% 0px'});
heads.forEach(h => io.observe(h));
})();

/* =====================================================================
   COURIER DOT — one continuous thread through the page.
   Film ends -> the dot drops out of the frame into the app's shield
   button. For every following section: letters lift out of the texts
   you just read, stream into a dot, the dot falls into the next
   heading and the heading erupts from it. Fully scroll-scrubbed.
   ===================================================================== */
(function(){
if(matchMedia('(prefers-reduced-motion: reduce)').matches) return;
const cv = document.getElementById('thread'); if(!cv) return;
const ctx = cv.getContext('2d');
const film = document.getElementById('film');
const clamp = (v, a = 0, b = 1) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const sm = t => { t = clamp(t); return t * t * (3 - 2 * t); };
const smr = t => { t = clamp(t); return t * t * t * (t * (t * 6 - 15) + 10); };
const eInOut = t => { t = clamp(t); return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
let W = 0, H = 0, DPR = 1, TR = [], dirty = true, mobile = false;
const ripples = [];
let seed = 7;
const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

function docBox(el){ const r = el.getBoundingClientRect(); return {x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height, cx: r.left + r.width / 2, cy: r.top + scrollY + r.height / 2}; }

function measure(){
  dirty = false;
  W = innerWidth; H = innerHeight; mobile = W < 820;
  DPR = Math.min(devicePixelRatio || 1, 2);
  cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
  const maxS = Math.max(0, document.documentElement.scrollHeight - H);
  const old = TR; TR = [];
  if(film){
    const fb = docBox(film), fEnd = fb.y + fb.h - H;
    const pb = document.getElementById('powerBtn');
    if(pb){
      const b = docBox(pb);
      let yc = b.cy - H * .5; if(yc < fEnd + 260) yc = fEnd + 260;
      TR.push({kind:'film', from:{x: W / 2, y: fb.y + fb.h - 8}, to:{x: b.cx, y: b.cy}, el: pb, ya: fEnd, yb: fEnd, yc});
    }
  }
  const heads = [...document.querySelectorAll('.sx, .sec-head h2, #gbandTitle, .cta-box h2')]
    .filter(h => h.classList.contains('sx') || !(h.closest('section') && h.closest('section').querySelector('.sx')))
    .map(h => {
      if(h.classList.contains('sx')){
        const rule = h.querySelector('.sx-rule') || h;
        const rb = docBox(rule);
        return {h: h.querySelector('.sx-t') || h, b: {cx: rb.x + 6, cy: rb.y, y: rb.y}};
      }
      return {h, b: docBox(h)};
    }).sort((a, b) => a.b.y - b.b.y);
  heads.forEach(({h, b}) => {
    const sec = h.closest('section') || h.parentElement;
    const sb = docBox(sec), B = sb.y, B2 = B + sb.h;
    const to = {x: b.cx, y: b.cy};
    // the hand-off waits until the reader has actually gone through the section:
    // it starts near the section's end, not when the section first appears
    const G = {x: lerp(W / 2, to.x, .5), y: B2 - H * .5};
    let yc = Math.min(to.y - H * .58, maxS - 2);
    let ya = Math.min(B2 - H * 1.02, yc - 300);
    let yb = Math.min(ya + (yc - ya) * .62, yc - 190);
    const prev = TR[TR.length - 1];
    if(prev && ya < prev.yc + 20){ ya = prev.yc + 20; if(yb < ya + 150) yb = ya + 150; if(yc < yb + 120) yc = yb + 120; }
    const was = old.find(o => o.el === h);
    TR.push({kind:'gather', G, to, el: h, ya, yb, yc, endY: B2, band: [G.y - H * .58, Math.min(B - H * .34, G.y + H * .18)], letters: null, arrived: was ? was.arrived : false});
  });
  if(old.length && TR[0] && TR[0].kind === 'film'){ const o = old.find(q => q.kind === 'film'); if(o) TR[0].arrived = o.arrived; }
}

/* sample real characters from the texts on screen */
const SKIP = '.sx,header,#film,script,style,svg,canvas,noscript,.modal-bg,.toast,.mmenu,.to-top,.cam-hud,.tbl-hint';
const fsCache = new WeakMap();
function sampleLetters(tr){
  const [y0, y1] = tr.band, cand = []; let total = 0;
  const rng = document.createRange();
  const wk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {acceptNode(n){
    if(!n.nodeValue || !n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
    const pe = n.parentElement; if(!pe || pe.closest(SKIP)) return NodeFilter.FILTER_REJECT;
    if(tr.el && tr.el.contains(pe)) return NodeFilter.FILTER_REJECT;
    return NodeFilter.FILTER_ACCEPT;
  }});
  let n;
  while((n = wk.nextNode())){
    rng.selectNodeContents(n);
    const r = rng.getBoundingClientRect(); if(!r.width || !r.height) continue;
    const top = r.top + scrollY;
    if(top + r.height < y0 || top > y1) continue;
    const pe = n.parentElement;
    const cs = getComputedStyle(pe); if(cs.visibility === 'hidden' || +cs.opacity === 0) continue;
    // Drain the exact visual text carrier, not its interactive card. This keeps
    // controls and layouts usable while their typographic ink becomes the dot.
    const root = pe;
    cand.push({n, len: n.nodeValue.length, at: total, root}); total += n.nodeValue.length;
  }
  const M = mobile ? 40 : 64, out = [];
  seed = 7 + Math.round(tr.G.y) % 1000;
  for(let tries = 0; tries < M * 3 && out.length < M && total; tries++){
    const pos = Math.floor(rnd() * total);
    let lo = 0, hi = cand.length - 1;
    while(lo < hi){ const mid = (lo + hi + 1) >> 1; if(cand[mid].at <= pos) lo = mid; else hi = mid - 1; }
    const c = cand[lo], i = pos - c.at, ch = c.n.nodeValue[i];
    if(!ch || !ch.trim()) continue;
    rng.setStart(c.n, i); rng.setEnd(c.n, i + 1);
    const r = rng.getBoundingClientRect(); if(!r.width) continue;
    const y = r.top + r.height / 2 + scrollY; if(y < y0 || y > y1) continue;
    const pe = c.n.parentElement;
    let fs = fsCache.get(pe); if(!fs){ const st = getComputedStyle(pe); fs = [parseFloat(st.fontSize) || 15, st.fontWeight]; fsCache.set(pe, fs); }
    out.push({ch, x: r.left + r.width / 2 + scrollX, y, fs: clamp(fs[0], 10, 34), fw: +fs[1] >= 600 ? 650 : 500, sw: (rnd() - .5) * 2, rot: (rnd() - .5) * 2.2, d: 0, r: rnd()});
  }
  let md = 1; out.forEach(l => { l.dist = Math.hypot(l.x - tr.G.x, l.y - tr.G.y); if(l.dist > md) md = l.dist; });
  out.forEach(l => { l.d = (l.dist / md) * .28 + l.r * .3; });  // far letters leave first -> all arrive together
  tr.letters = out;
  tr.sources = [...new Set(cand.map(q => q.root).filter(Boolean))];
}

// A canvas letter should not have a duplicate DOM character left behind. This
// keeps the source content present for assistive technology, but lets its visual
// ink dissolve precisely while the sampled glyphs flow into the point.
let drainingSources = [];
function setSourceDrain(tr, amount){
  const next = tr && tr.sources ? tr.sources : [];
  for(const el of drainingSources){
    if(!next.includes(el)){
      el.classList.remove('thread-source','thread-draining');
      el.style.removeProperty('--thread-drain');
    }
  }
  for(const el of next){
    el.classList.add('thread-source','thread-draining');
    el.style.setProperty('--thread-drain', clamp(amount).toFixed(3));
  }
  drainingSources = next;
}

function drawDot(x, y, r, str, ang, al){
  if(r < .3 || al < .01) return;
  // When accelerating, the point carries a small cloud of liquid light behind it.
  // This makes a section hand-off read as one continuous object, not a jump cut.
  if(str > 1.04){
    const vx = Math.cos(ang), vy = Math.sin(ang), n = Math.min(5, Math.ceil((str - 1) * 3.2));
    for(let i = n; i >= 1; i--){
      const q = i / (n + 1), rr = r * (1.35 - q * .36);
      const px = x - vx * r * (4 + i * 5) + Math.sin(i * 1.7 + ang) * r * .9;
      const py = y - vy * r * (4 + i * 5) + Math.cos(i * 1.2 + ang) * r * .55;
      const vg = ctx.createRadialGradient(px, py, 0, px, py, rr * 3.6);
      vg.addColorStop(0, 'rgba(190,204,189,' + (al * (.12 - q * .05)).toFixed(3) + ')');
      vg.addColorStop(1, 'rgba(169,183,169,0)');
      ctx.fillStyle = vg; ctx.beginPath(); ctx.arc(px, py, rr * 3.6, 0, 6.283); ctx.fill();
    }
  }
  const gr = ctx.createRadialGradient(x, y, 0, x, y, r * 7);
  gr.addColorStop(0, 'rgba(198,212,196,' + (.42 * al) + ')'); gr.addColorStop(.35, 'rgba(169,183,169,' + (.12 * al) + ')'); gr.addColorStop(1, 'rgba(169,183,169,0)');
  ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, r * 7, 0, 6.283); ctx.fill();
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.scale(str, 1 / str);
  const cg = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
  cg.addColorStop(0, 'rgba(225,232,222,' + al + ')'); cg.addColorStop(.5, 'rgba(179,192,178,' + al + ')'); cg.addColorStop(1, 'rgba(151,165,151,' + al + ')');
  ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.283); ctx.fill();
  ctx.restore();
}

let ssy = scrollY, last = performance.now(), drew = false, prevPos = null, trail = [], activeTr = null;
function arrive(tr, now){
  if(tr.arrived) return; tr.arrived = true;
  const b = docBox(tr.el);
  ripples.push({x: b.cx, y: b.cy, w: tr.kind === 'film' ? 70 : Math.min(b.w * .55, 300), t0: now});
  if(tr.kind === 'film'){
    const pw = document.getElementById('powerWrap');
    if(pw){ pw.classList.remove('landed'); void pw.offsetWidth; pw.classList.add('landed'); setTimeout(() => pw.classList.remove('landed'), 1300); }
  } else if(window.XPN_LQ && tr.el.closest('.sec-head')) window.XPN_LQ.play(tr.el);
  else { tr.el.classList.remove('land-pulse'); void tr.el.offsetWidth; tr.el.classList.add('land-pulse'); }
}
function frame(now){
  requestAnimationFrame(frame);
  if(document.body.classList.contains('pcx-open')){ last = now; return; }
  const dt = Math.min(.05, (now - last) / 1000); last = now;
  if(dirty) measure();
  const sy = scrollY;
  ssy += (sy - ssy) * (1 - Math.exp(-dt * 9)); if(Math.abs(sy - ssy) < .3) ssy = sy;
  if(drew){ ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height); drew = false; }
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  let cur = null;
  for(const tr of TR){
    if(ssy >= tr.yc){ arrive(tr, now); continue; }
    if(ssy < tr.ya - 1) continue;
    cur = tr; break;
  }
  if(cur !== activeTr){ activeTr = cur; trail = []; prevPos = null; if(cur){ cur._t = 0; if(cur.kind === 'gather'){ cur.letters = null; const b = docBox(cur.el); cur.to = {x: b.cx, y: b.cy}; } } }
  if(cur){
    drew = true;
    if(cur.kind === 'gather' && !cur.letters) sampleLetters(cur);
    // Reading time comes first. The hand-off only completes on its own when the
    // reader has already scrolled most of the way through the section and the
    // page has been still for a moment; otherwise the motion waits for them.
    // ---------------------------------------------------------------
    // READING GATE
    // The hands-off used to start while the reader was still in the middle
    // of the section, and the words dissolved under their eyes. Now the text
    // is only collected when BOTH are true:
    //   · the section has been read to the end (its last line has reached
    //     the reading line of the viewport), and
    //   · the page has been still for a beat (1.5 s) — so a fast scroll
    //     through the section never steals anything at all.
    // Any upward scroll, or any new scroll, instantly gives the words back.
    const rest = Math.abs(sy - ssy) < .6;
    if(cur._t === undefined) cur._t = 0;
    if(cur._endRead === undefined){
      // reading line: ~68% down the viewport; a section is "read" when its
      // bottom edge has passed it (or, for long sections, near the end).
      const secB = cur.yb === cur.ya ? Infinity : cur.endY;
      cur._endRead = Math.min(secB - H * .74, cur.yc - (H * .16));
    }
    const readThrough = sy >= cur._endRead;
    const scrolled = readThrough ? 1 : clamp((sy - cur.ya) / Math.max(1, cur._endRead - cur.ya));
    cur._rest = (rest && readThrough) ? (cur._rest || 0) + dt : 0;
    cur._settle = rest ? (cur._settle || 0) + dt : 0;
    const gate = cur.kind === 'film' ? .3 : 1.5;
    const canRun = cur._settle > gate && readThrough;
    cur._t = canRun ? cur._t + dt : Math.max(0, cur._t - dt * 4);
    const gt = clamp((cur._t - .25) / 1.1);
    const ht = clamp((cur._t - 1.7) / .9);
    const g = cur.kind === 'gather' ? Math.max(readThrough ? 0 : scrolled, gt) : 1;
    const h = Math.max(clamp((sy - cur._endRead) / Math.max(120, cur.yc - cur._endRead)), ht);
    if(ht >= .999) arrive(cur, now);
    // Fade the original ink only after the first letters have lifted. It remains
    // drained until the point lands, and restores correctly on reverse scroll.
    if(cur.kind === 'gather') setSourceDrain(cur, smr((g - .05) / .7) * (1 - sm((h - .55) / .4)));
    else setSourceDrain(null, 0);
    let x, y, r, str = 1, ang = 0, al = 1;
    if(cur.kind === 'gather' && h <= 0){
      // ---- letters lift out of the text and stream into the point ----
      const Gx = cur.G.x, Gy = cur.G.y - sy;
      let col = 0; const L = cur.letters, n = L.length || 1;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      let lastFont = '';
      for(const l of L){
        const e = smr((g - l.d * .9) / .58);
        col += e;
        if(e <= .13 || e >= 1) continue;
        const ox = l.x, oy = l.y - sy;
        // a wide, calm arc so the ink reads as a stream rather than a burst
        const lift = Math.sin(Math.PI * e);
        const mx = (ox + Gx) / 2 + (oy - Gy) * .34 * l.sw + lift * 26 * l.sw;
        const my = (oy + Gy) / 2 - (ox - Gx) * .34 * l.sw - lift * 34;
        const ie = 1 - e, px = ie * ie * ox + 2 * ie * e * mx + e * e * Gx, py = ie * ie * oy + 2 * ie * e * my + e * e * Gy;
        if(e < .22){ // a short glint marks where the letter came from
          ctx.fillStyle = 'rgba(193,180,156,' + ((1 - e / .22) * .3).toFixed(3) + ')';
          ctx.fillRect(ox - l.fs * .3, oy + l.fs * .55, l.fs * .6, 1.2);
        }
        const sc = 1 - .82 * e, fsz = Math.max(4, Math.round(l.fs * sc * 2) / 2);
        const font = l.fw + ' ' + fsz + 'px ' + "'Segoe UI',system-ui,-apple-system,Roboto,Arial,sans-serif";
        if(font !== lastFont){ ctx.font = font; lastFont = font; }
        const a = Math.min(1, (e - .13) * 7) * (1 - sm((e - .62) / .34)) * .74;
        const mix = clamp(e * 1.4);
        ctx.fillStyle = 'rgba(' + Math.round(lerp(231, 190, mix)) + ',' + Math.round(lerp(228, 204, mix)) + ',' + Math.round(lerp(221, 189, mix)) + ',' + a.toFixed(3) + ')';
        const ro = l.rot * e, c = Math.cos(ro), s = Math.sin(ro);
        ctx.setTransform(DPR * c, DPR * s, -DPR * s, DPR * c, DPR * px, DPR * py);
        ctx.fillText(l.ch, 0, 0);
      }
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      col /= n;
      x = Gx; y = Gy; r = 1.2 + 6 * smr(col * 1.15);
      al = clamp(col * 4);
      // charge rings: the collected energy compresses just before the drop
      if(col > .35){
        const cr = 1 - sm((col - .35) / .65);
        ctx.save(); ctx.globalCompositeOperation = 'screen';
        for(let q = 0; q < 2; q++){
          const rr = (6 + q * 16) + (18 + q * 26) * cr;
          ctx.strokeStyle = 'rgba(205,220,204,' + ((.05 + .3 * col) * (q ? .55 : 1) * (1 - cr * .5)).toFixed(3) + ')';
          ctx.lineWidth = 1.1 - q * .35;
          ctx.beginPath(); ctx.arc(Gx, Gy, rr, 0, 6.283); ctx.stroke();
        }
        ctx.restore();
      }
    } else {
      // ---- the dot falls into the next heading (or the app button) ----
      const A = cur.kind === 'film' ? cur.from : cur.G, B = cur.to;
      // long, gliding hand-off: slow out of the charge, slow into the landing
      const p = h < .5 ? 2 * h * h : 1 - Math.pow(-2 * h + 2, 2) / 2;
      const side = B.x >= A.x ? -1 : 1;
      const q = {x: A.x + (B.x - A.x) * .24 + side * Math.min(120, W * .09), y: A.y + (B.y - A.y) * .52};
      const ip = 1 - p;
      x = ip * ip * A.x + 2 * ip * p * q.x + p * p * B.x + Math.sin(p * Math.PI) * side * 16;
      y = ip * ip * A.y + 2 * ip * p * q.y + p * p * B.y - sy;
      r = 7.2 * (1 - .5 * sm((h - .88) / .12)) * (1 + .12 * Math.sin(h * Math.PI));
      if(prevPos){ const v = Math.hypot(x - prevPos[0], (y + sy) - prevPos[1]); str = 1 + Math.min(1.6, v * .06); ang = Math.atan2((y + sy) - prevPos[1], x - prevPos[0]); }
      prevPos = [x, y + sy];
      trail.push([x, y + sy]); if(trail.length > 16) trail.shift();
    }
    if(trail.length > 2){
      ctx.lineCap = 'round';
      for(let k = 1; k < trail.length; k++){
        const f = k / trail.length;
        ctx.strokeStyle = 'rgba(190,204,189,' + (f * .4).toFixed(3) + ')'; ctx.lineWidth = f * r * 1.1;
        ctx.beginPath(); ctx.moveTo(trail[k - 1][0], trail[k - 1][1] - sy); ctx.lineTo(trail[k][0], trail[k][1] - sy); ctx.stroke();
      }
    }
    drawDot(x, y, r, str, ang, al);
  } else {
    setSourceDrain(null, 0);
  }
  // landing ripples
  for(let i = ripples.length - 1; i >= 0; i--){
    const rp = ripples[i], p = (now - rp.t0) / 1100;
    if(p >= 1){ ripples.splice(i, 1); continue; }
    drew = true;
    const e = 1 - Math.pow(1 - p, 3), y = rp.y - sy;
    for(let k = 0; k < 2; k++){
      const ek = clamp(e - k * .18);
      ctx.strokeStyle = 'rgba(190,204,189,' + ((1 - p) * (.5 - k * .2)).toFixed(3) + ')'; ctx.lineWidth = 1.4 - k * .4;
      ctx.beginPath(); ctx.ellipse(rp.x, y, 8 + rp.w * ek, 6 + rp.w * .22 * ek, 0, 0, 6.283); ctx.stroke();
    }
  }
}
// first paint: everything already scrolled past counts as delivered (no replays above the fold)
function boot(){
  measure();
  TR.forEach(tr => { if(scrollY >= tr.yc){ tr.arrived = true; if(tr.kind === 'gather' && window.XPN_LQ) window.XPN_LQ.play(tr.el); } });
  ssy = scrollY;
  requestAnimationFrame(frame);
}
let rT = 0;
const remeasure = () => { clearTimeout(rT); rT = setTimeout(() => { dirty = true; }, 120); };
addEventListener('resize', remeasure);
addEventListener('load', remeasure);
if('ResizeObserver' in window) new ResizeObserver(remeasure).observe(document.body);
if(document.fonts && document.fonts.ready) document.fonts.ready.then(remeasure);
boot();
})();


/* ===== button motion: pointer spotlight, press ripple, corner ticks ===== */
(() => {
  const SEL = '.btn, .pn-btn, .pl-skip';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const dress = () => document.querySelectorAll('.btn').forEach(b => {
    if(b.dataset.ticks) return; b.dataset.ticks = '1';
    const a = document.createElement('i'); a.className = 'btn-tick a'; a.setAttribute('aria-hidden', 'true');
    const z = document.createElement('i'); z.className = 'btn-tick b'; z.setAttribute('aria-hidden', 'true');
    b.append(a, z);
  });
  dress(); setTimeout(dress, 1500);
  document.addEventListener('pointermove', e => {
    const b = e.target.closest && e.target.closest(SEL); if(!b) return;
    const r = b.getBoundingClientRect();
    b.style.setProperty('--mx', (e.clientX - r.left).toFixed(0) + 'px');
    b.style.setProperty('--my', (e.clientY - r.top).toFixed(0) + 'px');
  }, {passive: true});
  if(reduce) return;
  document.addEventListener('pointerdown', e => {
    const b = e.target.closest && e.target.closest(SEL); if(!b) return;
    const r = b.getBoundingClientRect(), s = document.createElement('span');
    s.className = 'btn-rip';
    s.style.left = (e.clientX - r.left) + 'px'; s.style.top = (e.clientY - r.top) + 'px';
    s.style.setProperty('--rs', (Math.hypot(r.width, r.height) / 5).toFixed(1));
    b.appendChild(s); setTimeout(() => s.remove(), 750);
  }, {passive: true});
})();

