const { AppError } = require('../errors');

function notFound(req, res) {
  res.status(404).json({ error: 'Không tìm thấy đường dẫn này', code: 'NOT_FOUND' });
}

// Đổi lỗi của PostgreSQL thành phản hồi dễ hiểu cho người dùng.
function fromPgError(err) {
  switch (err.code) {
    case '23P01': // vi phạm EXCLUDE: trùng bàn, trùng giờ (đặt bàn hoặc khóa mềm)
      return new AppError(409, 'Bàn này vừa có người đặt hoặc đang được giữ trong khung giờ đó. Bạn vui lòng chọn bàn hoặc giờ khác.', 'TABLE_CONFLICT');
    case '40P01': // hai giao dịch chờ nhau: xem như bàn vừa bị người khác lấy
    case '40001':
      return new AppError(409, 'Hệ thống đang bận, bạn vui lòng thử lại', 'RETRY');
    case '23505': // trùng giá trị UNIQUE (mã đặt bàn, số điện thoại, tên đăng nhập...)
      return new AppError(409, 'Dữ liệu này đã tồn tại', 'DUPLICATE');
    case '23514': // vi phạm CHECK hoặc trigger kiểm tra (vượt sức chứa, đổi trạng thái cuối...)
      return new AppError(400, err.message, 'INVALID_DATA');
    case '42501': // nhật ký chỉ thêm, không sửa/xóa
      return new AppError(403, err.message, 'FORBIDDEN');
    default:
      return null;
  }
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const mapped = err instanceof AppError ? err : fromPgError(err);
  if (mapped) {
    return res.status(mapped.status).json({ error: mapped.message, code: mapped.code });
  }
  console.error(err);
  const body = { error: 'Lỗi hệ thống, vui lòng thử lại sau', code: 'SERVER_ERROR' };
  // Khi phát triển, hiện luôn nguyên nhân thật trên trình duyệt để dễ sửa lỗi.
  if (process.env.NODE_ENV !== 'production') {
    body.detail = err.message || err.code || String(err);
  }
  res.status(500).json(body);
}

module.exports = { notFound, errorHandler };
