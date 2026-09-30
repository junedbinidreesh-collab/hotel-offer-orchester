import { NativeConnection, Worker } from '@temporalio/worker';
import type { Config } from '../config/env';
import type { HotelActivities } from './activities/hotel.activities';
import type { SupplierActivities } from './activities/supplier.activities';

export interface HotelOfferWorker {
  worker: Worker;
  connection: NativeConnection;
}

export async function createHotelOfferWorker(
  config: Pick<Config, 'TEMPORAL_ADDRESS' | 'TEMPORAL_NAMESPACE' | 'TEMPORAL_TASK_QUEUE'>,
  activities: SupplierActivities & HotelActivities,
): Promise<HotelOfferWorker> {
  const connection = await NativeConnection.connect({ address: config.TEMPORAL_ADDRESS });
  const worker = await Worker.create({
    connection,
    namespace: config.TEMPORAL_NAMESPACE,
    taskQueue: config.TEMPORAL_TASK_QUEUE,
    workflowsPath: require.resolve('./workflows/hotel-offer.workflow'),
    activities,
  });
  return { worker, connection };
}
