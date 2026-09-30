import type { RequestHandler } from 'express';

const NANOSECONDS_PER_MILLISECOND = 1e6;

export const requestLogger: RequestHandler = (req, res, next) => {
  const startedAt = process.hrtime.bigint();
  req.log.info({ method: req.method, path: req.path, query: req.query }, 'Incoming request');

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / NANOSECONDS_PER_MILLISECOND;
    req.log.info({ method: req.method, path: req.path, statusCode: res.statusCode, durationMs }, 'Request completed');
  });
  next();
};
