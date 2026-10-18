(function () {
  // Thực đơn dạng quyển sách. Ảnh nằm trong /img/menu/. Số p<số>.jpg là các trang thực đơn buffet.
  // Mỗi quyển được xếp theo thứ tự bữa ăn: khai vị, món chính, sushi, lẩu cơm mì, món phụ.
  const P = (n) => `p${n}.jpg`;
  const C = {
    special: { jp: '特別', vi: 'Special menu', en: 'Special menu' },
    ap: { jp: '前菜', vi: 'Khai vị & salad', en: 'Starters & salad' },
    main: { jp: '焼肉', vi: 'Món chính', en: 'Mains' },
    sushi: { jp: '寿司', vi: 'Sushi & sashimi', en: 'Sushi & sashimi' },
    hot: { jp: '鍋', vi: 'Lẩu, cơm & mì', en: 'Hot pot, rice & noodles' },
    side: { jp: '副菜', vi: 'Món phụ', en: 'Sides' },
    lunch: { jp: '昼', vi: 'Buffet trưa', en: 'Lunch buffet' },
    soft: { jp: '水', vi: 'Buffet nước', en: 'Soft-drink buffet' },
    alc: { jp: '酒', vi: 'Buffet rượu & bia', en: 'Wine & beer buffet' },
    carte: { jp: '飲', vi: 'Đồ uống gọi lẻ', en: 'Drinks à la carte' },
    coca: { jp: 'コーラ', vi: 'Buffet Coca trưa', en: 'Lunch Coca buffet' },
    cap: { jp: '前菜', vi: 'Khai vị & salad', en: 'Starters & salad' },
    cmain: { jp: '焼肉', vi: 'Thịt nướng & hải sản', en: 'Grilled meat & seafood' },
    csushi: { jp: '寿司', vi: 'Sushi & sashimi', en: 'Sushi & sashimi' },
    chot: { jp: '鍋', vi: 'Lẩu, mì, soup, pizza & cơm', en: 'Hot pot, noodles, soup, pizza & rice' },
    cside: { jp: '副菜', vi: 'Món ăn thêm & topping', en: 'Extra dishes & toppings' },
    ccombo: { jp: 'コンボ', vi: 'Combo', en: 'Combos' },
  };
  const buffet = (cover, list, promo) => ({ cover, rules: true, promo: !!promo, parts: list });
  const BOOKS = {
    '219K': { label: { vi: 'Trưa 219K', en: 'Lunch 219K' }, cover: { img: 'cv-219.jpg' }, rules: true, parts: [['lunch', [{ wide: 'lunch219-1.jpg' }, { wide: 'lunch219-2.jpg' }]]] },
    '269K': buffet({ img: 'cv-269-299.jpg' }, [['ap', [P(14)]], ['main', [P(4), P(10)]], ['sushi', [P(7)]], ['hot', [P(11)]], ['side', [P(8), P(2)]]]),
    '299K': buffet({ img: 'cv-269-299.jpg' }, [['ap', [P(15)]], ['main', [P(6), P(5)]], ['sushi', [P(13)]], ['hot', [P(12), P(16)]], ['side', [P(9), P(2)]]]),
    '349K': buffet({ img: 'cv-349-389.jpg' }, [['special', ['special-1.jpg', 'special-2.jpg']], ['ap', [P(31)]], ['main', [P(32), P(36)]], ['sushi', [P(23), P(25)]], ['hot', [P(18), P(19)]], ['side', [P(20), P(2)]]], true),
    '389K': buffet({ img: 'cv-349-389.jpg' }, [['special', ['special-1.jpg', 'special-2.jpg']], ['ap', [P(35), P(34)]], ['main', [P(27)]], ['sushi', [P(26), P(24), P(30)]], ['hot', [P(29), P(33)]], ['side', [P(28), P(2)]]], true),
    '469K': buffet({ img: 'cv-469.jpg' }, [['special', ['special-1.jpg', 'special-2.jpg']], ['ap', [P(44), P(47)]], ['main', [P(37), P(43), P(41), P(45), P(48)]], ['sushi', [P(38), P(40), P(49)]], ['hot', [P(46), P(39)]], ['side', [P(50), P(2)]]], true),
    carte: { label: { vi: 'Menu lẻ', en: 'À la carte' }, cover: { img: 'cv-carte.jpg' }, rules: false, parts: [['cap', ['la-starter.jpg', 'la-salad.jpg']], ['cmain', ['la-sets.jpg', 'la-beef.jpg', 'la-meat2.jpg', 'la-meat1.jpg']], ['csushi', ['la-sushi.jpg', 'la-nigiri.jpg', 'la-sashimi.jpg']], ['chot', ['la-hotpot.jpg', 'la-noodle.jpg', 'la-rice.jpg']], ['cside', ['la-extra.jpg', 'la-topping.jpg']], ['ccombo', ['cb-couple.jpg', 'cb-premium.jpg']]] },
    drinks: { label: { vi: 'Đồ uống', en: 'Drinks' }, cover: { img: 'cv-drinks.jpg' }, rules: false, parts: [['coca', [{ info: 'coca' }]], ['soft', ['bf-soft69.jpg']], ['alc', ['bf-alc139.jpg']], ['carte', ['dr-soda.jpg', 'dr-sake.jpg']]] },
  };
  const TXT = {
    vi: {
      eyebrow: 'Thực đơn', title: 'Thực đơn', lead: 'Chọn thực đơn rồi lật từng trang, từ món khai vị đến món chính và món phụ.',
      note: 'Giá buffet mỗi khách, chưa gồm VAT. Hình ảnh món ăn chỉ mang tính minh hoạ. Bấm vào trang để phóng to.',
      cta: 'Đặt bàn ngay', page: 'Trang', of: 'trên', prev: 'Trang trước', next: 'Trang sau', hint: 'Dùng phím ← → hoặc vuốt để lật trang',
      perGuest: '/ KHÁCH', city: 'ĐÀ NẴNG', menu: 'THỰC ĐƠN BUFFET',
      promo: 'Ưu đãi: đi 4 tính 3, buffet từ 349K trở lên, cả ngày thứ 2 đến thứ 5, thứ 6, 7, CN từ sáng đến 16:00 (trừ ngày lễ).', pT: 'Ưu đãi nhóm', pBig: 'ĐI 4 TÍNH 3', pS1: 'Áp dụng cho buffet từ 349K trở lên', pS2: 'Nhóm 4 khách chỉ tính tiền 3 khách. Áp dụng cả ngày thứ Hai đến thứ Năm; thứ Sáu, thứ Bảy, Chủ nhật chỉ áp dụng từ sáng đến 16:00. Không áp dụng ngày lễ.', pS3: 'Chi tiết vui lòng gọi 0934 971 972', cT: 'Buffet Coca', cS: 'Dành cho buổi trưa', 
    },
    en: {
      eyebrow: 'Menu', title: 'Menu', lead: 'Pick a menu, then turn the pages: from starters to mains and sides.',
      note: 'Buffet price per guest, VAT not included. Photos are for illustration only. Tap a page to zoom in.',
      cta: 'Book a table', page: 'Page', of: 'of', prev: 'Previous page', next: 'Next page', hint: 'Use the ← → keys or swipe to turn pages',
      perGuest: '/ GUEST', city: 'DA NANG', menu: 'BUFFET MENU',
      promo: 'Offer: dine 4, pay for 3, on buffets from 349K up, all day Mon to Thu, Fri, Sat, Sun until 4 PM (excl. public holidays).', pT: 'Group offer', pBig: 'DINE 4, PAY 3', pS1: 'On buffets from 349K up', pS2: 'A group of 4 pays for 3 guests. Valid all day Monday to Thursday; Friday, Saturday and Sunday from opening until 4:00 PM only. Not available on public holidays.', pS3: 'For details please call 0934 971 972', cT: 'Coca buffet', cS: 'Lunchtime only', 
    },
  };
  const $ = (id) => document.getElementById(id);
  const lang = () => (window.I18N && I18N.lang === 'en' ? 'en' : 'vi');
  const tr = (v) => (typeof v === 'string' ? v : v[lang()]);
  const mq = window.matchMedia('(max-width: 760px)');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let bookKey = (BOOKS[new URLSearchParams(location.search).get('book')] ? new URLSearchParams(location.search).get('book') : '269K'), pages = [], f = 0, cur = 0, leafEls = [], lb = -1, imgs = [];
  const url = (n) => `/img/menu/${n}`;

  function build() {
    const B = BOOKS[bookKey], narrow = mq.matches;
    pages = [B.cover.img ? { t: 'img', src: B.cover.img, edge: true } : { t: 'cover', big: B.cover.big, small: B.cover.small }];
    if (B.rules) pages.push({ t: 'img', src: 'rules.jpg', zoom: true });
    if (B.promo) pages.push({ t: 'info', kind: 'promo' });
    B.parts.forEach(([ck, list]) => list.forEach((it) => {
      if (it.info) pages.push({ t: 'info', kind: it.info, c: ck });
      else if (it.wide) {
        if (narrow) pages.push({ t: 'img', src: it.wide, c: ck, zoom: true });
        else { if (pages.length % 2 === 0) pages.push({ t: 'blank' }); pages.push({ t: 'wide', src: it.wide, c: ck, side: 'L' }, { t: 'wide', src: it.wide, c: ck, side: 'R' }); }
      } else pages.push({ t: 'img', src: it, c: ck, zoom: true });
    }));
    if (pages.length % 2 === 0) pages.push({ t: 'blank' });
    pages.push({ t: 'img', src: 'back.jpg', edge: true });
    imgs = []; pages.forEach((x) => { if (x.zoom && !imgs.includes(url(x.src))) imgs.push(url(x.src)); });
  }
  const mk = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt !== undefined) e.textContent = txt; return e; };

  function pageEl(pg, idx) {
    const L = TXT[lang()], e = mk('div', 'pg');
    if (pg.t === 'cover') {
      e.classList.add('cover');
      e.append(mk('div', 'cv-k', '牛幸'), mk('div', 'cv-n', 'GYU SACHI'), mk('div', 'cv-s', 'Yakiniku'), mk('div', 'cv-rule'));
      const p = mk('div', 'cv-p', tr(pg.big)); p.append(mk('small', '', pg.small ? tr(pg.small) : L.menu));
      e.append(p, mk('div', 'cv-h', '44 TRẦN VĂN TRỨ · ' + L.city));
    } else if (pg.t === 'info') {
      e.classList.add('infopg');
      if (pg.kind === 'promo') e.append(mk('div', 'dv-no', L.pT), mk('div', 'cv-k', '特典'), mk('div', 'pr-big', L.pBig), mk('div', 'cv-rule'), mk('div', 'pr-s', L.pS1), mk('div', 'pr-s2', L.pS2), mk('div', 'pr-s3', L.pS3));
      else { const p = mk('div', 'cv-p', '15K'); p.append(mk('small', '', L.perGuest)); e.append(mk('div', 'dv-no', L.cS), mk('div', 'cv-k kana', 'コーラ'), mk('div', 'pr-big', L.cT), mk('div', 'cv-rule'), p); }
    } else if (pg.t === 'wide') {
      e.classList.add('imgpg', 'widepg', pg.side === 'L' ? 'wl' : 'wr'); e.style.setProperty('--w', `url("${new URL(url(pg.src), document.baseURI).href}")`);
      e.dataset.src = url(pg.src); e.addEventListener('click', () => openLb(imgs.indexOf(url(pg.src))));
    } else if (pg.t === 'img') {
      e.classList.add('imgpg'); if (pg.edge) e.classList.add('edge');
      const im = mk('img'); im.dataset.src = url(pg.src); im.alt = pg.c ? C[pg.c][lang()] : ''; im.decoding = 'async';
      e.append(im);
      if (pg.zoom) { e.addEventListener('click', () => openLb(imgs.indexOf(im.dataset.src))); if (!pg.c) e.classList.add('rulespg'); } else e.style.cursor = 'default';
    } else e.classList.add('blank'), e.append(mk('div', 'cv-k', '幸'));
    return e;
  }
  const face = (cls, pg, idx) => { const d = mk('div', 'face ' + cls); if (pg) d.append(pageEl(pg, idx)); return d; };

  function loadAround(center, span) {
    const root = mq.matches ? $('single') : $('book');
    root.querySelectorAll('.pg.imgpg').forEach((pgEl) => {
      const i = +pgEl.dataset.i; if (Math.abs(i - center) > span) return;
      if (pgEl.classList.contains('widepg')) { if (!pgEl.classList.contains('on')) pgEl.classList.add('on'); return; }
      const im = pgEl.querySelector('img'); if (im && !im.src) im.src = im.dataset.src;
    });
  }
  function renderBook() {
    const book = $('book'); book.textContent = ''; leafEls = [];
    const n = pages.length / 2;
    for (let i = 0; i < n; i++) {
      const leaf = mk('div', 'leaf');
      const fr = face('front', pages[2 * i], 2 * i), bk = face('back', pages[2 * i + 1], 2 * i + 1);
      fr.firstChild.dataset.i = 2 * i; bk.firstChild.dataset.i = 2 * i + 1;
      leaf.append(fr, bk); book.append(leaf); leafEls.push(leaf);
    }
    leafEls.forEach((l) => { l.style.transition = 'none'; });
    placeLeaves(false); void book.offsetWidth;
    leafEls.forEach((l) => { l.style.transition = ''; });
  }
  function placeLeaves(anim, from) {
    const n = leafEls.length;
    leafEls.forEach((l, i) => {
      l.style.transitionDelay = anim ? Math.min(Math.abs(i - (from ?? f)) * 55, 330) + 'ms' : '0ms';
      l.classList.toggle('flip', i < f);
      l.style.zIndex = i < f ? i + 1 : n - i;
    });
    $('book').style.transform = f === 0 ? 'translateX(-25%)' : f === n ? 'translateX(25%)' : 'none';
  }
  function renderSingle() { const s = $('single'); s.textContent = ''; const el = pageEl(pages[cur], cur); el.dataset.i = cur; s.append(el); }
  const center = () => (mq.matches ? cur : f * 2);

  function updateUi() {
    const L = TXT[lang()], N = pages.length;
    const vis = mq.matches ? [cur] : [f * 2 - 1, f * 2].filter((i) => i >= 0 && i < N);
    $('counter').textContent = vis.length === 1 ? `${L.page} ${vis[0] + 1} ${L.of} ${N}` : `${L.page} ${vis[0] + 1}–${vis[1] + 1} ${L.of} ${N}`;
    $('prev').disabled = mq.matches ? cur === 0 : f === 0;
    $('next').disabled = mq.matches ? cur === N - 1 : f === leafEls.length;
    const ref = vis[vis.length - 1], here = pages.slice(0, ref + 1).reverse().find((x) => x.c);
    document.querySelectorAll('#chaps button').forEach((b) => b.setAttribute('aria-current', String(!!here && b.dataset.k === here.c)));
    loadAround(center(), 5);
    $('prev').setAttribute('aria-label', L.prev); $('next').setAttribute('aria-label', L.next);
  }
  function goSpread(nf) { nf = Math.max(0, Math.min(leafEls.length, nf)); if (nf === f) return; const from = f; f = nf; placeLeaves(!reduce, from); updateUi(); }
  function goPage(p) { if (mq.matches) { cur = Math.max(0, Math.min(pages.length - 1, p)); renderSingle(); updateUi(); } else goSpread(Math.floor((p + 1) / 2)); }
  function step(d) { if (mq.matches) goPage(cur + d); else goSpread(f + d); }

  function renderChrome() {
    const L = TXT[lang()];
    $('m-eyebrow').textContent = L.eyebrow; $('m-title').textContent = L.title; $('m-lead').textContent = L.lead; $('note').textContent = L.note; $('m-cta').textContent = L.cta; $('hint').textContent = L.hint;
    const tabs = $('tabs'); tabs.textContent = '';
    const CAP = { '219K': { vi: 'Buổi trưa', en: 'Lunch' }, carte: { vi: 'Gọi món', en: 'Order' }, drinks: { vi: 'Thức uống', en: 'Beverages' } };
    const MAIN = { carte: { vi: 'Menu lẻ', en: 'À la carte' }, drinks: { vi: 'Đồ uống', en: 'Drinks' } };
    Object.keys(BOOKS).forEach((k) => {
      if (k === '269K' || k === 'carte') tabs.append(mk('span', 'tsep'));
      const b = mk('button', ''); b.type = 'button'; b.setAttribute('aria-pressed', String(k === bookKey));
      b.append(mk('small', '', CAP[k] ? tr(CAP[k]) : 'Buffet'), mk('b', '', MAIN[k] ? tr(MAIN[k]) : k));
      b.addEventListener('click', () => { if (k === bookKey) return; bookKey = k; f = 0; cur = 0; fullRender(); });
      tabs.append(b);
    });
    const on = tabs.querySelector('[aria-pressed=true]'); if (on && tabs.scrollWidth > tabs.clientWidth) tabs.scrollLeft = on.offsetLeft - (tabs.clientWidth - on.offsetWidth) / 2;
    const pr = $('promo'); pr.hidden = !BOOKS[bookKey].promo; pr.textContent = L.promo;
    const ch = $('chaps'); ch.textContent = '';
    const parts = BOOKS[bookKey].parts;
    ch.hidden = parts.length < 2;
    parts.forEach(([ck]) => {
      const b = mk('button'); b.type = 'button'; b.dataset.k = ck;
      b.append(mk('i', '', C[ck].jp), document.createTextNode(C[ck][lang()]));
      b.addEventListener('click', () => goPage(pages.findIndex((x) => x.c === ck)));
      ch.append(b);
    });
  }
  function fullRender() { build(); renderChrome(); if (mq.matches) renderSingle(); else renderBook(); updateUi(); }

  // Phóng to ảnh
  function showLb() { const box = $('lb-img'); box.textContent = ''; const im = mk('img'); im.src = imgs[lb]; im.alt = ''; box.append(im); box.scrollTop = 0; $('lb-n').textContent = `${lb + 1}/${imgs.length}`; }
  function openLb(i) { if (i < 0) return; lb = i; $('lb').hidden = false; document.body.style.overflow = 'hidden'; showLb(); $('lb-x').focus(); }
  function closeLb() { $('lb').hidden = true; document.body.style.overflow = ''; }
  function stepLb(d) { lb = (lb + d + imgs.length) % imgs.length; showLb(); }
  $('lb-x').addEventListener('click', closeLb); $('lb-prev').addEventListener('click', () => stepLb(-1)); $('lb-next').addEventListener('click', () => stepLb(1));
  $('prev').addEventListener('click', () => step(-1)); $('next').addEventListener('click', () => step(1));
  document.addEventListener('keydown', (e) => {
    if (!$('lb').hidden) { if (e.key === 'Escape') closeLb(); if (e.key === 'ArrowLeft') stepLb(-1); if (e.key === 'ArrowRight') stepLb(1); return; }
    if (e.key === 'ArrowLeft') step(-1); if (e.key === 'ArrowRight') step(1);
  });
  let sx = null;
  const stage = document.querySelector('.book-stage');
  stage.addEventListener('pointerdown', (e) => { sx = e.clientX; });
  stage.addEventListener('pointerup', (e) => { if (sx === null) return; const dx = e.clientX - sx; sx = null; if (Math.abs(dx) > 60) step(dx < 0 ? 1 : -1); });
  stage.addEventListener('pointercancel', () => { sx = null; });
  const onMode = () => { if (mq.matches) cur = Math.max(0, f * 2 - (f ? 1 : 0)); else f = Math.floor((cur + 1) / 2); fullRender(); };
  mq.addEventListener ? mq.addEventListener('change', onMode) : mq.addListener(onMode);
  document.querySelectorAll('[data-lang]').forEach((b) => b.addEventListener('click', () => I18N.setLang(b.dataset.lang, fullRender)));
  if (window.I18N) I18N.apply();
  fullRender();
})();
