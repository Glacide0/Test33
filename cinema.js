/* =====================================================================
   PLAN CINEMA v2
   «Подробнее» у тарифа -> полноэкранный ролик.
   Карточка -> камера наезжает на пункт -> от пункта рисуется линия,
   по ней «чертится» рамка короткого описания -> клик по короткому ->
   линия идёт ОТ КОРОТКОГО описания к подробному, точка бежит по ней,
   камера летит следом по той же дуге, карточка улетает, рамка
   подробного описания чертится из точки прибытия. Назад — тем же путём.
   Камера: дуговые пролёты с «нырком» зума и креном по скорости.
   Один rAF, только transform/opacity + два канваса (фон / линии).
   ===================================================================== */
(function(){
'use strict';
const prices = [...document.querySelectorAll('.prices .price')];
if(!prices.length) return;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v,a,b)=>v<a?a:v>b?b:v;
const lerp  = (a,b,t)=>a+(b-a)*t;
const lin   = t=>clamp(t,0,1);
const eOut  = t=>1-Math.pow(1-clamp(t,0,1),3);
const eOut5 = t=>1-Math.pow(1-clamp(t,0,1),5);
const eIO   = t=>{t=clamp(t,0,1);return t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;};
const eIO5  = t=>{t=clamp(t,0,1);return t<.5?16*t*t*t*t*t:1-Math.pow(-2*t+2,5)/2;};
const seg   = (p,a,b)=>clamp((p-a)/(b-a),0,1);

/* ---------------- содержание пунктов ---------------- */
const DB = [
 {m:'серверов', t:'3 200+ серверов в 105 странах',
  s:'Нужная страна почти всегда рядом — а значит, соединение быстрое и стабильное.',
  b:['Чем ближе сервер, тем меньше задержка и тем меньше заметно, что защита вообще включена. В каждой крупной стране у нас не одна точка, а несколько, и трафик сам уходит на ту, где сейчас свободнее.',
     'Переключение занимает пару секунд и не рвёт загрузки: приложение держит соединение, пока новое не поднимется.'],
  f:[['Серверов','3 200+'],['Стран','105'],['Городов','230'],['Смена страны','~2 сек']]},
 {m:'10 устройств', t:'10 устройств одновременно',
  s:'Один аккаунт на телефон, ноутбук, планшет, телевизор — и ещё останется запас.',
  b:['Лимит считается по устройствам, а не по людям: можно подключить всю технику дома и не выходить каждый раз из одного приложения, чтобы войти в другое.',
     'Есть приложения для iOS, Android, Windows, macOS, Linux, Android TV и расширения для браузеров. Настройка — один вход по коду.'],
  f:[['Устройств','10'],['Платформ','7'],['Маршрутизатор','считается за одно'],['Переустановка','не нужна']]},
 {m:'шифрован', t:'Шифрование AES-256 и No-Logs',
  s:'Трафик закрыт банковским шифром, а история посещений нигде не хранится.',
  b:['AES-256 — тот же стандарт, которым пользуются банки и государственные сервисы. Между вашим устройством и сервером никто не видит содержимое — ни провайдер, ни владелец публичного Wi-Fi.',
     'Политику No-Logs подтверждает ежегодный независимый аудит: мы не храним, какие сайты вы открывали, когда и с какого адреса.'],
  f:[['Шифр','AES-256-GCM'],['Протоколы','WireGuard, OpenVPN'],['Логи','не ведутся'],['Аудит','ежегодный, внешний']]},
 {m:'kill switch', t:'Kill Switch и блокировка рекламы',
  s:'Если связь оборвётся, интернет выключится раньше, чем утечёт хоть один байт.',
  b:['Kill Switch следит за туннелем постоянно. Пропала сеть в метро или переключились с Wi-Fi на мобильный — трафик замирает и ждёт, пока защита поднимется снова.',
     'Параллельно работает фильтр: рекламные и следящие домены не загружаются вовсе. Страницы открываются заметно быстрее и расходуют меньше трафика.'],
  f:[['Реакция','< 30 мс'],['Фильтр доменов','1.9 млн'],['Экономия трафика','до 22 %'],['Можно выключить','да']]},
 {m:'менеджер паролей', t:'Менеджер паролей XPN Pass',
  s:'Пароли живут в одном защищённом хранилище и подставляются сами.',
  b:['Хранилище шифруется на вашем устройстве — мы физически не можем прочитать его содержимое. Синхронизация идёт между всеми устройствами аккаунта.',
     'Pass подсказывает слабые и повторяющиеся пароли, генерирует новые и сам заполняет формы входа в приложениях и браузере.'],
  f:[['Записей','без лимита'],['Шифрование','на устройстве'],['Автозаполнение','да'],['Общий доступ','до 6 человек']]},
 {m:'антивирус', t:'Антивирус и контроль утечек почты',
  s:'Файлы проверяются при скачивании, а почта — по базам утечек.',
  b:['Проверка идёт в момент загрузки: заражённый файл не успевает попасть в систему. Базы обновляются несколько раз в сутки.',
     'Отдельно мы следим за вашими адресами почты в утечках. Если адрес всплыл в новой базе — придёт уведомление и подсказка, что сменить.'],
  f:[['Проверка','в реальном времени'],['Обновления','4 раза в сутки'],['Адресов почты','5'],['Отчёт','раз в месяц']]},
 {m:'приоритетная скорость', t:'Приоритетная скорость в час пик',
  s:'Вечером, когда сеть загружена, ваш трафик идёт в первой очереди.',
  b:['С 19:00 до 23:00 нагрузка на популярные серверы вырастает в несколько раз. Приоритетные соединения получают отдельную полосу, поэтому видео не уходит в низкое качество.',
     'Скорость канала не ограничена искусственно ни на одном тарифе — приоритет влияет только на поведение в пиковые часы.'],
  f:[['Пик','19:00 – 23:00'],['Держит','4K без буферизации'],['Лимит трафика','нет'],['Полоса','до 1 Гбит/с']]},
 {m:'поддержк', t:'Поддержка без очереди',
  s:'Живой человек в чате отвечает в среднем за полторы минуты.',
  b:['Чат работает круглосуточно на русском языке. Первым отвечает не бот, а инженер, который видит состояние вашего подключения и может подсказать по делу.',
     'Если вопрос сложный, диалог остаётся в истории — не нужно пересказывать всё заново при следующем обращении.'],
  f:[['Ответ','~1,5 мин'],['Время работы','24/7'],['Язык','русский'],['История диалогов','хранится']]},
 {m:'облак', t:'Облачное хранилище 1 ТБ',
  s:'Терабайт зашифрованного места для фото, документов и резервных копий.',
  b:['Файлы шифруются до отправки, ключ остаётся у вас. Даже мы видим только размер и дату — не содержимое.',
     'Работает автозагрузка фотографий с телефона и версии файлов за 30 дней: случайно затёртый документ можно вернуть.'],
  f:[['Объём','1 ТБ'],['Версии файлов','30 дней'],['Автозагрузка фото','да'],['Общие папки','да']]},
 {m:'выделенный ip', t:'Выделенный IP в выбранной стране',
  s:'Личный адрес, которым не пользуется никто, кроме вас.',
  b:['Банк, рабочая почта и корпоративные сервисы перестают просить лишние подтверждения: адрес всегда один и тот же и не отмечен как общий.',
     'Страну можно выбрать при подключении и сменить раз в месяц бесплатно.'],
  f:[['Адрес','только ваш'],['Стран на выбор','34'],['Смена страны','1 раз в месяц'],['Капчи','почти исчезают']]},
 {m:'страхован', t:'Страхование от кражи личности',
  s:'Если данными воспользуются, вы не останетесь с проблемой один на один.',
  b:['Страховая покрывает прямой ущерб до 1 000 000 ₽ и юридическое сопровождение: блокировку, переоформление документов, переписку с банками.',
     'Заявление подаётся в приложении, куратор ведёт дело до закрытия.'],
  f:[['Покрытие','до 1 000 000 ₽'],['Юрист','включён'],['Срок рассмотрения','до 10 дней'],['Доплата','нет']]},
 {m:'личный менеджер', t:'Личный менеджер в поддержке',
  s:'Один и тот же человек, который уже знает вашу историю.',
  b:['У менеджера есть прямой канал связи и доступ к инженерам без общей очереди. Он помогает с настройкой на всех устройствах и с нетипичными задачами.',
     'Связаться можно в чате, по почте или в созвоне по записи.'],
  f:[['Ответ','до 5 минут'],['Созвон','по записи'],['Настройка техники','включена'],['Канал','чат, почта, звонок']]},
 {m:'ранний доступ', t:'Ранний доступ к новым функциям',
  s:'Новые возможности приходят к вам за пару месяцев до остальных.',
  b:['Мы открываем бета-ветку приложения: можно включить функции, которые ещё не вышли, и вернуться назад одним переключателем.',
     'Отзывы из этой группы напрямую влияют на то, каким выйдет релиз.'],
  f:[['Опережение','1–3 месяца'],['Откат','одним переключателем'],['Канал обратной связи','прямой'],['Стабильная версия','всегда рядом']]},
];
function info(txt){
  const l = txt.toLowerCase();
  const d = DB.find(e=>l.indexOf(e.m)>=0);
  if(d) return d;
  return {t:txt, s:'Входит в тариф и работает сразу после установки — настраивать ничего не нужно.',
    b:['Функция включена в тариф и не требует отдельной оплаты.','Включается в приложении одним переключателем.'],
    f:[['В тарифе','да'],['Доплата','нет']]};
}


/* ---------------- разметка оверлея ---------------- */
let wid = 0;
const words = (s, d0, step)=>s.split(' ').map((w,i)=>
  '<span class="pcx-m"><span class="pcx-w" style="transition-delay:'+(d0+i*step)+'ms">'+w+'</span></span>').join(' ');
const pad2 = n=>(n<10?'0':'')+n;

const ov = document.createElement('div');
ov.className = 'pcx'; ov.setAttribute('role','dialog'); ov.setAttribute('aria-modal','true'); ov.setAttribute('aria-label','Подробно о тарифе');
ov.innerHTML =
 '<div class="pcx-bg"></div>'+
 '<canvas class="pcx-cv pcx-cv-b"></canvas>'+
 '<div class="pcx-vp"><div class="pcx-world">'+
   '<div class="pcx-card price"><span class="pop-badge" hidden></span><h3></h3>'+
     '<p class="for"></p>'+
     '<div class="amount"><span class="cur">₽</span><span class="num"></span><span class="per"></span><span class="oldprice"></span></div>'+
     '<p class="billed"></p>'+
     '<ul class="pcx-list"></ul>'+
     '<button class="btn btn-p px-buy" type="button"><span></span></button></div>'+
   '<div class="pcx-note">'+
     '<div class="nk"><span class="ix"></span><i></i><span>Коротко</span></div>'+
     '<h4></h4><p></p>'+
     '<button class="go" type="button"><span>Подробное описание</span><u></u></button></div>'+
   '<div class="pcx-doc">'+
     '<div class="pcx-big"></div>'+
     '<div class="nk"><span class="ix"></span><i></i><span>Подробно</span></div>'+
     '<h4></h4><div class="dp"></div><ul class="pcx-facts"></ul></div>'+
 '</div></div>'+
 '<canvas class="pcx-cv pcx-cv-f"></canvas>'+
 '<div class="pcx-ui">'+
   '<div class="pcx-top"><div class="pcx-ttl">XPN <i></i> <b class="pt"></b></div>'+
     '<button class="pcx-btn px-close" type="button">Закрыть</button></div>'+
   '<div class="pcx-bot">'+
     '<button class="pcx-btn px-back" type="button" hidden>Назад</button>'+
     '<div class="pcx-steps"><i class="s0"></i><i class="s1"></i><i class="s2"></i><span class="pcx-hint">Выберите пункт тарифа</span></div>'+
     '<button class="pcx-btn px-next" type="button" hidden>Следующий пункт</button>'+
   '</div></div>';
document.body.appendChild(ov);

const Q = s=>ov.querySelector(s);
const cvB = Q('.pcx-cv-b'), cB = cvB.getContext('2d');
const cvF = Q('.pcx-cv-f'), cF = cvF.getContext('2d');
const world = Q('.pcx-world'), card = Q('.pcx-card'), list = Q('.pcx-list');
const note = Q('.pcx-note'), doc = Q('.pcx-doc'), goBtn = note.querySelector('.go');
const bBack = Q('.px-back'), bNext = Q('.px-next'), bClose = Q('.px-close'), hint = Q('.pcx-hint');
const steps = [Q('.s0'),Q('.s1'),Q('.s2')];

/* светящаяся точка — один раз в спрайт, чтобы не платить за shadowBlur */
const glow = document.createElement('canvas'); glow.width = glow.height = 64;
{ const g = glow.getContext('2d'), rg = g.createRadialGradient(32,32,0,32,32,32);
  rg.addColorStop(0,'rgba(240,244,236,1)'); rg.addColorStop(.18,'rgba(220,232,216,.75)');
  rg.addColorStop(.5,'rgba(169,183,169,.18)'); rg.addColorStop(1,'rgba(169,183,169,0)');
  g.fillStyle = rg; g.fillRect(0,0,64,64); }

/* ---------------- состояние ---------------- */
let open = false, closing = false, state = 'list', items = [], sel = -1, srcBtn = null, seq = 0;
let closingPlan = '';
let vw = 0, vh = 0, dpr = 1, base = 1, sm = false;
const cam = {x:0, y:0, z:1, r:0};
let camT = null;                 // активный пролёт камеры
let raf = 0, last = 0, lt = 0, NOW = 0, pvx = 0;
let flip = null, autoDetail = false;

/* тайм-твины: в отличие от экспоненты, приходят ровно в срок и не «плывут» */
const TW = {oa:{v:0}, pNote:{v:0}, pDoc:{v:0}};
function tw(k, to, dur, ease){
  const o = TW[k];
  if(reduce) dur = 1;
  TW[k] = {a:o.v, b:to, t0:performance.now(), d:dur, e:ease||lin, v:o.v};
}
function stepTW(now){
  for(const k in TW){ const o = TW[k]; if(o.d === undefined) continue;
    const u = clamp((now - o.t0)/o.d, 0, 1); o.v = o.a + (o.b - o.a)*o.e(u); }
}
const V = k=>TW[k].v;

/* пролёт камеры по квадратичной дуге с нырком зума */
let camQ = null;                 // queued shot: a camera move with a second beat
function camTo(x, y, z, dur, lift, dip, roll){
  if(reduce || !(open || closing)){ cam.x = x; cam.y = y; cam.z = z; camT = null; return; }
  const dx = x - cam.x, dy = y - cam.y, d = Math.hypot(dx, dy) || 1;
  // bow the flight path perpendicular to the travel direction: no straight lines
  const bow = (lift||0) + Math.min(d*.16, 130);
  const mx = (cam.x + x)/2 - dy/d*bow, my = (cam.y + y)/2 + dx/d*bow - (lift||0)*.35;
  camT = {x0:cam.x, y0:cam.y, z0:cam.z, cx:mx, cy:my, x, y, z, t0:performance.now(), d:dur,
          dip:dip||0, roll:roll||0, r0:cam.r};
}
function stepCam(now){
  if(!camT){ if(camQ){ const q = camQ; camQ = null; camTo(q[0],q[1],q[2],q[3],q[4],q[5],q[6]); } return; }
  const c = camT, u = clamp((now - c.t0)/c.d, 0, 1), e = eIO5(u), q = 1 - e;
  cam.x = q*q*c.x0 + 2*q*e*c.cx + e*e*c.x;
  cam.y = q*q*c.y0 + 2*q*e*c.cy + e*e*c.y;
  // the zoom overshoots a touch and settles: a lens that racks focus, not a slider
  const zs = lerp(c.z0, c.z, eIO(u)) * (1 - c.dip*Math.sin(Math.PI*u));
  cam.z = zs * (1 + .045*Math.sin(Math.PI*u)*(1-u));
  // roll into the turn, unwind on arrival
  cam.r = c.r0 + Math.sin(Math.PI*u) * (c.roll || 0);
  if(u >= 1) camT = null;
}

function resize(){
  vw = innerWidth; vh = innerHeight;
  dpr = Math.min(devicePixelRatio || 1, 1.5);
  [cvB, cvF].forEach(c=>{ c.width = Math.round(vw*dpr); c.height = Math.round(vh*dpr); });
  cB.setTransform(dpr,0,0,dpr,0,0); cF.setTransform(dpr,0,0,dpr,0,0);
  sm = vw < 720;
  base = sm ? 1 : clamp(Math.min(vw/1240, vh/860), .62, 1.08);
  world.classList.toggle('sm', sm);
}
addEventListener('resize', ()=>{ if(open){ resize(); layout(); retarget(); } }, {passive:true});

/* мировые координаты (кэш: offset* в каждом кадре = лишний лэйаут) */
let RC = new Map();
function bust(){ RC = new Map(); }
function wrect(el){ let r = RC.get(el); if(!r){ r = wraw(el); RC.set(el, r); } return r; }
function wraw(el){
  let x = 0, y = 0, n = el;
  while(n && n !== world){ x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
  const w = el.offsetWidth, h = el.offsetHeight;
  return {x, y, w, h, cx:x + w/2, cy:y + h/2, r:x + w, b:y + h};
}
/* мир -> экран (тот же порядок, что и CSS-трансформ мира) */
let RS = 1, RCs = 1, RSn = 0, BX = 0, BY = 0;
function toS(x, y){
  const dx = (x - BX)*RS, dy = (y - BY)*RS;
  return [vw/2 + dx*RCs - dy*RSn, vh/2 + dx*RSn + dy*RCs];
}

/* ---------------- сборка карточки ---------------- */
function build(src){
  srcBtn = src;
  // The card inside the film IS the landing card: same markup, same styles,
  // same badge, same price block. Only the list items become buttons.
  const name  = src.querySelector('h3').textContent.trim();
  const forp  = (src.querySelector('.for')||{}).textContent || '';
  const num   = src.querySelector('.amount .num').textContent.trim();
  const per   = src.querySelector('.amount .per').textContent.trim();
  const oldp  = (src.querySelector('.oldprice')||{}).textContent || '';
  const bill  = (src.querySelector('.billed')||{}).textContent || '';
  const badge = src.querySelector('.pop-badge');
  const bEl   = card.querySelector('.pop-badge');
  card.querySelector('h3').textContent = name;
  card.querySelector('.for').textContent = forp.trim();
  card.querySelector('.amount .num').textContent = num;
  card.querySelector('.amount .per').textContent = per;
  card.querySelector('.amount .oldprice').textContent = oldp.trim();
  card.querySelector('.billed').textContent = bill.trim();
  card.classList.toggle('pop', src.classList.contains('pop'));
  if(badge){ bEl.hidden = false; bEl.textContent = badge.textContent.trim(); } else bEl.hidden = true;
  // the CTA is part of the tariff, not an afterthought: same label, and the
  // "Плюс" plan keeps its filled primary style exactly like on the landing
  const cta = src.querySelector('[data-open-modal]');
  const buy = card.querySelector('.px-buy');
  if(buy && cta){
    buy.querySelector('span').textContent = cta.textContent.trim();
    buy.dataset.plan = cta.dataset.plan || name;
    buy.className = 'btn ' + (cta.classList.contains('btn-p') ? 'btn-p' : 'btn-o') + ' px-buy';
  }
  // keep the selling point line height identical to the landing card
  card.querySelector('.for').style.minHeight = '44px';
  Q('.pt').textContent = name;
  list.innerHTML = ''; items = [];
  [...src.querySelectorAll('li')].forEach(li=>{
    const txt = li.textContent.trim();
    const off = li.classList.contains('off');
    const head = !!li.querySelector('b');
    const liEl = document.createElement('li');
    if(off) liEl.className = 'off';
    if(head){ liEl.innerHTML = '<b>' + txt + '</b>'; list.appendChild(liEl); return; }
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'pcx-it';
    b.innerHTML = '<span>' + txt + '</span><i class="pcx-arr"></i>';
    liEl.appendChild(b);
    list.appendChild(liEl);
    const o = {el:b, li:liEl, d:info(txt)};
    b.addEventListener('click', ()=>{ autoDetail = false; const i = items.indexOf(o); if(state === 'list' || i !== sel) focus(i); else detail(); });
    items.push(o);
  });
  bust();
}

/* раскладка мира: карточка | короткое | подробное */
function layout(){
  const cw = sm ? 340 : 452, nw = sm ? 330 : 470, dw = sm ? 350 : 600;
  const cl = 80, nl = cl + cw + (sm ? 70 : 96), dl = nl + nw + (sm ? 120 : 170);
  card.style.left = cl + 'px'; card.style.width = cw + 'px';
  note.style.left = nl + 'px'; note.style.width = nw + 'px';
  doc.style.left  = dl + 'px'; doc.style.width  = dw + 'px';
  bust();
}
const fitZ = (w, h, cap)=>Math.min(cap*base, (vw*.9)/w, (vh - (sm?150:170))/h);
function homeCam(){
  const cr = wrect(card);
  return {x:cr.cx + (sm?0:40), y:cr.cy + 6, z:fitZ(cr.w + (sm?40:260), cr.h + 40, .98)};
}
function noteCam(i){
  const r = wrect(items[i].el), nr = wrect(note), cr = wrect(card);
  if(sm) return {x:nr.cx, y:nr.cy, z:fitZ(nr.w + 30, nr.h + 40, 1.05)};
  const x0 = cr.x - 20, x1 = nr.r + 40;
  const y0 = Math.min(cr.y - 10, nr.y - 30), y1 = Math.max(cr.b + 10, nr.b + 30);
  return {x:(x0 + x1)/2, y:(y0 + y1)/2, z:fitZ(x1 - x0, y1 - y0, 1.16)};
}
function docCam(){
  const dr = wrect(doc), nr = wrect(note);
  if(sm) return {x:dr.cx, y:dr.cy, z:fitZ(dr.w + 24, dr.h + 30, 1.04)};
  const x0 = nr.r - 150, x1 = dr.r + 30;
  return {x:(x0 + x1)/2, y:dr.cy, z:fitZ(x1 - x0, dr.h + 50, 1.06)};
}
function retarget(){
  const c = state === 'detail' ? docCam() : (state === 'note' && sel >= 0) ? noteCam(sel) : homeCam();
  camTo(c.x, c.y, c.z, 700, 0, 0);
}

/* ---------------- состояния ---------------- */
function setSteps(i){ steps.forEach((s,k)=>s.classList.toggle('on', k<=i)); }
function later(ms, tok, fn){ setTimeout(()=>{ if(tok === seq && open) fn(); }, reduce ? 0 : ms); }

function goList(){
  const tok = ++seq; autoDetail = false;
  state = 'list';
  note.classList.remove('on','src'); doc.classList.remove('on');
  items.forEach(o=>{ o.el.classList.remove('sel','dim','up','dn'); if(o.li) o.li.classList.remove('dim','up','dn'); });
  tw('pDoc', 0, 900, lin); tw('pNote', 0, 700, lin);
  const h = homeCam(); camTo(h.x, h.y, h.z, 1200, 34, .05, .008);
  later(700, tok, ()=>{ sel = -1; });
  bBack.hidden = true; bNext.hidden = true;
  hint.textContent = 'Выберите пункт тарифа';
  setSteps(0);
}
function focus(i, speed){
  if(i < 0 || i >= items.length) return;
  const tok = ++seq, sp = speed || 1;
  const fromDetail = state === 'detail';
  if(fromDetail){ collapseDoc(tok, sp, ()=>focus(i, sp)); return; }
  if(state === 'note' && sel >= 0 && sel !== i && V('pNote') > .05){
    // сначала короткое описание сворачивается обратно в свою линию
    state = 'switch';
    note.classList.remove('on');
    tw('pNote', 0, 420*sp, lin);
    later(430*sp, tok, ()=>{ state = 'list'; focus(i, sp); });
    return;
  }
  state = 'note'; sel = i;
  items.forEach((o,k)=>{
    // the chosen row stays legible; the others soften but never disappear,
    // exactly like the landing card: the reader must still see the list
    o.el.classList.toggle('sel', k===i);
    if(o.li){ o.li.classList.toggle('dim', k!==i); o.li.classList.toggle('up', k<i); o.li.classList.toggle('dn', k>i); }
    o.el.classList.toggle('up', k<i); o.el.classList.toggle('dn', k>i);
  });
  const d = items[i].d, n = pad2(i+1) + ' / ' + pad2(items.length);
  note.querySelector('.ix').textContent = n;
  note.querySelector('h4').innerHTML = words(d.t, 40, 34);
  note.querySelector('p').innerHTML  = words(d.s, 220, 12);
  note.classList.remove('on','src'); doc.classList.remove('on');
  const r = wrect(items[i].el);
  note.style.top = Math.round(r.cy - 70) + 'px';
  bust();
  TW.pNote.v = 0; tw('pNote', 1, 1150*sp, lin);
  const c = noteCam(i); camTo(c.x, c.y, c.z, 1250*sp, 26, .05, -.012);
  bBack.hidden = false; bNext.hidden = items.length < 2;
  bNext.textContent = 'Следующий пункт';
  hint.textContent = 'Нажмите на описание, чтобы открыть подробности';
  setSteps(1);
}
function collapseDoc(tok, sp, then){
  state = 'switch';
  doc.classList.remove('on'); note.classList.remove('src');
  tw('pDoc', 0, 950*sp, lin);
  const c = noteCam(sel); camTo(c.x, c.y, c.z, 1050*sp, 74, .1, .01);
  later(1000*sp, tok, ()=>{ state = 'note'; then && then(); });
}
function detail(){
  if(sel < 0 || state === 'detail') return;
  const tok = ++seq;
  state = 'detail';
  const d = items[sel].d;
  doc.querySelector('.pcx-big').textContent = pad2(sel+1);
  doc.querySelector('.ix').textContent = pad2(sel+1) + ' / ' + pad2(items.length);
  doc.querySelector('h4').innerHTML = words(d.t, 60, 40);
  doc.querySelector('.dp').innerHTML = d.b.map((p,i)=>'<p style="transition-delay:'+(380+i*120)+'ms">'+p+'</p>').join('');
  doc.querySelector('.pcx-facts').innerHTML = d.f.map((f,i)=>'<li style="--d:'+(560+i*90)+'ms"><span>'+f[0]+'</span><b>'+f[1]+'</b></li>').join('');
  doc.classList.remove('on');
  note.classList.add('on','src');
  bust();
  const nr = wrect(note), dr0 = wrect(doc);
  doc.style.top = Math.round(clamp(nr.cy - 150, 40, 9999)) + 'px';
  bust();
  void dr0;
  TW.pDoc.v = Math.min(TW.pDoc.v, .02); tw('pDoc', 1, 1650, lin);
  const c = docCam(); camTo(c.x, c.y, c.z, 1700, 104, .15, -.018);
  bBack.hidden = false; bNext.hidden = items.length < 2;
  bNext.textContent = 'Дальше: ' + short(items[(sel+1)%items.length].d.t);
  hint.textContent = 'Подробное описание';
  setSteps(2);
  void tok;
}
function short(s){ return s.length>26 ? s.slice(0,24).trim()+'…' : s; }
function back(){
  autoDetail = false;
  if(state === 'detail'){ const tok = ++seq; collapseDoc(tok, 1, ()=>{
      hint.textContent = 'Нажмите на описание, чтобы открыть подробности'; setSteps(1); }); 
    bNext.textContent = 'Следующий пункт'; }
  else if(state === 'note' || state === 'switch'){ goList(); }
  else close();
}
function next(){
  if(sel < 0){ focus(0); return; }
  const n = (sel+1) % items.length;
  if(state === 'detail'){
    // карточка прилетает обратно -> камера к следующему пункту -> он раскрывается -> снова подробно
    const tok = ++seq;
    autoDetail = true;
    collapseDoc(tok, .8, ()=>focus(n, .85));
  } else focus(n);
}

note.addEventListener('click', e=>{ if(state === 'note' && note.classList.contains('on')) detail(); e.stopPropagation(); });
// CTA inside the film card behaves like the one on the landing: it leaves the
// film (reverse motion) and opens the real signup modal on the page.
card.addEventListener('click', e=>{
  const buy = e.target.closest('.px-buy');
  if(!buy) return;
  e.preventDefault(); e.stopPropagation();
  const plan = buy.dataset.plan;
  closingPlan = plan || '';
  close();
});
bBack.addEventListener('click', back);
bNext.addEventListener('click', next);
bClose.addEventListener('click', close);
addEventListener('keydown', e=>{
  if(!open) return;
  if(e.key === 'Escape'){ e.preventDefault(); back(); }
  else if(e.key === 'ArrowRight'){ e.preventDefault(); next(); }
  else if(e.key === 'ArrowLeft'){ e.preventDefault(); if(sel>0) focus(sel-1); }
  else if(e.key === 'Enter' && state === 'note' && document.activeElement === ov){ detail(); }
});

/* ---------------- открытие / закрытие ---------------- */
function openFor(src){
  build(src);
  ov.classList.add('live');
  document.body.classList.add('pcx-open');
  resize(); layout();
  state = 'list'; sel = -1; seq++;
  note.classList.remove('on','src'); doc.classList.remove('on');
  TW.pNote = {v:0}; TW.pDoc = {v:0}; TW.oa = {v:reduce?1:0};
  card.style.transform = ''; card.style.opacity = '';
  const h = homeCam();
  cam.x = h.x; cam.y = h.y; cam.z = h.z; cam.r = 0; camT = null;
  bBack.hidden = true; bNext.hidden = true; setSteps(0);
  hint.textContent = 'Выберите пункт тарифа';
  // FLIP: карточка вылетает из реальной карточки тарифа
  applyWorld(); 
  const sr = src.getBoundingClientRect(), cr = card.getBoundingClientRect(), s = cam.z;
  flip = reduce ? null : {
    dx:(sr.left + sr.width/2 - (cr.left + cr.width/2))/s,
    dy:(sr.top + sr.height/2 - (cr.top + cr.height/2))/s,
    sc:sr.width / card.offsetWidth
  };
  open = true;
  if(!reduce){
    cam.z = h.z * .66; cam.x = h.x - 170; cam.y = h.y + 44;
    camTo(h.x, h.y, h.z, 1650, 26, .02, -.01);
  }
  tw('oa', 1, 1300, lin);
  ov.style.opacity = '';
  ov.classList.remove('rewind');
  ov.classList.remove('shown'); void ov.offsetWidth; ov.classList.add('shown');
  last = performance.now(); lt = 0;
  if(!raf) raf = requestAnimationFrame(frame);
  setTimeout(()=>bClose.focus({preventScroll:true}), 60);
}
function close(){
  if(!open || closing) return;
  // ── REVERSE MOTION ────────────────────────────────────────────────
  // The film rewinds along its own path, beat by beat: the long description
  // folds back into the short one, the short one retracts into its line,
  // the card flies home into the real tariff card, and only then the
  // overlay dissolves. Nothing is cut to black.
  closing = true; const tok = ++seq;
  const from = state;
  document.body.classList.remove('pcx-open');
  ov.classList.add('rewind');
  if(from === 'detail'){
    doc.classList.remove('on'); note.classList.remove('src','on');
    tw('pDoc', 0, 700, eIO);
    const c = noteCam(clamp(sel, 0, Math.max(0, items.length - 1)));
    camTo(c.x, c.y, c.z, 760, 66, .08, .008);
    later(300, tok, ()=> tw('pNote', 0, 620, eIO));
    later(620, tok, flyHome);
  } else if(from === 'note'){
    note.classList.remove('on');
    tw('pNote', 0, 560, eIO);
    const h = homeCam();
    camTo(h.x, h.y, h.z, 720, 34, .05, -.006);
    later(260, tok, flyHome);
  } else {
    tw('pNote', 0, 380, eIO); tw('pDoc', 0, 380, eIO);
    flyHome();
  }
  if(!raf){ last = performance.now(); raf = requestAnimationFrame(frame); }
}
/* beat 2 — камера отъезжает и карточка улетает домой (FLIP в обратную сторону) */
function flyHome(){
  items.forEach(o => { o.el.classList.remove('sel'); if(o.li) o.li.classList.remove('dim','up','dn'); });
  bBack.hidden = true; bNext.hidden = true; setSteps(0);
  const h = homeCam();
  camTo(h.x - 130, h.y + 26, h.z * .72, 900, 10, 0, .004);
  tw('oa', 0, 1000, eIO);
}
function finishClose(){
  closing = false; open = false;
  state = 'list'; sel = -1; seq++;
  note.classList.remove('on','src'); doc.classList.remove('on');
  ov.classList.remove('shown','live','rewind');
  ov.style.opacity = '';
  cF.clearRect(0,0,vw,vh); cB.clearRect(0,0,vw,vh);
  if(raf){ cancelAnimationFrame(raf); raf = 0; }
  if(srcBtn) (srcBtn.querySelector('.pcx-more')||srcBtn).focus({preventScroll:true});
  if(closingPlan){
    // hand over to the page's own modal, once the film has fully rewound
    const plan = closingPlan; closingPlan = '';
    const all = [...document.querySelectorAll('[data-open-modal]')];
    const target = all.find(b => (b.dataset.plan||'') === plan) || all[0];
    if(target) setTimeout(()=>target.click(), 30);
  }
}

/* ---------------- кадр ---------------- */
function applyWorld(){
  // лёгкое «дыхание» — кадр никогда не замирает полностью
  const br = reduce ? 0 : 1;
  BX = cam.x + Math.sin(lt*.31)*5*br; BY = cam.y + Math.cos(lt*.23)*3.5*br;
  RS = cam.z; RCs = Math.cos(cam.r); RSn = Math.sin(cam.r);
  world.style.transform = 'translate3d(' + (vw/2).toFixed(1) + 'px,' + (vh/2).toFixed(1) + 'px,0) rotate(' + cam.r.toFixed(5) + 'rad) scale(' +
    RS.toFixed(4) + ') translate3d(' + (-BX).toFixed(2) + 'px,' + (-BY).toFixed(2) + 'px,0)';
}
function frame(now){
  raf = (open || closing) ? requestAnimationFrame(frame) : 0;
  try{ frameBody(now); }catch(err){ window.__PCX_ERR = String(err); }
}
function frameBody(now){
  const dt = Math.min(.05, (now - last)/1000); last = now; lt += dt; NOW = now;
  stepTW(now);
  const px = cam.x; stepCam(now);
  // крен из горизонтальной скорости камеры (как у оператора со стедикамом)
  const vx = dt > 0 ? (cam.x - px)/dt : 0; pvx += (vx - pvx)*(1 - Math.exp(-dt*6));
  const rT = reduce ? 0 : clamp(-pvx/26000, -.026, .026);
  cam.r += (rT - cam.r)*(1 - Math.exp(-dt*5));
  applyWorld();

  const oa = V('oa'), pN = V('pNote'), pD = V('pDoc');
  if(closing){
    ov.classList.toggle('rewind', oa < .999);
    ov.style.setProperty('--oa', oa.toFixed(3));
    // the overlay dissolves while the camera is already flying back, so the
    // page is revealed exactly under the returning card — no black cut, no flash
    ov.style.opacity = oa.toFixed(3);
    if(oa < .01 && !camT){ finishClose(); return; }
  }
  // классы появления — по фазам твинов (во время реверса ничего не появляется заново)
  if(!closing){
    if(state === 'note' && pN > .62 && !note.classList.contains('on')) note.classList.add('on');
    if(autoDetail && state === 'note' && pN > .999){ autoDetail = false; detail(); }
    if(state === 'detail' && pD > .74 && !doc.classList.contains('on')) doc.classList.add('on');
  }

  // карточка: FLIP-вход + улёт в глубину
  const fly = eIO(seg(pD, 0, .55));
  let tr = '';
  if(flip && oa < .999){
    const q = 1 - eIO5(oa);
    tr += 'translate3d(' + (flip.dx*q).toFixed(1) + 'px,' + (flip.dy*q).toFixed(1) + 'px,0) scale(' + (1 + (flip.sc-1)*q).toFixed(4) + ') rotateX(' + (q*8).toFixed(2) + 'deg) ';
  }
  if(fly > .001){
    tr += 'translate3d(' + (-760*fly).toFixed(1) + 'px,' + (-60*fly).toFixed(1) + 'px,' + (-520*fly).toFixed(0) + 'px) rotateY(' + (38*fly).toFixed(2) + 'deg) rotateZ(' + (-3*fly).toFixed(2) + 'deg)';
  }
  card.style.transform = tr;
  card.style.opacity = (Math.min(1, .2 + oa*1.6) * (1 - fly)).toFixed(3);
  card.style.visibility = fly > .995 ? 'hidden' : '';
  paintBack(oa);
  paintFront(oa, pN, pD, fly);
}

/* ---------------- моушен-графика ---------------- */
function line(ctx, pts, t, col, w){
  // ломаная в мировых координатах, нарисованная на долю t длины
  if(t <= 0) return null;
  let L = 0; const d = [];
  for(let i=1;i<pts.length;i++){ const l = Math.hypot(pts[i][0]-pts[i-1][0], pts[i][1]-pts[i-1][1]); d.push(l); L += l; }
  let rem = L*clamp(t,0,1), end = pts[0];
  ctx.beginPath(); let p = toS(pts[0][0], pts[0][1]); ctx.moveTo(p[0], p[1]);
  for(let i=1;i<pts.length && rem > 0;i++){
    const k = Math.min(1, rem/d[i-1]);
    end = [lerp(pts[i-1][0], pts[i][0], k), lerp(pts[i-1][1], pts[i][1], k)];
    p = toS(end[0], end[1]); ctx.lineTo(p[0], p[1]); rem -= d[i-1];
  }
  ctx.strokeStyle = col; ctx.lineWidth = w || 1; ctx.stroke();
  return end;
}
function bezPts(a, b, c, d, n){
  const out = [];
  for(let i=0;i<=n;i++){ const t = i/n, q = 1-t;
    out.push([q*q*q*a[0] + 3*q*q*t*b[0] + 3*q*t*t*c[0] + t*t*t*d[0], q*q*q*a[1] + 3*q*q*t*b[1] + 3*q*t*t*c[1] + t*t*t*d[1]]); }
  return out;
}
/* рамка, которая чертится из точки на левой грани в обе стороны и смыкается справа */
function traceRect(ctx, r, sy, t, col){
  if(t <= 0) return;
  sy = clamp(sy, r.y, r.b);
  const up = [[r.x,sy],[r.x,r.y],[r.r,r.y],[r.r,(r.y+r.b)/2]];
  const dn = [[r.x,sy],[r.x,r.b],[r.r,r.b],[r.r,(r.y+r.b)/2]];
  // уравниваем длины, чтобы обе ветви встречались одновременно
  const lu = (sy - r.y) + r.w + r.h/2, ld = (r.b - sy) + r.w + r.h/2, L = Math.max(lu, ld);
  line(ctx, up, t*L/lu, col, 1); line(ctx, dn, t*L/ld, col, 1);
}
function ticks(ctx, r, a){
  if(a <= .01) return;
  const o = 10, l = 9;
  ctx.strokeStyle = 'rgba(214,226,212,' + (.5*a).toFixed(3) + ')'; ctx.lineWidth = 1;
  [[r.x-o, r.y-o, 1, 1],[r.r+o, r.y-o, -1, 1],[r.x-o, r.b+o, 1, -1],[r.r+o, r.b+o, -1, -1]].forEach(c=>{
    const p0 = toS(c[0] + c[2]*l*a, c[1]), p1 = toS(c[0], c[1]), p2 = toS(c[0], c[1] + c[3]*l*a);
    cF.beginPath(); cF.moveTo(p0[0],p0[1]); cF.lineTo(p1[0],p1[1]); cF.lineTo(p2[0],p2[1]); cF.stroke();
  });
}
function dot(x, y, size, a){
  if(a <= .01) return;
  const p = toS(x, y), s = size;
  cF.globalAlpha = a; cF.drawImage(glow, p[0]-s/2, p[1]-s/2, s, s); cF.globalAlpha = 1;
}

/* фон: сетка точек на параллаксе (глубина) + горизонт */
function paintBack(oa){
  cB.clearRect(0,0,vw,vh);
  const ps = RS*.62, gs = 72;                 // слой «дальше» камеры
  const cx = BX*.62, cy = BY*.62;
  const hw = vw/(2*ps) + gs, hh = vh/(2*ps) + gs;
  const x0 = Math.floor((cx - hw)/gs)*gs, y0 = Math.floor((cy - hh)/gs)*gs;
  cB.fillStyle = 'rgba(169,183,169,' + (.16*oa).toFixed(3) + ')';
  for(let x = x0; x <= cx + hw; x += gs) for(let y = y0; y <= cy + hh; y += gs){
    const dx = (x - cx)*ps, dy = (y - cy)*ps;
    cB.fillRect(vw/2 + dx*RCs - dy*RSn, vh/2 + dx*RSn + dy*RCs, 1.3, 1.3);
  }
}

function paintFront(oa, pN, pD, fly){
  cF.clearRect(0,0,vw,vh);
  if(!items.length) return;
  const cr = wrect(card);
  const cardA = 1 - fly;

  // 1. рельс справа от пунктов: чертится на входе, отводы к каждому пункту
  const g = eOut(seg(oa, .25, 1)) * cardA;
  if(g > .01){
    const ra = wrect(items[0].el), rb = wrect(items[items.length-1].el), rx = cr.r + 24;
    line(cF, [[rx, ra.cy],[rx, rb.cy]], g, 'rgba(169,183,169,' + (.32*g).toFixed(3) + ')', 1);
    items.forEach((o,i)=>{
      const r = wrect(o.el), li = seg(g, i/items.length*.6, i/items.length*.6 + .4);
      const a = sel < 0 ? 1 : (i === sel ? 1 : 1 - eOut(pN));
      if(li <= .01 || a <= .01) return;
      cF.globalAlpha = a;
      line(cF, [[rx, r.cy],[rx - 14, r.cy]], li, 'rgba(169,183,169,.34)', 1);
      cF.globalAlpha = 1;
    });
  }
  if(sel < 0) return;
  const r = wrect(items[sel].el), nr = wrect(note);
  const ix = r.x + 14, iy = r.cy;            // точка пункта

  // 2. пункт -> короткое: волна из точки, линия, рамка чертится от точки прибытия
  const l1 = eOut5(seg(pN, 0, .42)), t1 = eIO(seg(pN, .3, .78));
  const a1 = cardA;                            // когда карточка улетает — связь с пунктом гаснет
  if(pN > .005 && a1 > .01){
    for(let i=0;i<2;i++){
      const ph = (lt*.5 + i/2) % 1;
      const p = toS(ix, iy);
      cF.beginPath(); cF.arc(p[0], p[1], (5 + ph*26)*RS, 0, 6.2832);
      cF.strokeStyle = 'rgba(214,226,212,' + (.24*(1-ph)*l1*a1).toFixed(3) + ')'; cF.lineWidth = 1; cF.stroke();
    }
    const sy = clamp(iy, nr.y + 24, nr.b - 24);
    const A = [cr.r + 24, iy], B = [nr.x, sy];
    const pts = [[r.r + 3, iy], A].concat(bezPts(A, [A[0] + (B[0]-A[0])*.5, A[1]], [A[0] + (B[0]-A[0])*.5, B[1]], B, 24));
    cF.globalAlpha = a1;
    const end = line(cF, pts, l1, 'rgba(214,226,212,.5)', 1.15);
    if(end && l1 < .999) dot(end[0], end[1], 26, 1);
    cF.globalAlpha = 1;
  }
  if(t1 > .001){
    const sy = clamp(iy, nr.y + 24, nr.b - 24);
    const src = note.classList.contains('src');
    traceRect(cF, nr, sy, t1, 'rgba(214,226,212,' + ((src ? .3 : .55)).toFixed(3) + ')');
    ticks(cF, nr, eOut(seg(pN, .7, 1)) * (1 - eOut(seg(pD, 0, .3))));
    if(t1 < .999){ dot(nr.x, sy, 18 + 10*(1-t1), 1 - t1); }
  }

  // 3. КОРОТКОЕ -> ПОДРОБНОЕ: линия выходит из кнопки короткого описания,
  //    точка бежит по ней, камера летит по той же дуге, рамка подробного
  //    чертится из точки прибытия.
  if(pD > .002){
    const dr = wrect(doc), gr = wrect(goBtn), u = goBtn.querySelector('u');
    const ur = u ? wrect(u) : gr;
    const h4 = wrect(doc.querySelector('h4'));
    const A = [ur.r + 6, ur.cy], A2 = [nr.r, ur.cy];
    const B = [dr.x, clamp(h4.cy, dr.y + 30, dr.b - 30)];
    const span = B[0] - A2[0];
    const pts = [A, A2].concat(bezPts(A2, [A2[0] + span*.55, A2[1]], [B[0] - span*.55, B[1]], B, 30));
    const l2 = eIO(seg(pD, 0, .6)), t2 = eIO(seg(pD, .52, .9));
    // тонкая направляющая (весь путь, едва видна) + основная линия
    line(cF, pts, 1, 'rgba(169,183,169,' + (.1*eOut(seg(pD,0,.15))).toFixed(3) + ')', 1);
    const end = line(cF, pts, l2, 'rgba(226,234,222,.62)', 1.3);
    // хвост поярче у головы
    if(end && l2 < .999){
      const tail = Math.max(0, l2 - .12);
      dot(end[0], end[1], 34, 1);
      cF.globalAlpha = .9;
      const L = pts.length - 1, i0 = Math.floor(tail*L), i1 = Math.ceil(l2*L);
      line(cF, pts.slice(i0, i1 + 1).concat([end]), 1, 'rgba(244,247,240,.85)', 2);
      cF.globalAlpha = 1;
    }
    // точка на старте — «гнездо» связи у короткого описания
    dot(A[0], A[1], 16, .8*eOut(seg(pD,0,.2)));
    // пульс по готовой связи: направление — от короткого к подробному
    if(pD > .98 && !reduce){
      const ph = (lt*.32) % 1, k = Math.round(ph*(pts.length-1));
      dot(pts[k][0], pts[k][1], 14, Math.sin(ph*Math.PI)*.7);
    }
    // рамка подробного + метки
    traceRect(cF, dr, B[1], t2, 'rgba(214,226,212,.5)');
    if(t2 > .001 && t2 < .999) dot(B[0], B[1], 22, 1 - t2);
    ticks(cF, dr, eOut(seg(pD, .82, 1)));
    // мерная линейка над подробным: чертится слева направо
    const mr = eOut(seg(pD, .78, 1));
    if(mr > .01){
      const y = dr.y - 22;
      line(cF, [[dr.x, y],[dr.r, y]], mr, 'rgba(169,183,169,.28)', 1);
      for(let i=0;i<=10;i++){ const x = dr.x + dr.w*i/10; if(i/10 > mr) break;
        line(cF, [[x, y],[x, y + (i%5===0 ? 7 : 3.5)]], 1, 'rgba(169,183,169,.34)', 1); }
    }
  }
}

/* ---------------- кнопки «Подробнее» ---------------- */
prices.forEach(p=>{
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'pcx-more';
  const n = p.querySelector('h3').textContent.trim();
  b.innerHTML = '<i></i><span>Подробнее о «' + n + '»</span>';
  b.setAttribute('aria-label', 'Подробнее о тарифе ' + n);
  p.appendChild(b);
  b.addEventListener('click', ()=>openFor(p));
});
window.__PCX = {focus:i=>focus(i), detail:()=>detail(), back:()=>back(), next:()=>next(), open:i=>openFor(prices[i||0]), st:()=>({state, sel, pN:V('pNote'), pD:V('pDoc'), cam:{...cam}})};
})();
