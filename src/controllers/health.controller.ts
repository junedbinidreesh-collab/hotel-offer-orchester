import type { Request, Response } from 'express';
import type { HealthService } from '../services/health.service';

export function createHealthController(healthService: HealthService) {
  return {
    async check(_req: Request, res: Response): Promise<void> {
      const report = await healthService.check();
      res.status(report.status === 'unhealthy' ? 503 : 200).json(report);
    },
  };
}
