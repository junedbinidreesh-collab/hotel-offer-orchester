import { Router } from 'express';
import { createMockSupplierHandler } from '../controllers/mock-supplier.controller';
import { SUPPLIER_A_HOTELS, SUPPLIER_B_HOTELS } from '../suppliers/mock-data';

export interface MockSupplierFlags {
  supplierAForceFailure: boolean;
  supplierBForceFailure: boolean;
}

export function createSupplierRouter(flags: MockSupplierFlags): Router {
  const router = Router();
  router.get('/supplierA/hotels', createMockSupplierHandler('Supplier A', SUPPLIER_A_HOTELS, flags.supplierAForceFailure));
  router.get('/supplierB/hotels', createMockSupplierHandler('Supplier B', SUPPLIER_B_HOTELS, flags.supplierBForceFailure));
  return router;
}
