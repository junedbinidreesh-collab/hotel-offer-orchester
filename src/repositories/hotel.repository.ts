import type { ChainableCommander, Redis } from 'ioredis';
import { z } from 'zod';
import { normalizeHotelName, SUPPLIER_NAMES, type HotelOffer, type PriceRange } from '../domain/offer';
import { DependencyUnavailableError } from '../errors/app-error';
import { ErrorCode } from '../errors/error-codes';

const storedOfferSchema = z.object({
  name: z.string(),
  price: z.number(),
  supplier: z.enum(SUPPLIER_NAMES),
  commissionPct: z.number(),
});

// Cities are expected to be normalised (trimmed, lower-case) by the caller.
const pricesKey = (city: string): string => `hotels:city:${city}:prices`;
const detailsKey = (city: string): string => `hotels:city:${city}:details`;

export class HotelRepository {
  constructor(
    private readonly redis: Redis,
    private readonly ttlSeconds: number,
  ) {}

  /** Atomically replaces the city snapshot so readers never see a half-written list. */
  async replaceCityOffers(city: string, offers: readonly HotelOffer[]): Promise<void> {
    await this.guard('save offers', async () => {
      const prices = pricesKey(city);
      const details = detailsKey(city);
      const tx = this.redis.multi().del(prices, details);
      for (const offer of offers) {
        const member = normalizeHotelName(offer.name);
        tx.zadd(prices, offer.price, member);
        tx.hset(details, member, JSON.stringify(offer));
      }
      if (offers.length > 0) {
        tx.expire(prices, this.ttlSeconds).expire(details, this.ttlSeconds);
      }
      await execute(tx);
    });
  }

  /** Price filtering is done by Redis (ZRANGEBYSCORE); results come back ordered by price. */
  async findCityOffers(city: string, range: PriceRange): Promise<HotelOffer[]> {
    return this.guard('read offers', async () => {
      const min = range.minPrice ?? '-inf';
      const max = range.maxPrice ?? '+inf';
      const members = await this.redis.zrangebyscore(pricesKey(city), min, max);
      if (members.length === 0) return [];

      const rawOffers = await this.redis.hmget(detailsKey(city), ...members);
      return rawOffers.flatMap((raw) => (raw === null ? [] : [storedOfferSchema.parse(JSON.parse(raw))]));
    });
  }

  private async guard<T>(operation: string, run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      throw new DependencyUnavailableError(ErrorCode.REDIS_UNAVAILABLE, `Redis failed to ${operation}`, {
        cause: error,
      });
    }
  }
}

async function execute(tx: ChainableCommander): Promise<void> {
  const results = await tx.exec();
  if (results === null) throw new Error('Redis transaction was aborted');
  for (const [error] of results) {
    if (error) throw error;
  }
}
