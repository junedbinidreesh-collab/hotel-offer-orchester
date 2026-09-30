import type { Redis } from 'ioredis';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app/app';
import type { SupplierName } from '../../src/domain/offer';
import { HealthService } from '../../src/services/health.service';
import { HotelService } from '../../src/services/hotel.service';
import { logger } from '../../src/utils/logger';
import { createInProcessRunner } from '../helpers/in-process-runner';
import { createTestRedis } from '../helpers/test-redis';

interface OfferBody {
  name: string;
  price: number;
  supplier: string;
  commissionPct: number;
}

const noFailures = { supplierAForceFailure: false, supplierBForceFailure: false };
const healthy = async (): Promise<void> => undefined;

describe('GET /api/hotels', () => {
  let redis: Redis;

  const appWith = (failing: SupplierName[] = []) =>
    createApp({
      logger,
      hotelService: new HotelService(createInProcessRunner(redis, failing)),
      healthService: new HealthService({ redis: healthy, temporal: healthy, supplierA: healthy, supplierB: healthy }, logger),
      mockSuppliers: noFailures,
    });

  beforeEach(async () => {
    redis = createTestRedis();
    await redis.flushall();
  });

  it('returns deduplicated offers with the cheapest price per hotel, ordered by price', async () => {
    const response = await request(appWith()).get('/api/hotels?city=delhi');

    expect(response.status).toBe(200);
    const body = response.body as OfferBody[];
    expect(body.map((o) => o.name)).toEqual([
      'Ibis Central', 'Lemon Tree', 'Holtin', 'Radison', 'Park Plaza', 'Leela Residency', 'Hyatt Regency', 'Taj Palace',
    ]);
    expect(body.find((o) => o.name === 'Holtin')).toEqual({ name: 'Holtin', price: 5340, supplier: 'Supplier B', commissionPct: 20 });
    expect(body.find((o) => o.name === 'Radison')).toEqual({ name: 'Radison', price: 5900, supplier: 'Supplier A', commissionPct: 13 });
    expect(body.find((o) => o.name === 'Taj Palace')?.supplier).toBe('Supplier A');
    expect(body.find((o) => o.name === 'Park Plaza')?.price).toBe(7200);
  });

  it('does not expose supplier-internal fields', async () => {
    const response = await request(appWith()).get('/api/hotels?city=delhi');

    for (const offer of response.body as Record<string, unknown>[]) {
      expect(Object.keys(offer).sort()).toEqual(['commissionPct', 'name', 'price', 'supplier']);
    }
  });

  it('persists the deduplicated list in Redis', async () => {
    await request(appWith()).get('/api/hotels?city=delhi');

    expect(await redis.zcard('hotels:city:delhi:prices')).toBe(8);
    expect(await redis.hlen('hotels:city:delhi:details')).toBe(8);
  });

  it('is case-insensitive for the city', async () => {
    const response = await request(appWith()).get('/api/hotels?city=DELHI');

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(8);
  });

  it.each([
    ['minPrice only', 'minPrice=9000', ['Leela Residency', 'Hyatt Regency', 'Taj Palace']],
    ['maxPrice only', 'maxPrice=4500', ['Ibis Central', 'Lemon Tree']],
    ['minPrice and maxPrice', 'minPrice=5000&maxPrice=7000', ['Holtin', 'Radison']],
  ])('filters by price using %s', async (_label, query, expected) => {
    const response = await request(appWith()).get(`/api/hotels?city=delhi&${query}`);

    expect(response.status).toBe(200);
    expect((response.body as OfferBody[]).map((o) => o.name)).toEqual(expected);
  });

  it('returns 200 with an empty list when the price range matches nothing', async () => {
    const response = await request(appWith()).get('/api/hotels?city=delhi&minPrice=100000');

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  it('returns 404 for a city without hotels', async () => {
    const response = await request(appWith()).get('/api/hotels?city=atlantis');

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ error: { code: 'NO_HOTELS_FOUND' } });
  });

  it('returns 400 when minPrice is greater than maxPrice', async () => {
    const response = await request(appWith()).get('/api/hotels?city=delhi&minPrice=8000&maxPrice=6000');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: { code: 'INVALID_PRICE_RANGE', message: 'minPrice cannot be greater than maxPrice' },
    });
  });

  it.each([
    ['missing city', '/api/hotels', 'CITY_REQUIRED'],
    ['empty city', '/api/hotels?city=', 'CITY_REQUIRED'],
    ['non-numeric price', '/api/hotels?city=delhi&minPrice=abc', 'INVALID_PRICE'],
    ['negative price', '/api/hotels?city=delhi&maxPrice=-5', 'INVALID_PRICE'],
  ])('returns 400 for %s', async (_label, url, code) => {
    const response = await request(appWith()).get(url);

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ error: { code } });
  });

  it('still answers from the healthy supplier when the other one fails', async () => {
    const response = await request(appWith(['Supplier B'])).get('/api/hotels?city=delhi');

    expect(response.status).toBe(200);
    expect(response.headers['x-degraded-suppliers']).toBe('Supplier B');
    const body = response.body as OfferBody[];
    expect(body.every((o) => o.supplier === 'Supplier A')).toBe(true);
    expect(body.find((o) => o.name === 'Holtin')?.price).toBe(6000);
  });

  it('returns 503 when both suppliers fail', async () => {
    const response = await request(appWith(['Supplier A', 'Supplier B'])).get('/api/hotels?city=delhi');

    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({ error: { code: 'ALL_SUPPLIERS_FAILED' } });
  });

  it('returns a consistent 404 body for unknown routes and echoes the request id', async () => {
    const response = await request(appWith()).get('/nope').set('x-request-id', 'test-123');

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ error: { code: 'ROUTE_NOT_FOUND' } });
    expect(response.headers['x-request-id']).toBe('test-123');
  });
});
