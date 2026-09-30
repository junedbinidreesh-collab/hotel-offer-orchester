import { describe, expect, it } from 'vitest';
import { DependencyUnavailableError } from '../../src/errors/app-error';
import { createSupplierClient } from '../../src/suppliers/supplier.client';

const hotels = [
  { hotelId: 'a1', name: 'Holtin', price: 6000, city: 'Delhi', commissionPct: 10 },
  { hotelId: 'a2', name: 'Sea Breeze', price: 8200, city: 'mumbai', commissionPct: 12 },
];

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const clientWith = (fetchFn: typeof fetch) =>
  createSupplierClient({ name: 'Supplier A', url: 'http://supplier.test/hotels', timeoutMs: 500, fetchFn });

async function failureOf(promise: Promise<unknown>): Promise<DependencyUnavailableError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof DependencyUnavailableError) return error;
    throw error;
  }
  throw new Error('Expected the call to fail');
}

describe('supplier client', () => {
  it('returns only offers for the requested city and drops supplier-internal fields', async () => {
    const client = clientWith(async () => jsonResponse(hotels));

    expect(await client.fetchOffers('delhi')).toEqual([
      { name: 'Holtin', price: 6000, supplier: 'Supplier A', commissionPct: 10 },
    ]);
  });

  it('reports a retryable error when the supplier answers with a 5xx', async () => {
    const client = clientWith(async () => jsonResponse({ error: 'down' }, 503));

    const error = await failureOf(client.fetchOffers('delhi'));
    expect(error.code).toBe('SUPPLIER_UNAVAILABLE');
    expect(error.retryable).toBe(true);
  });

  it('reports a retryable error when the network call fails', async () => {
    const client = clientWith(async () => {
      throw new TypeError('fetch failed');
    });

    const error = await failureOf(client.fetchOffers('delhi'));
    expect(error.code).toBe('SUPPLIER_UNAVAILABLE');
    expect(error.retryable).toBe(true);
  });

  it('reports a non-retryable error for a malformed payload', async () => {
    const client = clientWith(async () => jsonResponse([{ name: 'Holtin', price: 'cheap' }]));

    const error = await failureOf(client.fetchOffers('delhi'));
    expect(error.code).toBe('SUPPLIER_INVALID_RESPONSE');
    expect(error.retryable).toBe(false);
  });
});
