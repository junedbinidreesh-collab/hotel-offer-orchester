import { Router } from 'express';
import type { createHotelController } from '../controllers/hotel.controller';

export function createHotelRouter(controller: ReturnType<typeof createHotelController>): Router {
  const router = Router();
  router.get('/', controller.list);
  return router;
}
