import type { HotelOffer, SupplierName } from '../../domain/offer';
import type { SupplierClient } from '../../suppliers/supplier.client';
import type { Logger } from '../../utils/logger';
import { runAsActivity } from './failure';

export function createSupplierActivities(clients: Record<SupplierName, SupplierClient>, logger: Logger) {
  return {
    async fetchSupplierOffers(supplier: SupplierName, city: string): Promise<HotelOffer[]> {
      return runAsActivity(logger, 'Supplier call failed', { supplier, city }, async () => {
        const offers = await clients[supplier].fetchOffers(city);
        logger.info({ supplier, city, offerCount: offers.length }, 'Supplier offers fetched');
        return offers;
      });
    },
  };
}

export type SupplierActivities = ReturnType<typeof createSupplierActivities>;
