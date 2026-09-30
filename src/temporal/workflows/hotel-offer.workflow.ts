import { ApplicationFailure, isCancellation, log, proxyActivities } from '@temporalio/workflow';
import { deduplicateOffers, SUPPLIER_NAMES, type HotelOffer, type SupplierName } from '../../domain/offer';
import { ErrorCode } from '../../errors/error-codes';
import type { HotelActivities } from '../activities/hotel.activities';
import type { SupplierActivities } from '../activities/supplier.activities';
import type { HotelOfferWorkflowInput, HotelOfferWorkflowResult } from '../types';

// Retrying is safe for every activity below: supplier calls are GETs, the Redis save
// replaces the whole snapshot (idempotent) and the query is read-only. Activities
// mark non-retryable failures (e.g. malformed supplier payloads) themselves.
const { fetchSupplierOffers } = proxyActivities<SupplierActivities>({
  startToCloseTimeout: '5 seconds',
  retry: { initialInterval: '500 milliseconds', backoffCoefficient: 2, maximumAttempts: 3 },
});

const { saveCityOffers, findCityOffers } = proxyActivities<HotelActivities>({
  startToCloseTimeout: '5 seconds',
  retry: { initialInterval: '250 milliseconds', backoffCoefficient: 2, maximumAttempts: 4 },
});

interface SupplierOutcome {
  supplier: SupplierName;
  offers: HotelOffer[] | null;
}

async function fetchFromSupplier(supplier: SupplierName, city: string): Promise<SupplierOutcome> {
  try {
    return { supplier, offers: await fetchSupplierOffers(supplier, city) };
  } catch (error) {
    if (isCancellation(error)) throw error;
    // Degrade gracefully: one failing supplier must not fail the whole request.
    log.warn('Supplier failed after retries', {
      supplier,
      city,
      error: error instanceof Error ? error.message : String(error),
    });
    return { supplier, offers: null };
  }
}

export async function hotelOfferWorkflow(input: HotelOfferWorkflowInput): Promise<HotelOfferWorkflowResult> {
  // Both suppliers are called concurrently; SUPPLIER_NAMES fixes the order of the results.
  const outcomes = await Promise.all(SUPPLIER_NAMES.map((supplier) => fetchFromSupplier(supplier, input.city)));

  const failedSuppliers = outcomes.filter((o) => o.offers === null).map((o) => o.supplier);
  if (failedSuppliers.length === outcomes.length) {
    throw ApplicationFailure.nonRetryable('All suppliers failed', ErrorCode.ALL_SUPPLIERS_FAILED);
  }

  // Pure and deterministic, so it runs inside the workflow rather than in an activity.
  const deduplicated = deduplicateOffers(outcomes.flatMap((o) => o.offers ?? []));

  await saveCityOffers(input.city, deduplicated);
  const offers = await findCityOffers(input.city, input.priceRange);

  return { offers, totalOffers: deduplicated.length, failedSuppliers };
}
