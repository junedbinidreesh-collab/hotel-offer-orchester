import { ApplicationFailure } from '@temporalio/common';
import { DependencyUnavailableError } from '../../errors/app-error';
import { ErrorCode } from '../../errors/error-codes';
import type { Logger } from '../../utils/logger';

/**
 * Converts domain errors into Temporal failures. The error code becomes the failure
 * `type`, which is how the HTTP side recognises what went wrong after the workflow fails.
 */
export function toApplicationFailure(error: unknown): ApplicationFailure {
  if (error instanceof DependencyUnavailableError) {
    return ApplicationFailure.create({
      message: error.message,
      type: error.code,
      nonRetryable: !error.retryable,
    });
  }
  const message = error instanceof Error ? error.message : String(error);
  return ApplicationFailure.create({ message, type: ErrorCode.INTERNAL_ERROR, nonRetryable: true });
}

export async function runAsActivity<T>(
  logger: Logger,
  failureMessage: string,
  context: Record<string, unknown>,
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    logger.error({ err: error, ...context }, failureMessage);
    throw toApplicationFailure(error);
  }
}
