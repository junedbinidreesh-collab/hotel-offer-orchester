import { ServiceError, WorkflowFailedError } from '@temporalio/client';
import { ApplicationFailure, TimeoutFailure } from '@temporalio/common';
import { DependencyUnavailableError } from '../errors/app-error';
import { ErrorCode } from '../errors/error-codes';

/** Translates Temporal client/workflow failures into errors the HTTP layer understands. */
export function mapWorkflowError(error: unknown): Error {
  if (error instanceof WorkflowFailedError) {
    const chain = causeChain(error);
    const failureType = chain.find((e): e is ApplicationFailure => e instanceof ApplicationFailure)?.type;

    if (failureType === ErrorCode.ALL_SUPPLIERS_FAILED) {
      return new DependencyUnavailableError(ErrorCode.ALL_SUPPLIERS_FAILED, 'All hotel suppliers are unavailable', {
        cause: error,
      });
    }
    if (failureType === ErrorCode.REDIS_UNAVAILABLE) {
      return new DependencyUnavailableError(ErrorCode.REDIS_UNAVAILABLE, 'Offer storage is unavailable', {
        cause: error,
      });
    }
    if (chain.some((e) => e instanceof TimeoutFailure)) {
      return new DependencyUnavailableError(ErrorCode.WORKFLOW_TIMEOUT, 'Hotel search timed out', { cause: error });
    }
  }

  // Any gRPC-level failure means the Temporal server could not be reached or rejected the call.
  if (error instanceof ServiceError) {
    return new DependencyUnavailableError(ErrorCode.TEMPORAL_UNAVAILABLE, 'Workflow engine is unavailable', {
      cause: error,
    });
  }
  return error instanceof Error ? error : new Error(String(error));
}

function causeChain(error: Error): Error[] {
  const chain: Error[] = [];
  let current: unknown = error;
  while (current instanceof Error) {
    chain.push(current);
    current = current.cause;
  }
  return chain;
}
