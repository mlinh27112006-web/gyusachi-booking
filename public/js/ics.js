// Tạo và tải file lịch .ics cho một lượt đặt bàn (chạy hoàn toàn trên trình duyệt, không gửi dữ liệu đi đâu).
// Dùng: GyuICS.download({ bookingCode, start: 'YYYY-MM-DD HH:MM', end, tableCode, floor, partySize }, hotline, lang)
(function () {
  'use strict';
  const PLACE = 'Gyu Sachi Yakiniku, 44 Trần Văn Trứ, Đà Nẵng';

  // Giờ trong dữ liệu là giờ Việt Nam (UTC+7); đổi sang UTC để lịch nào cũng hiểu đúng.
  function utc(local) {
    const d = new Date(`${local.replace(' ', 'T')}:00+07:00`);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}T${p(d.getUTCHours())}${p(d.getUTCMinutes())}00Z`;
  }
  const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  // Mỗi dòng .ics tối đa 75 byte; dòng dài cắt rồi nối tiếp bằng một khoảng trắng.
  function fold(line) {
    const enc = new TextEncoder(); const dec = new TextDecoder(); const out = []; let cur = ''; let size = 0;
    for (const ch of line) {
      const n = enc.encode(ch).length;
      if (size + n > (out.length ? 74 : 75)) { out.push(cur); cur = ''; size = 0; }
      cur += ch; size += n;
    }
    out.push(cur); void dec; return out.join('\r\n ');
  }

  function build(b, hotline, lang) {
    const en = lang === 'en';
    const title = en ? `Dinner at Gyu Sachi Yakiniku (table ${b.tableCode.toUpperCase()})` : `Ăn tại Gyu Sachi Yakiniku (bàn ${b.tableCode.toUpperCase()})`;
    const desc = en
      ? `Booking code: ${b.bookingCode}\nTable ${b.tableCode.toUpperCase()}, floor ${b.floor}, ${b.partySize} guests.\nThe table is held up to 30 minutes after the booking time.\nHotline: ${hotline || ''}`
      : `Mã đặt bàn: ${b.bookingCode}\nBàn ${b.tableCode.toUpperCase()}, tầng ${b.floor}, ${b.partySize} khách.\nNhà hàng giữ bàn tối đa 30 phút sau giờ hẹn.\nHotline: ${hotline || ''}`;
    const lines = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Gyu Sachi Yakiniku//Booking//VI', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
      'BEGIN:VEVENT', `UID:${b.bookingCode}@gyusachi-booking`, `DTSTAMP:${utc(b.start).slice(0, 8)}T000000Z`,
      `DTSTART:${utc(b.start)}`, `DTEND:${utc(b.end)}`, `SUMMARY:${esc(title)}`, `LOCATION:${esc(PLACE)}`, `DESCRIPTION:${esc(desc)}`,
      'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(title)}`, 'TRIGGER:-PT2H', 'END:VALARM',
      'END:VEVENT', 'END:VCALENDAR',
    ];
    return `${lines.map(fold).join('\r\n')}\r\n`;
  }

  function download(b, hotline, lang) {
    const blob = new Blob([build(b, hotline, lang)], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = `${b.bookingCode}.ics`; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  window.GyuICS = { build, download };
})();
