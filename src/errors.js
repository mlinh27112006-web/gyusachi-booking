// Lỗi có mã HTTP rõ ràng để route ném ra, errorHandler sẽ trả về cho người dùng.
class AppError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

module.exports = { AppError };
