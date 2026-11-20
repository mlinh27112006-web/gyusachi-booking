PATCH: THIẾT KẾ LẠI TRANG "BUFFET COCA TRƯA 15K" (quyển thực đơn Đồ uống)
Chép vào dự án đúng đường dẫn:
 public/js/menu.js            (thay hàm dựng trang Coca; tự nạp css riêng, không cần sửa menu.html)
 public/css/menu-coca.css     (mới)
 public/img/menu/coca-1l5.webp (mới, ảnh chai Coca 1,5L đã tách nền)
Sau khi đẩy lên: bấm Ctrl+F5 khi xem. Nếu web có service worker (PWA) giữ bản cũ, mở DevTools > Application > Service Workers > Unregister, hoặc tăng số phiên bản cache trong sw.js rồi đẩy lại.
Muốn đổi chữ: sửa các khóa cT, cT2, cS, cEb, cTag, cHr trong menu.js (có cả tiếng Việt và tiếng Anh). Giờ 10:30 – 14:00 và hotline nằm trong hàm cocaParts.
Ảnh gốc chỉ cao 610 px nên hơi mềm khi phóng to: nếu có ảnh chai nét hơn (cao từ 1500 px), thay file coca-1l5.webp là xong.
