import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app/app';
import { HealthService, type Probe } from '../../src/services/health.service';
import { HotelService } from '../../src/services/hotel.service';
import { logger } from '../../src/utils/logger';

const up: Probe = async () => undefined;
const down: Probe = async () => {
  throw new Error('unreachable');
};

function buildApp(probes: { redis?: Probe; temporal?: Probe; supplierA?: Probe; supplierB?: Probe } = {}, flags = {}) {
  return createApp({
    logger,
    hotelService: new HotelService({ run: async () => ({ offers: [], totalOffers: 0, failedSuppliers: [] }) }),
    healthService: new HealthService(
      { redis: up, temporal: up, supplierA: up, supplierB: up, ...probes },
      logger,
    ),
    mockSuppliers: { supplierAForceFailure: false, supplierBForceFailure: false, ...flags },
  });
}

describe('mock supplier endpoints', () => {
  it('serve deterministic data with overlapping hotel names', async () => {
    const app = buildApp();
    const [a, b] = await Promise.all([request(app).get('/supplierA/hotels'), request(app).get('/supplierB/hotels')]);

    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    const namesA = new Set((a.body as { name: string }[]).map((h) => h.name.toLowerCase()));
    const overlap = (b.body as { name: string }[]).filter((h) => namesA.has(h.name.toLowerCase()));
    expect(overlap.length).toBeGreaterThan(0);
    expect(a.body).toEqual((await request(app).get('/supplierA/hotels')).body);
  });

  it('can simulate an outage', async () => {
    const response = await request(buildApp({}, { supplierBForceFailure: true })).get('/supplierB/hotels');

    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({ error: { code: 'SUPPLIER_UNAVAILABLE' } });
  });
});

describe('GET /health', () => {
  it('returns 200 when everything is up', async () => {
    const response = await request(buildApp()).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      status: 'ok',
      checks: { api: 'up', redis: 'up', temporal: 'up', supplierA: 'up', supplierB: 'up' },
    });
  });

  it('returns 200 but reports degraded when one supplier is down', async () => {
    const response = await request(buildApp({ supplierB: down })).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: 'degraded', checks: { supplierB: 'down', supplierA: 'up' } });
  });

  it.each([
    ['Redis is down', { redis: down }],
    ['Temporal is down', { temporal: down }],
    ['both suppliers are down', { supplierA: down, supplierB: down }],
  ])('returns 503 when %s', async (_label, probes) => {
    const response = await request(buildApp(probes)).get('/health');

    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({ status: 'unhealthy' });
  });
});
