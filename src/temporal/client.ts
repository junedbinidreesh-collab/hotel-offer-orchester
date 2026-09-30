import { randomUUID } from 'node:crypto';
import { Client, Connection } from '@temporalio/client';
import type { Config } from '../config/env';
import type { HotelOfferWorkflowRunner } from '../services/hotel.service';
import type { Logger } from '../utils/logger';
import { HOTEL_OFFER_WORKFLOW_NAME, type HotelOfferWorkflowInput, type HotelOfferWorkflowResult } from './types';
import type { hotelOfferWorkflow } from './workflows/hotel-offer.workflow';
import { mapWorkflowError } from './workflow-error-mapper';

const HEALTH_DEADLINE_MS = 2000;

type TemporalConfig = Pick<
  Config,
  'TEMPORAL_ADDRESS' | 'TEMPORAL_NAMESPACE' | 'TEMPORAL_TASK_QUEUE' | 'WORKFLOW_TIMEOUT_MS'
>;

export async function connectTemporal(config: TemporalConfig): Promise<{ client: Client; connection: Connection }> {
  const connection = await Connection.connect({ address: config.TEMPORAL_ADDRESS });
  const client = new Client({ connection, namespace: config.TEMPORAL_NAMESPACE });
  return { client, connection };
}

export async function pingTemporal(connection: Connection): Promise<void> {
  await connection.withDeadline(Date.now() + HEALTH_DEADLINE_MS, () =>
    connection.workflowService.getSystemInfo({}),
  );
}

export class TemporalHotelOfferRunner implements HotelOfferWorkflowRunner {
  constructor(
    private readonly client: Client,
    private readonly config: TemporalConfig,
    private readonly logger: Logger,
  ) {}

  async run(
    input: HotelOfferWorkflowInput,
    context: { requestId: string },
  ): Promise<HotelOfferWorkflowResult> {
    const workflowId = `hotel-offers-${randomUUID()}`;
    const log = this.logger.child({ workflowId, requestId: context.requestId, city: input.city });
    log.info('Workflow starting');

    try {
      const result = await this.client.workflow.execute<typeof hotelOfferWorkflow>(HOTEL_OFFER_WORKFLOW_NAME, {
        taskQueue: this.config.TEMPORAL_TASK_QUEUE,
        workflowId,
        args: [input],
        workflowExecutionTimeout: this.config.WORKFLOW_TIMEOUT_MS,
        memo: { requestId: context.requestId, city: input.city },
      });
      log.info(
        { totalOffers: result.totalOffers, returnedOffers: result.offers.length, failedSuppliers: result.failedSuppliers },
        'Workflow completed',
      );
      return result;
    } catch (error) {
      log.error({ err: error }, 'Workflow failed');
      throw mapWorkflowError(error);
    }
  }
}
