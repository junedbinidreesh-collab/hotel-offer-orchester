import { ServiceError, WorkflowFailedError } from '@temporalio/client';
import { ApplicationFailure, RetryState, TimeoutFailure, TimeoutType } from '@temporalio/common';
import { describe, expect, it } from 'vitest';
import { DependencyUnavailableError } from '../../src/errors/app-error';
import { ErrorCode } from '../../src/errors/error-codes';
import { mapWorkflowError } from '../../src/temporal/workflow-error-mapper';

const workflowFailure = (cause: Error): WorkflowFailedError =>
  new WorkflowFailedError('Workflow failed', cause, RetryState.NON_RETRYABLE_FAILURE);

describe('mapWorkflowError', () => {
  it('maps ALL_SUPPLIERS_FAILED to a 503 dependency error', () => {
    const mapped = mapWorkflowError(
      workflowFailure(ApplicationFailure.nonRetryable('boom', ErrorCode.ALL_SUPPLIERS_FAILED)),
    );

    expect(mapped).toBeInstanceOf(DependencyUnavailableError);
    expect(mapped).toMatchObject({ code: ErrorCode.ALL_SUPPLIERS_FAILED, statusCode: 503 });
  });

  it('maps a Redis failure nested inside another failure', () => {
    const inner = ApplicationFailure.nonRetryable('redis down', ErrorCode.REDIS_UNAVAILABLE);
    const outer = new WorkflowFailedError('Workflow failed', inner, RetryState.RETRY_POLICY_NOT_SET);

    expect(mapWorkflowError(outer)).toMatchObject({ code: ErrorCode.REDIS_UNAVAILABLE, statusCode: 503 });
  });

  it('maps a workflow timeout', () => {
    const timeout = new TimeoutFailure('timed out', undefined, TimeoutType.START_TO_CLOSE);

    expect(mapWorkflowError(workflowFailure(timeout))).toMatchObject({ code: ErrorCode.WORKFLOW_TIMEOUT });
  });

  it('maps Temporal connectivity errors', () => {
    expect(mapWorkflowError(new ServiceError('unavailable'))).toMatchObject({ code: ErrorCode.TEMPORAL_UNAVAILABLE });
  });

  it('passes unknown errors through untouched', () => {
    const original = new Error('bug');

    expect(mapWorkflowError(original)).toBe(original);
  });
});
