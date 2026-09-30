import { z } from 'zod';

const booleanFlag = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  REDIS_HOST: z.string().min(1).default('localhost'),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  OFFERS_TTL_SECONDS: z.coerce.number().int().positive().default(3600),

  TEMPORAL_ADDRESS: z.string().min(1).default('localhost:7233'),
  TEMPORAL_NAMESPACE: z.string().min(1).default('default'),
  TEMPORAL_TASK_QUEUE: z.string().min(1).default('hotel-offers'),
  WORKFLOW_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),

  SUPPLIER_A_URL: z.string().url().default('http://localhost:3000/supplierA/hotels'),
  SUPPLIER_B_URL: z.string().url().default('http://localhost:3000/supplierB/hotels'),
  SUPPLIER_TIMEOUT_MS: z.coerce.number().int().positive().default(3000),
  SUPPLIER_A_FORCE_FAILURE: booleanFlag,
  SUPPLIER_B_FORCE_FAILURE: booleanFlag,
});

export type Config = z.output<typeof envSchema>;

export function loadConfig(source: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment configuration: ${details}`);
  }
  return parsed.data;
}

export const config = loadConfig();
