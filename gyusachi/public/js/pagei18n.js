// Đổi ngôn ngữ cho các trang tĩnh (trang chủ, về chúng tôi). Mỗi trang khai báo window.PAGE_EN = { khóa: 'English' }.
(function () {
  const EN = window.PAGE_EN || {};
  const VI = {};
  document.querySelectorAll('[data-h]').forEach((e) => { if (!(e.dataset.h in VI)) VI[e.dataset.h] = e.innerHTML; });
  function go() {
    const en = I18N.lang === 'en';
    document.querySelectorAll('[data-h]').forEach((e) => { const k = e.dataset.h; e.innerHTML = en && EN[k] !== undefined ? EN[k] : VI[k]; });
  }
  document.querySelectorAll('[data-lang]').forEach((b) => b.addEventListener('click', () => I18N.setLang(b.dataset.lang, go)));
  I18N.apply(); go();
})();
