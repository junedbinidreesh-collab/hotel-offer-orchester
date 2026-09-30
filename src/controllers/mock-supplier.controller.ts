import type { RequestHandler } from 'express';
import type { SupplierHotel } from '../domain/hotel';
import type { SupplierName } from '../domain/offer';
import { DependencyUnavailableError } from '../errors/app-error';
import { ErrorCode } from '../errors/error-codes';

export function createMockSupplierHandler(
  supplier: SupplierName,
  hotels: readonly SupplierHotel[],
  forceFailure: boolean,
): RequestHandler {
  return (_req, res) => {
    if (forceFailure) {
      throw new DependencyUnavailableError(ErrorCode.SUPPLIER_UNAVAILABLE, `${supplier} is simulating an outage`);
    }
    res.json(hotels);
  };
}
