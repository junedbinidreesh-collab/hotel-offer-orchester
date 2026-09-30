import type { Request, Response } from 'express';
import type { HotelService } from '../services/hotel.service';
import { parseHotelQuery } from '../validation/hotel-query';

export const DEGRADED_SUPPLIERS_HEADER = 'X-Degraded-Suppliers';

export function createHotelController(hotelService: HotelService) {
  return {
    async list(req: Request, res: Response): Promise<void> {
      const query = parseHotelQuery(req.query);
      const result = await hotelService.getHotels(query, req.id);

      if (result.failedSuppliers.length > 0) {
        res.setHeader(DEGRADED_SUPPLIERS_HEADER, result.failedSuppliers.join(', '));
      }
      res.json(result.offers);
    },
  };
}
