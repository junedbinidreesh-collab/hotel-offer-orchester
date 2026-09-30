import { startServer } from './app/server';
import { logger } from './utils/logger';

startServer().catch((error: unknown) => {
  logger.fatal({ err: error }, 'Failed to start service');
  process.exit(1);
});
