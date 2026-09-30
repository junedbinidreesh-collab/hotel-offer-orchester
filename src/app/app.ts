import express, { type Express } from 'express';
import { createHealthController } from '../controllers/health.controller';
import { createHotelController } from '../controllers/hotel.controller';
import { errorHandler, notFoundHandler } from '../middleware/error-handler';
import { requestId } from '../middleware/request-id';
import { requestLogger } from '../middleware/request-logger';
import { createHealthRouter } from '../routes/health.routes';
import { createHotelRouter } from '../routes/hotel.routes';
import { createSupplierRouter, type MockSupplierFlags } from '../routes/supplier.routes';
import type { HealthService } from '../services/health.service';
import type { HotelService } from '../services/hotel.service';
import type { Logger } from '../utils/logger';

export interface AppDependencies {
  logger: Logger;
  hotelService: HotelService;
  healthService: HealthService;
  mockSuppliers: MockSupplierFlags;
}

export function createApp({ logger, hotelService, healthService, mockSuppliers }: AppDependencies): Express {
  const app = express();
  app.disable('x-powered-by');

  app.use(requestId(logger));
  app.use(requestLogger);

  app.use('/api/hotels', createHotelRouter(createHotelController(hotelService)));
  app.use('/health', createHealthRouter(createHealthController(healthService)));
  app.use(createSupplierRouter(mockSuppliers));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
