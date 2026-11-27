// Từ điển song ngữ Việt/Anh cho trang khách. Dùng: t('key', {n: 3}) và thuộc tính data-i18n trong HTML.
(function () {
  const DICT = {
    vi: {
      brandSub: 'Yakiniku Đà Nẵng',
      navAbout: 'Về chúng tôi', navJobs: 'Tuyển dụng', navBook: 'Đặt bàn', navLookup: 'Tra cứu', navHome: 'Trang chủ', navMenu: 'Thực đơn',
      bookTitle: 'Đặt bàn',
      bookLead: '44 Trần Văn Trứ, Đà Nẵng. Bàn được xác nhận ngay khi bạn đặt xong.',
      step1: 'Ngày, số khách và giờ',
      step2: 'Chọn bàn',
      step3: 'Thông tin của bạn',
      date: 'Ngày', party: 'Số khách', time: 'Giờ đến',
      guestsUnit: 'khách',
      lunch: 'Trưa', dinner: 'Tối',
      noSlots: 'Không còn giờ nhận khách trong ngày này. Vui lòng chọn ngày khác.',
      soldOut: 'Hết bàn',
      bigGroup: 'Nhóm trên {max} khách vui lòng gọi hotline {hotline} để được sắp xếp.',
      pickTimeFirst: 'Chọn giờ đến để xem sơ đồ bàn.',
      floor: 'Tầng {n}',
      floorFree: '{n} bàn trống',
      legendFree: 'Còn trống', legendSelected: 'Bàn của bạn', legendTaken: 'Đã đặt hoặc đang được giữ', legendOff: 'Không phù hợp số khách',
      mapHint: 'Chỉ hiện các bàn vừa với nhóm của bạn. Hết bàn vừa, hệ thống sẽ mở bàn lớn hơn.',
      seatsOf: '{n} chỗ',
      stFree: 'còn trống, bấm để chọn', stSelected: 'bàn bạn đang giữ, bấm để bỏ chọn', stTaken: 'đã đặt hoặc đang được giữ',
      stSmall: 'không đủ chỗ cho nhóm của bạn', stNotOffered: 'chưa mở, vì còn bàn vừa hơn',
      vip: 'VIP',
      holding: 'Đang giữ bàn {code} cho bạn', holdLeft: 'còn {time}',
      holdOver: 'Hết thời gian giữ bàn. Vui lòng chọn lại bàn.',
      selectTableFirst: 'Chọn một bàn trên sơ đồ để nhập thông tin.',
      fullName: 'Họ và tên', phone: 'Số điện thoại', note: 'Ghi chú (không bắt buộc)',
      notePh: 'Ví dụ: có trẻ em, cần ghế em bé, dị ứng hải sản',
      submit: 'Đặt bàn', submitting: 'Đang đặt bàn',
      required: 'Vui lòng nhập {field}.',
      doneTitle: 'Đặt bàn thành công',
      doneLead: 'Hãy lưu mã này. Bạn cần mã và số điện thoại để tra cứu hoặc hủy lượt đặt.',
      doneCode: 'Mã đặt bàn',
      rName: 'Họ tên', rPhone: 'Số điện thoại', rWhen: 'Thời gian', rTable: 'Bàn', rParty: 'Số khách',
      rTableVal: '{code}, tầng {floor}',
      rWhenVal: '{from} đến {to}, ngày {date}',
      holdNote: 'Bàn được giữ 2 tiếng kể từ giờ đến.',
      lookupLink: 'Tra cứu hoặc hủy lượt đặt', bookAgain: 'Đặt thêm bàn khác',
      hotlineLabel: 'Hotline',
      networkError: 'Không kết nối được máy chủ. Vui lòng kiểm tra mạng và thử lại.',
      weekdays: ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'],
      today: 'Hôm nay',
      footer: 'Gyu Sachi Yakiniku, 44 Trần Văn Trứ, Đà Nẵng',
      loading: 'Đang tải',
      lookupTitle: 'Tra cứu đặt bàn',
      lookupLead: 'Nhập số điện thoại và mã đặt bàn (dạng GYU-1234) để xem hoặc hủy lượt đặt.',
      codeLabel: 'Mã đặt bàn', codePh: 'GYU-1234',
      findBtn: 'Tra cứu', finding: 'Đang tra cứu',
      status: 'Trạng thái',
      stConfirmed: 'Đã xác nhận', stCompleted: 'Đã hoàn thành', stNoShow: 'Không đến', stCancelled: 'Đã hủy',
      cancelBtn: 'Hủy lượt đặt', cancelAsk: 'Bạn chắc chắn muốn hủy lượt đặt này? Bàn sẽ được trả lại cho khách khác.',
      cancelYes: 'Hủy lượt đặt', cancelKeep: 'Giữ lại', cancelling: 'Đang hủy',
      cancelledOk: 'Đã hủy lượt đặt. Bàn đã được trả lại.',
      cannotCancel: 'Lượt đặt này không thể hủy online. Vui lòng gọi hotline {hotline}.',
      searchAgain: 'Tra cứu lượt khác',
    },
    en: {
      brandSub: 'Yakiniku Da Nang',
      navAbout: 'About us', navJobs: 'Careers', navBook: 'Book a table', navLookup: 'Find booking', navHome: 'Home', navMenu: 'Menu',
      bookTitle: 'Book a table',
      bookLead: '44 Tran Van Tru, Da Nang. Your table is confirmed as soon as you finish booking.',
      step1: 'Date, guests and time',
      step2: 'Choose a table',
      step3: 'Your details',
      date: 'Date', party: 'Guests', time: 'Arrival time',
      guestsUnit: 'guests',
      lunch: 'Lunch', dinner: 'Dinner',
      noSlots: 'No more seatings on this day. Please choose another date.',
      soldOut: 'Full',
      bigGroup: 'For groups of more than {max}, please call {hotline} and we will arrange seating.',
      pickTimeFirst: 'Choose an arrival time to see the floor plan.',
      floor: 'Floor {n}',
      floorFree: '{n} free',
      legendFree: 'Available', legendSelected: 'Your table', legendTaken: 'Booked or held by someone else', legendOff: 'Does not fit your party',
      mapHint: 'Only tables that fit your party are offered. When those run out, larger tables open up.',
      seatsOf: '{n} seats',
      stFree: 'available, press to select', stSelected: 'held for you, press to release', stTaken: 'booked or held',
      stSmall: 'too small for your party', stNotOffered: 'not open yet, a better-fitting table is still free',
      vip: 'VIP',
      holding: 'Holding table {code} for you', holdLeft: '{time} left',
      holdOver: 'Your hold has expired. Please choose a table again.',
      selectTableFirst: 'Choose a table on the plan to enter your details.',
      fullName: 'Full name', phone: 'Phone number', note: 'Note (optional)',
      notePh: 'For example: children, baby chair, seafood allergy',
      submit: 'Book table', submitting: 'Booking',
      required: 'Please enter your {field}.',
      doneTitle: 'Table booked',
      doneLead: 'Keep this code. You need it with your phone number to look up or cancel the booking.',
      doneCode: 'Booking code',
      rName: 'Name', rPhone: 'Phone', rWhen: 'Time', rTable: 'Table', rParty: 'Guests',
      rTableVal: '{code}, floor {floor}',
      rWhenVal: '{from} to {to}, {date}',
      holdNote: 'Your table is held for 2 hours from the arrival time.',
      lookupLink: 'Find or cancel a booking', bookAgain: 'Book another table',
      hotlineLabel: 'Hotline',
      networkError: 'Cannot reach the server. Check your connection and try again.',
      weekdays: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
      today: 'Today',
      footer: 'Gyu Sachi Yakiniku, 44 Tran Van Tru, Da Nang',
      loading: 'Loading',
      lookupTitle: 'Find your booking',
      lookupLead: 'Enter your phone number and booking code (like GYU-1234) to view or cancel a booking.',
      codeLabel: 'Booking code', codePh: 'GYU-1234',
      findBtn: 'Find booking', finding: 'Searching',
      status: 'Status',
      stConfirmed: 'Confirmed', stCompleted: 'Completed', stNoShow: 'No-show', stCancelled: 'Cancelled',
      cancelBtn: 'Cancel booking', cancelAsk: 'Cancel this booking? The table will be released for other guests.',
      cancelYes: 'Cancel booking', cancelKeep: 'Keep it', cancelling: 'Cancelling',
      cancelledOk: 'Booking cancelled. The table has been released.',
      cannotCancel: 'This booking cannot be cancelled online. Please call {hotline}.',
      searchAgain: 'Find another booking',
    },
  };

  // Lời nhắn lỗi của máy chủ đang bằng tiếng Việt; bản tiếng Anh dịch theo mã lỗi.
  const ERR_EN = {
    LOCK_EXPIRED: 'Your hold has expired. Please choose a table again.',
    TABLE_UNAVAILABLE: 'This table is no longer available for your party. Please choose another.',
    TABLE_CONFLICT: 'This table was just taken. Please choose another table or time.',
    TABLE_HELD: 'Someone else is holding this table. Please choose another.',
    INVALID_PHONE: 'Invalid phone number. Use 10 digits, for example 0905123456.',
    INVALID_NAME: 'Please enter your full name (2 to 100 characters).',
    NOTE_TOO_LONG: 'Note can be at most 500 characters.',
    PARTY_TOO_LARGE: 'This party is too large to book online. Please call the hotline.',
    INVALID_TIME: 'We do not seat guests at this time. Please choose another time.',
    DATE_IN_PAST: 'This date has passed.',
    DATE_TOO_FAR: 'This date is too far ahead.',
    RETRY: 'The system is busy. Please try again.',
    NOT_FOUND: 'Booking not found. Check the phone number and booking code.',
    NOT_CANCELLABLE: 'This booking can no longer be cancelled online.',
    INVALID_CODE: 'The booking code looks like GYU-1234.',
  };

  let lang = 'vi';
  try { lang = localStorage.getItem('gyu_lang') === 'en' ? 'en' : 'vi'; } catch (e) { /* trình duyệt chặn lưu trữ: dùng mặc định */ }

  function t(key, params) {
    let s = (DICT[lang] && DICT[lang][key]);
    if (s === undefined) s = DICT.vi[key];
    if (typeof s !== 'string') return s === undefined ? key : s;
    return s.replace(/\{(\w+)\}/g, (m, k) => (params && params[k] !== undefined ? params[k] : m));
  }

  function errText(err) {
    if (!err) return '';
    if (lang === 'en' && ERR_EN[err.code]) return ERR_EN[err.code];
    return err.message || t('networkError');
  }

  function apply(root) {
    (root || document).querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
    (root || document).querySelectorAll('[data-i18n-ph]').forEach((el) => { el.placeholder = t(el.dataset.i18nPh); });
    document.documentElement.lang = lang;
    document.querySelectorAll('[data-lang]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
  }

  function setLang(next, onChange) {
    lang = next === 'en' ? 'en' : 'vi';
    try { localStorage.setItem('gyu_lang', lang); } catch (e) { /* bỏ qua */ }
    apply();
    if (onChange) onChange();
  }

  window.I18N = { t, errText, apply, setLang, get lang() { return lang; } };
})();
