import type { Redis } from 'ioredis';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HotelOffer } from '../../src/domain/offer';
import { HotelRepository } from '../../src/repositories/hotel.repository';
import { createTestRedis } from '../helpers/test-redis';

const offers: HotelOffer[] = [
  { name: 'Ibis Central', price: 3200, supplier: 'Supplier A', commissionPct: 9 },
  { name: 'Holtin', price: 5340, supplier: 'Supplier B', commissionPct: 20 },
  { name: 'Radison', price: 5900, supplier: 'Supplier A', commissionPct: 13 },
  { name: 'Taj Palace', price: 12500, supplier: 'Supplier A', commissionPct: 12 },
];

const names = (list: HotelOffer[]): string[] => list.map((o) => o.name);

describe('HotelRepository', () => {
  let redis: Redis;
  let repository: HotelRepository;

  beforeEach(async () => {
    redis = createTestRedis();
    await redis.flushall();
    repository = new HotelRepository(redis, 60);
    await repository.replaceCityOffers('delhi', offers);
  });

  it('stores prices in a sorted set and details in a hash', async () => {
    expect(await redis.zrange('hotels:city:delhi:prices', 0, -1, 'WITHSCORES')).toEqual([
      'ibis central', '3200', 'holtin', '5340', 'radison', '5900', 'taj palace', '12500',
    ]);
    expect(JSON.parse((await redis.hget('hotels:city:delhi:details', 'holtin')) ?? '{}')).toMatchObject({
      name: 'Holtin',
      supplier: 'Supplier B',
    });
  });

  it('sets an expiry on both keys', async () => {
    expect(await redis.ttl('hotels:city:delhi:prices')).toBeGreaterThan(0);
    expect(await redis.ttl('hotels:city:delhi:details')).toBeGreaterThan(0);
  });

  it('returns everything ordered by price without filters', async () => {
    expect(names(await repository.findCityOffers('delhi', {}))).toEqual(['Ibis Central', 'Holtin', 'Radison', 'Taj Palace']);
  });

  it('filters with minPrice only', async () => {
    expect(names(await repository.findCityOffers('delhi', { minPrice: 5900 }))).toEqual(['Radison', 'Taj Palace']);
  });

  it('filters with maxPrice only', async () => {
    expect(names(await repository.findCityOffers('delhi', { maxPrice: 5340 }))).toEqual(['Ibis Central', 'Holtin']);
  });

  it('filters with both bounds (inclusive)', async () => {
    expect(names(await repository.findCityOffers('delhi', { minPrice: 5340, maxPrice: 5900 }))).toEqual(['Holtin', 'Radison']);
  });

  it('returns an empty list when nothing matches or the city is unknown', async () => {
    expect(await repository.findCityOffers('delhi', { minPrice: 20000 })).toEqual([]);
    expect(await repository.findCityOffers('atlantis', {})).toEqual([]);
  });

  it('replaces the previous snapshot instead of merging with it', async () => {
    await repository.replaceCityOffers('delhi', [offers[0] as HotelOffer]);

    expect(names(await repository.findCityOffers('delhi', {}))).toEqual(['Ibis Central']);
  });

  it('clears the city when the new snapshot is empty', async () => {
    await repository.replaceCityOffers('delhi', []);

    expect(await redis.exists('hotels:city:delhi:prices', 'hotels:city:delhi:details')).toBe(0);
  });

  it('surfaces Redis failures as a 503 dependency error', async () => {
    vi.spyOn(redis, 'zrangebyscore').mockRejectedValue(new Error('connection refused'));

    await expect(repository.findCityOffers('delhi', {})).rejects.toMatchObject({
      code: 'REDIS_UNAVAILABLE',
      statusCode: 503,
    });
  });
});
