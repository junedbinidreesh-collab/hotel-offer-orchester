import type { Redis } from 'ioredis';
import RedisMock from 'ioredis-mock';

// ioredis-mock instances share state, so tests flush in beforeEach.
export function createTestRedis(): Redis {
  return new RedisMock() as unknown as Redis;
}
