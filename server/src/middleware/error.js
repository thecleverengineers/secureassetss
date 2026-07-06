import { ApiError } from '../utils/apiError.js';
import { env } from '../config/env.js';

export function notFound(req, _res, next) {
  next(new ApiError(404, `Route not found: ${req.method} ${req.originalUrl}`));
}

export function errorHandler(err, req, res, _next) {
  let status = err.statusCode || 500;
  let message = err.message || 'Internal server error';
  if (err.name === 'ValidationError') { status = 422; message = Object.values(err.errors).map((e) => e.message).join(', '); }
  if (err.code === 11000) { status = 409; message = `Duplicate value for ${Object.keys(err.keyPattern || {}).join(', ')}`; }
  if (err.name === 'CastError') { status = 400; message = `Invalid ${err.path}`; }
  res.status(status).json({ success: false, message, requestId: req.id, details: err.details, ...(env.NODE_ENV !== 'production' && { stack: err.stack }) });
}
