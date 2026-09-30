import Redis from 'ioredis';
import type { Config } from '../config/env';
import type { Logger } from '../utils/logger';

const COMMAND_TIMEOUT_MS = 2000;
const CONNECT_TIMEOUT_MS = 2000;
const MAX_RECONNECT_DELAY_MS = 2000;

export function createRedisClient(config: Pick<Config, 'REDIS_HOST' | 'REDIS_PORT'>, logger: Logger): Redis {
  const client = new Redis({
    host: config.REDIS_HOST,
    port: config.REDIS_PORT,
    // Fail fast while disconnected instead of queueing commands; Temporal retries the activity.
    enableOfflineQueue: false,
    commandTimeout: COMMAND_TIMEOUT_MS,
    connectTimeout: CONNECT_TIMEOUT_MS,
    retryStrategy: (attempt) => Math.min(attempt * 200, MAX_RECONNECT_DELAY_MS),
  });
  client.on('error', (err) => logger.error({ err }, 'Redis connection error'));
  client.on('ready', () => logger.info('Redis connection ready'));
  return client;
}

export async function pingRedis(client: Redis): Promise<void> {
  const reply = await client.ping();
  if (reply !== 'PONG') throw new Error(`Unexpected Redis PING reply: ${reply}`);
}
