PATCH: XUẤT BÁO CÁO CSV (màn Báo cáo, quyền report.view: owner, admin, manager)
Chép đè/thêm các file cùng đường dẫn rồi chạy lại server (không cần migration):
 src/services/csvExport.js (mới)   src/controllers/reportController.js   src/routes/staffAdmin.js   admin/js/screens-admin.js
Hai nút mới: "Tải CSV chi tiết" (mỗi dòng một lượt đặt) và "Tải CSV theo ngày" (tổng hợp từng ngày), theo khoảng ngày đang chọn (tối đa 92 ngày).
- File UTF-8 có BOM, mở thẳng bằng Excel không lỗi tiếng Việt. Số điện thoại có một khoảng trắng sau 4 số đầu để Excel không làm mất số 0.
- Ô bắt đầu bằng = + - @ được thêm dấu ' để Excel không chạy thành công thức.
- Mỗi lần xuất ghi nhật ký "report.export" vì file có số điện thoại khách.
