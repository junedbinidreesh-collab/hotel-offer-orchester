import type { ErrorCode } from './error-codes';

export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly statusCode: number,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class ValidationError extends AppError {
  constructor(code: ErrorCode, message: string) {
    super(code, message, 400);
  }
}

export class NotFoundError extends AppError {
  constructor(code: ErrorCode, message: string) {
    super(code, message, 404);
  }
}

export class DependencyUnavailableError extends AppError {
  readonly retryable: boolean;

  constructor(code: ErrorCode, message: string, options?: ErrorOptions & { retryable?: boolean }) {
    super(code, message, 503, options);
    this.retryable = options?.retryable ?? true;
  }
}
