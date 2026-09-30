import type { Redis } from 'ioredis';
import { deduplicateOffers, SUPPLIER_NAMES, type SupplierName } from '../../src/domain/offer';
import { DependencyUnavailableError } from '../../src/errors/app-error';
import { ErrorCode } from '../../src/errors/error-codes';
import { HotelRepository } from '../../src/repositories/hotel.repository';
import type { HotelOfferWorkflowRunner } from '../../src/services/hotel.service';
import { SUPPLIER_A_HOTELS, SUPPLIER_B_HOTELS } from '../../src/suppliers/mock-data';
import { createSupplierClient, type SupplierClient } from '../../src/suppliers/supplier.client';
import { createHotelActivities } from '../../src/temporal/activities/hotel.activities';
import { createSupplierActivities } from '../../src/temporal/activities/supplier.activities';
import { logger } from '../../src/utils/logger';

function fakeSupplier(name: SupplierName, payload: unknown, failing: boolean): SupplierClient {
  return createSupplierClient({
    name,
    url: 'http://supplier.test/hotels',
    timeoutMs: 500,
    fetchFn: async () =>
      failing
        ? new Response('unavailable', { status: 503 })
        : new Response(JSON.stringify(payload), { headers: { 'content-type': 'application/json' } }),
  });
}

/**
 * Runs the real activities, the real Redis repository and the real dedupe function
 * without a Temporal server, so HTTP tests exercise everything except Temporal itself.
 * The orchestration itself is covered separately by tests/workflow.
 */
export function createInProcessRunner(redis: Redis, failing: readonly SupplierName[] = []): HotelOfferWorkflowRunner {
  const suppliers = createSupplierActivities(
    {
      'Supplier A': fakeSupplier('Supplier A', SUPPLIER_A_HOTELS, failing.includes('Supplier A')),
      'Supplier B': fakeSupplier('Supplier B', SUPPLIER_B_HOTELS, failing.includes('Supplier B')),
    },
    logger,
  );
  const storage = createHotelActivities(new HotelRepository(redis, 60), logger);

  return {
    async run({ city, priceRange }) {
      const outcomes = await Promise.all(
        SUPPLIER_NAMES.map(async (supplier) => ({
          supplier,
          offers: await suppliers.fetchSupplierOffers(supplier, city).catch(() => null),
        })),
      );
      const failedSuppliers = outcomes.filter((o) => o.offers === null).map((o) => o.supplier);
      if (failedSuppliers.length === outcomes.length) {
        throw new DependencyUnavailableError(ErrorCode.ALL_SUPPLIERS_FAILED, 'All hotel suppliers are unavailable');
      }

      const deduplicated = deduplicateOffers(outcomes.flatMap((o) => o.offers ?? []));
      await storage.saveCityOffers(city, deduplicated);
      const offers = await storage.findCityOffers(city, priceRange);
      return { offers, totalOffers: deduplicated.length, failedSuppliers };
    },
  };
}
