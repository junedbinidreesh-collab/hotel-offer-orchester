import type { Logger } from '../utils/logger';

export type Probe = () => Promise<void>;
export type CheckStatus = 'up' | 'down';

const PROBE_NAMES = ['redis', 'temporal', 'supplierA', 'supplierB'] as const;
type ProbeName = (typeof PROBE_NAMES)[number];

export type HealthProbes = Record<ProbeName, Probe>;

export interface HealthReport {
  status: 'ok' | 'degraded' | 'unhealthy';
  checks: Record<'api' | ProbeName, CheckStatus>;
  timestamp: string;
}

export class HealthService {
  constructor(
    private readonly probes: HealthProbes,
    private readonly logger: Logger,
  ) {}

  async check(): Promise<HealthReport> {
    const results = await Promise.all(PROBE_NAMES.map((name) => this.runProbe(name)));
    const checks: HealthReport['checks'] = {
      api: 'up',
      redis: 'up',
      temporal: 'up',
      supplierA: 'up',
      supplierB: 'up',
    };
    for (const { name, status } of results) checks[name] = status;

    return { status: overallStatus(checks), checks, timestamp: new Date().toISOString() };
  }

  private async runProbe(name: ProbeName): Promise<{ name: ProbeName; status: CheckStatus }> {
    try {
      await this.probes[name]();
      return { name, status: 'up' };
    } catch (error) {
      this.logger.warn({ err: error, dependency: name }, 'Health probe failed');
      return { name, status: 'down' };
    }
  }
}

// Redis and Temporal are hard requirements. Suppliers are soft: one can be down
// (degraded) because the workflow degrades gracefully, but not both.
function overallStatus(checks: HealthReport['checks']): HealthReport['status'] {
  if (checks.redis === 'down' || checks.temporal === 'down') return 'unhealthy';
  const suppliersDown = [checks.supplierA, checks.supplierB].filter((s) => s === 'down').length;
  if (suppliersDown === 2) return 'unhealthy';
  return suppliersDown === 1 ? 'degraded' : 'ok';
}
