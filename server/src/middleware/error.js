import { ApiError } from '../utils/ApiError.js';
import { logger } from '../config/logger.js';
import { env } from '../config/env.js';

export const notFoundHandler = (req, _res, next) =>
  next(ApiError.notFound('ROUTE_NOT_FOUND', `No route for ${req.method} ${req.path}`));

export const errorHandler = (err, req, res, _next) => {
  let e = err;
  if (err?.code === 11000) e = ApiError.conflict('DUPLICATE', 'A record with those details already exists');
  else if (err?.name === 'VersionError') e = ApiError.conflict('CONFLICT', 'Your bag changed in another window. Please try again.');
  else if (err?.name === 'CastError') e = ApiError.badRequest('INVALID_ID', 'Invalid identifier');
  else if (err?.name === 'ValidationError') e = ApiError.badRequest('VALIDATION_ERROR', 'Validation failed',
    Object.values(err.errors ?? {}).map((x) => ({ field: x.path, message: x.message })));
  else if (['MongoNetworkError', 'MongoNetworkTimeoutError', 'MongooseServerSelectionError', 'MongoServerSelectionError'].includes(err?.name)) e = new ApiError(503, 'SERVICE_UNAVAILABLE', 'We are having trouble reaching our database. Please try again in a moment.');
  else if (err?.type === 'entity.too.large') e = new ApiError(413, 'PAYLOAD_TOO_LARGE', 'Request body too large');
  else if (err?.type === 'entity.parse.failed') e = ApiError.badRequest('INVALID_JSON', 'Malformed JSON body');

  if (!(e instanceof ApiError)) {
    logger.error({ err, path: req.path, method: req.method }, 'Unhandled error');
    e = new ApiError(500, 'INTERNAL_ERROR', 'Something went wrong on our side. Please try again.');
  } else if (e.status >= 500) logger.error({ err: e, path: req.path }, 'Server error');

  res.status(e.status).json({
    success: false, code: e.code, message: e.message, ...(req.id ? { requestId: String(req.id) } : {}),
    ...(e.details ? { details: e.details } : {}),
    ...(!env.isProd && e.status === 500 ? { debug: String(err?.stack ?? err) } : {}),
  });
};
