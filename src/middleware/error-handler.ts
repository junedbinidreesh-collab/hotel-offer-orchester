import type { ErrorRequestHandler, RequestHandler } from 'express';
import { AppError, NotFoundError } from '../errors/app-error';
import { ErrorCode } from '../errors/error-codes';

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new NotFoundError(ErrorCode.ROUTE_NOT_FOUND, `Route ${req.method} ${req.path} not found`));
};

// Express recognises error handlers by their four-argument signature.
export const errorHandler: ErrorRequestHandler = (err: unknown, req, res, _next) => {
  if (err instanceof AppError) {
    const level = err.statusCode >= 500 ? 'error' : 'warn';
    req.log[level]({ err, code: err.code }, err.message);
    res.status(err.statusCode).json({ error: { code: err.code, message: err.message } });
    return;
  }

  req.log.error({ err }, 'Unhandled error');
  res.status(500).json({ error: { code: ErrorCode.INTERNAL_ERROR, message: 'Internal server error' } });
};
