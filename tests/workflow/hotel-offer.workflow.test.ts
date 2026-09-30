import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { ApplicationFailure } from '@temporalio/common';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { HotelOffer, PriceRange, SupplierName } from '../../src/domain/offer';
import type { HotelActivities } from '../../src/temporal/activities/hotel.activities';
import type { SupplierActivities } from '../../src/temporal/activities/supplier.activities';
import { HOTEL_OFFER_WORKFLOW_NAME, type HotelOfferWorkflowResult } from '../../src/temporal/types';

// Needs the Temporal test server binary (downloaded on first use), hence opt-in:
//   npm run test:workflow
const TASK_QUEUE = 'workflow-test';
const WORKFLOWS_PATH = path.resolve(__dirname, '../../src/temporal/workflows/hotel-offer.workflow.ts');
const PARALLEL_WAIT_MS = 2000;

const offerA: HotelOffer = { name: 'Holtin', price: 6000, supplier: 'Supplier A', commissionPct: 10 };
const offerB: HotelOffer = { name: 'holtin', price: 5340, supplier: 'Supplier B', commissionPct: 20 };
const onlyA: HotelOffer = { name: 'Ibis Central', price: 3200, supplier: 'Supplier A', commissionPct: 9 };

async function waitUntil(condition: () => boolean): Promise<void> {
  const deadline = Date.now() + PARALLEL_WAIT_MS;
  while (!condition()) {
    if (Date.now() > deadline) throw ApplicationFailure.nonRetryable('Suppliers were not called in parallel');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

function stubStorage() {
  let saved: HotelOffer[] = [];
  const activities: HotelActivities = {
    async saveCityOffers(_city: string, offers: HotelOffer[]) {
      saved = offers;
    },
    async findCityOffers(_city: string, range: PriceRange) {
      return saved.filter((o) => o.price >= (range.minPrice ?? 0) && o.price <= (range.maxPrice ?? Infinity));
    },
  };
  return { activities, saved: () => saved };
}

describe.skipIf(!process.env.TEMPORAL_TESTS)('hotelOfferWorkflow', () => {
  let env: TestWorkflowEnvironment;

  beforeAll(async () => {
    env = await TestWorkflowEnvironment.createTimeSkipping();
  }, 180_000);

  afterAll(async () => {
    await env?.teardown();
  });

  async function run(
    fetchSupplierOffers: SupplierActivities['fetchSupplierOffers'],
    storage = stubStorage(),
    priceRange: PriceRange = {},
  ): Promise<HotelOfferWorkflowResult> {
    const worker = await Worker.create({
      connection: env.nativeConnection,
      taskQueue: TASK_QUEUE,
      workflowsPath: WORKFLOWS_PATH,
      activities: { fetchSupplierOffers, ...storage.activities },
    });
    return worker.runUntil(
      env.client.workflow.execute(HOTEL_OFFER_WORKFLOW_NAME, {
        taskQueue: TASK_QUEUE,
        workflowId: `test-${randomUUID()}`,
        args: [{ city: 'delhi', priceRange }],
      }),
    );
  }

  it('calls both suppliers in parallel, deduplicates and stores the result', async () => {
    const started = new Set<SupplierName>();
    const storage = stubStorage();

    const result = await run(async (supplier) => {
      started.add(supplier);
      await waitUntil(() => started.size === 2);
      return supplier === 'Supplier A' ? [offerA, onlyA] : [offerB];
    }, storage);

    expect(result.totalOffers).toBe(2);
    expect(result.failedSuppliers).toEqual([]);
    expect(storage.saved()).toEqual([offerB, onlyA]);
    expect(result.offers).toEqual([offerB, onlyA]);
  });

  it('applies the price range through the storage query', async () => {
    const result = await run(
      async (supplier) => (supplier === 'Supplier A' ? [offerA, onlyA] : [offerB]),
      stubStorage(),
      { minPrice: 4000 },
    );

    expect(result.offers).toEqual([offerB]);
    expect(result.totalOffers).toBe(2);
  });

  it('degrades gracefully when one supplier fails', async () => {
    const result = await run(async (supplier) => {
      if (supplier === 'Supplier B') throw ApplicationFailure.nonRetryable('down', 'SUPPLIER_UNAVAILABLE');
      return [offerA];
    });

    expect(result.failedSuppliers).toEqual(['Supplier B']);
    expect(result.offers).toEqual([offerA]);
  });

  it('fails the workflow when every supplier fails', async () => {
    await expect(
      run(async () => {
        throw ApplicationFailure.nonRetryable('down', 'SUPPLIER_UNAVAILABLE');
      }),
    ).rejects.toThrow();
  });
});
