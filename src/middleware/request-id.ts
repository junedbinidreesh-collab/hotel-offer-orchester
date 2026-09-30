import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';
import type { Logger } from '../utils/logger';

const VALID_REQUEST_ID = /^[A-Za-z0-9_-]{1,64}$/;

export function requestId(logger: Logger): RequestHandler {
  return (req, res, next) => {
    const incoming = req.header('x-request-id');
    req.id = incoming !== undefined && VALID_REQUEST_ID.test(incoming) ? incoming : randomUUID();
    req.log = logger.child({ requestId: req.id });
    res.setHeader('x-request-id', req.id);
    next();
  };
}
