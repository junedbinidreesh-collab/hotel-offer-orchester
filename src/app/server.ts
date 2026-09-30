import { config } from '../config/env';
import { createHotelActivities } from '../temporal/activities/hotel.activities';
import { createSupplierActivities } from '../temporal/activities/supplier.activities';
import { connectTemporal, pingTemporal, TemporalHotelOfferRunner } from '../temporal/client';
import { createHotelOfferWorker } from '../temporal/worker';
import { HotelRepository } from '../repositories/hotel.repository';
import { HealthService } from '../services/health.service';
import { HotelService } from '../services/hotel.service';
import { createRedisClient, pingRedis } from '../services/redis.service';
import { createSupplierClient } from '../suppliers/supplier.client';
import { logger } from '../utils/logger';
import { createApp } from './app';

export async function startServer(): Promise<void> {
  const redis = createRedisClient(config, logger);
  const { client, connection } = await connectTemporal(config);

  const supplierA = createSupplierClient({
    name: 'Supplier A',
    url: config.SUPPLIER_A_URL,
    timeoutMs: config.SUPPLIER_TIMEOUT_MS,
  });
  const supplierB = createSupplierClient({
    name: 'Supplier B',
    url: config.SUPPLIER_B_URL,
    timeoutMs: config.SUPPLIER_TIMEOUT_MS,
  });

  const repository = new HotelRepository(redis, config.OFFERS_TTL_SECONDS);
  const { worker, connection: workerConnection } = await createHotelOfferWorker(config, {
    ...createSupplierActivities({ 'Supplier A': supplierA, 'Supplier B': supplierB }, logger),
    ...createHotelActivities(repository, logger),
  });

  const app = createApp({
    logger,
    hotelService: new HotelService(new TemporalHotelOfferRunner(client, config, logger)),
    healthService: new HealthService(
      {
        redis: () => pingRedis(redis),
        temporal: () => pingTemporal(connection),
        supplierA: () => supplierA.ping(),
        supplierB: () => supplierB.ping(),
      },
      logger,
    ),
    mockSuppliers: {
      supplierAForceFailure: config.SUPPLIER_A_FORCE_FAILURE,
      supplierBForceFailure: config.SUPPLIER_B_FORCE_FAILURE,
    },
  });

  const server = app.listen(config.PORT, () => {
    logger.info({ port: config.PORT, taskQueue: config.TEMPORAL_TASK_QUEUE }, 'Hotel offer orchestrator started');
  });

  const workerRun = worker.run().catch((err: unknown) => {
    logger.fatal({ err }, 'Temporal worker crashed');
    process.exit(1);
  });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Shutting down');
    server.close();
    worker.shutdown();
    await workerRun;
    await connection.close();
    await workerConnection.close();
    redis.disconnect();
    process.exit(0);
  };
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  process.once('SIGINT', () => void shutdown('SIGINT'));
}
