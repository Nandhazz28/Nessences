export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
  static badRequest(code, msg, details) { return new ApiError(400, code, msg, details); }
  static unauthorized(code = 'UNAUTHORIZED', msg = 'Authentication required') { return new ApiError(401, code, msg); }
  static forbidden(code = 'FORBIDDEN', msg = 'You do not have permission to do that') { return new ApiError(403, code, msg); }
  static notFound(code = 'NOT_FOUND', msg = 'Resource not found') { return new ApiError(404, code, msg); }
  static conflict(code, msg) { return new ApiError(409, code, msg); }
}
