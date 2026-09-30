# Hotel Offer Orchestrator

Aggregates hotel offers from two mock suppliers, deduplicates them by hotel name (cheapest offer wins), stores the result in Redis and serves it with Redis-side price filtering. The whole flow is orchestrated by a Temporal workflow.

## Architecture

```
GET /api/hotels?city=delhi&minPrice=5000
        │
 Express controller ── validates query (400 on bad input)
        │
 HotelService ──► TemporalHotelOfferRunner (Temporal client)
                          │  start "hotelOfferWorkflow"
                          ▼
              ┌───────────────────────────── Temporal workflow (deterministic) ─┐
              │ 1. fetchSupplierOffers(A) ┐ in parallel (activities, retried)   │
              │    fetchSupplierOffers(B) ┘ one failure => degrade, both => fail│
              │ 2. deduplicateOffers()      pure function, runs in the workflow │
              │ 3. saveCityOffers()         activity → Redis (atomic MULTI)     │
              │ 4. findCityOffers()         activity → Redis ZRANGEBYSCORE      │
              └─────────────────────────────────────────────────────────────────┘
                          │ result {offers, totalOffers, failedSuppliers}
                          ▼
                 HTTP 200 [ ... ]  (404 if city empty, 503 if dependencies down)
```

- **Express** – HTTP only: validation, response formatting, request IDs, logging, centralised error handling.
- **Temporal** – owns the business flow. The worker runs inside the same Node process as the API (`src/app/server.ts`), which keeps the stack to one container; it can be split out by starting `createHotelOfferWorker` in its own entry point.
- **Redis** – stores the deduplicated snapshot per city and answers price-range queries.
- **Supplier clients** – one small `createSupplierClient` factory (timeout, status check, payload validation). Both suppliers are mock endpoints in this service (`/supplierA/hotels`, `/supplierB/hotels`) and are called over HTTP like real suppliers.

### Folder structure

```
src/
  app/            app.ts (Express wiring), server.ts (composition root, worker + HTTP startup)
  config/         env.ts – validated environment configuration
  controllers/    hotel, health, mock-supplier handlers (HTTP concerns only)
  routes/         route definitions
  services/       hotel.service (404 rule), health.service, redis.service (client factory)
  temporal/       client, worker, workflow-error-mapper, types
    workflows/    hotel-offer.workflow.ts (deterministic orchestration)
    activities/   supplier.activities, hotel.activities (Redis), failure helper
  repositories/   hotel.repository.ts – all Redis commands live here
  suppliers/      supplier.client.ts, mock-data.ts (deterministic fixtures)
  domain/         offer.ts (types + dedupe), hotel.ts (supplier payload schema)
  validation/     hotel-query.ts
  middleware/     request-id, request-logger, error-handler
  errors/         AppError hierarchy + error codes
tests/            unit/, integration/, workflow/ (opt-in), helpers/
postman/          hotel-offer-orchestrator.postman_collection.json
```

## Prerequisites

- Docker + Docker Compose (to run everything), or
- Node.js ≥ 20, plus Redis and a Temporal server (the compose file can provide both).

## Running with Docker

```bash
docker compose up --build        # API on :3000, Temporal UI on :8080
docker compose down              # stop (add -v to also drop Temporal's Postgres volume)
```

The first start takes a while because Temporal initialises its schema; `app` waits for Redis and Temporal to be healthy. Try it:

```bash
curl "http://localhost:3000/api/hotels?city=delhi"
curl "http://localhost:3000/api/hotels?city=delhi&minPrice=5000&maxPrice=7000"
curl -i http://localhost:3000/health
```

Simulate a supplier outage: `SUPPLIER_B_FORCE_FAILURE=true docker compose up --build`.

## Running locally

```bash
docker compose up -d redis temporal temporal-postgres temporal-ui   # infrastructure only
cp .env.example .env    # then export the variables, or use your shell/IDE runner
npm install
npm run dev
```

The app reads `process.env` directly (no dotenv), e.g. `set -a; source .env; set +a; npm run dev`. `npm run build && npm start` runs the compiled output.

## Environment variables (`.env.example`)

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | 3000 | HTTP port |
| `LOG_LEVEL` | info | pino level |
| `REDIS_HOST` / `REDIS_PORT` | localhost / 6379 | Redis connection (`redis` in Compose) |
| `OFFERS_TTL_SECONDS` | 3600 | Expiry of a city snapshot |
| `TEMPORAL_ADDRESS` | localhost:7233 | Temporal frontend (`temporal:7233` in Compose) |
| `TEMPORAL_NAMESPACE` | default | Temporal namespace |
| `TEMPORAL_TASK_QUEUE` | hotel-offers | Task queue used by client and worker |
| `WORKFLOW_TIMEOUT_MS` | 30000 | Workflow execution timeout (also bounds the wait if no worker is running) |
| `SUPPLIER_A_URL` / `SUPPLIER_B_URL` | localhost mock URLs | Supplier endpoints (`http://app:3000/...` in Compose) |
| `SUPPLIER_TIMEOUT_MS` | 3000 | Per-attempt supplier HTTP timeout |
| `SUPPLIER_A_FORCE_FAILURE` / `SUPPLIER_B_FORCE_FAILURE` | false | Make a mock supplier answer 503 |

## API

### `GET /api/hotels?city=<city>[&minPrice=<n>][&maxPrice=<n>]`

```json
[
  { "name": "Ibis Central", "price": 3200, "supplier": "Supplier A", "commissionPct": 9 },
  { "name": "Holtin", "price": 5340, "supplier": "Supplier B", "commissionPct": 20 },
  { "name": "Radison", "price": 5900, "supplier": "Supplier A", "commissionPct": 13 }
]
```

Results are ordered by price ascending. City matching is case-insensitive. Price bounds are inclusive.

| Status | When | `error.code` |
|---|---|---|
| 200 | Success (an empty array if the price range matches nothing) | – |
| 400 | Missing/empty city, malformed city, non-numeric or negative price, `minPrice > maxPrice` | `CITY_REQUIRED`, `INVALID_CITY`, `INVALID_PRICE`, `INVALID_PRICE_RANGE` |
| 404 | No supplier has hotels for the city (and none failed) | `NO_HOTELS_FOUND` |
| 503 | Both suppliers failed, Redis/Temporal unavailable, workflow timeout | `ALL_SUPPLIERS_FAILED`, `REDIS_UNAVAILABLE`, `TEMPORAL_UNAVAILABLE`, `WORKFLOW_TIMEOUT` |
| 500 | Unexpected error (generic message, no stack trace) | `INTERNAL_ERROR` |

Errors always look like `{ "error": { "code": "...", "message": "..." } }`. If one supplier failed the response is still 200 and carries `X-Degraded-Suppliers: Supplier B`. Every response has an `x-request-id` header (an incoming valid one is reused).

### `GET /supplierA/hotels`, `GET /supplierB/hotels`
Static, deterministic mock data (`hotelId`, `name`, `price`, `city`, `commissionPct`). Delhi, Mumbai and Jaipur have data; anything else (e.g. `atlantis`) has none. The suppliers overlap on purpose: Holtin (B cheaper), Radison (A cheaper), Taj Palace (equal price), Park Plaza / PARK PLAZA (case difference), plus A-only and B-only hotels.

### `GET /health`
```json
{ "status": "ok", "checks": { "api": "up", "redis": "up", "temporal": "up", "supplierA": "up", "supplierB": "up" }, "timestamp": "..." }
```
- `200 ok` – everything up. `200 degraded` – exactly one supplier down (the workflow still works).
- `503 unhealthy` – Redis or Temporal down, or both suppliers down.

## Redis design

Per city (city is lower-cased and validated, so it is safe inside a key):

| Key | Type | Content |
|---|---|---|
| `hotels:city:<city>:prices` | Sorted set | member = normalised hotel name (`"taj palace"`), score = price |
| `hotels:city:<city>:details` | Hash | field = the same normalised name, value = JSON `{name, price, supplier, commissionPct}` |

- **Save** (`replaceCityOffers`): one `MULTI/EXEC` that `DEL`s both keys, `ZADD`s/`HSET`s every offer and sets `EXPIRE`. It is atomic, so readers see either the old or the new snapshot, never a mix, and stale hotels do not linger.
- **Filter** (`findCityOffers`): `ZRANGEBYSCORE prices <min|-inf> <max|+inf>` returns only the matching members, already ordered by price, then one `HMGET details ...members` loads just those hotels. Node never sees the hotels that were filtered out. minPrice only → `min +inf`; maxPrice only → `-inf max`; both → `min max`; none → `-inf +inf`.
- **Why not one JSON array under a key?** Filtering would require fetching and parsing the entire list in Node. A sorted set gives O(log N + M) range queries by score natively.
- **Why hash + sorted set rather than a key per hotel?** Two keys per city keep replacement atomic and cheap, and `HMGET` fetches the details in one round-trip.
- A city snapshot expires after `OFFERS_TTL_SECONDS`; every request refreshes it.

## Temporal

- **Workflow**: `hotelOfferWorkflow` (`src/temporal/workflows/hotel-offer.workflow.ts`), started by name with a unique `hotel-offers-<uuid>` ID and the request ID in its memo.
- **Task queue**: `hotel-offers` (`TEMPORAL_TASK_QUEUE`).
- **Activities**: `fetchSupplierOffers(supplier, city)`, `saveCityOffers(city, offers)`, `findCityOffers(city, priceRange)`.
- **Parallelism**: both `fetchSupplierOffers` activities are started together via `Promise.all`; each is wrapped so one failing supplier is logged and reported instead of failing the workflow.
- **Timeouts/retries**: every activity has a 5 s start-to-close timeout. Supplier calls: 3 attempts, 500 ms initial interval, ×2 backoff. Redis activities: 4 attempts, 250 ms, ×2. All are safe to retry (GETs, an idempotent snapshot replace, a read-only query). Non-recoverable failures (e.g. a malformed supplier payload) are flagged non-retryable. The whole workflow has a 30 s execution timeout.
- **Failure behaviour**: one supplier fails → still returns the other's offers (logged, `X-Degraded-Suppliers` header). Both fail → workflow fails with `ALL_SUPPLIERS_FAILED` → HTTP 503. A partial result is still saved as the city snapshot; the next request refreshes it.
- **Deterministic logic in the workflow**: `deduplicateOffers` is pure, so it lives in the workflow instead of an extra activity; all I/O (HTTP, Redis) is in activities. The tie-break on equal prices is fixed (Supplier A) because supplier order is fixed.

## Testing

```bash
npm test                  # everything except the opt-in Temporal workflow test
npm run test:unit         # dedupe, validation, supplier client, error mapping
npm run test:integration  # HTTP API + Redis repository (ioredis-mock) + health
npm run test:workflow     # workflow test against Temporal's test server (downloads it on first run)
npm run typecheck
```

Strategy: unit tests cover pure logic. Integration tests run the real Express app, real activities, real repository (against `ioredis-mock`) and real dedupe, using an in-process runner instead of a Temporal server (`tests/helpers/in-process-runner.ts`), so they stay fast and need no infrastructure. The workflow itself (parallel supplier calls, dedupe, graceful degradation, total failure) is tested separately with `@temporalio/testing` and stubbed activities, which is heavier and therefore opt-in.

## Postman

Import `postman/hotel-offer-orchestrator.postman_collection.json` into Postman. The requests use `{{baseUrl}}` (a collection variable, default `http://localhost:3000`); override it in an environment to target another host. The last request only passes when the stack runs with `SUPPLIER_B_FORCE_FAILURE=true`.

## Design decisions and trade-offs

- **Filter after save, inside the workflow**: the workflow returns the already-filtered list, so the HTTP layer never touches Redis and price filtering is Redis-side. The cost is a full snapshot rewrite per request; acceptable for a demo-sized dataset, and a real system would cache with a TTL and skip the supplier calls on fresh data.
- **Single process for API and worker**: simplest deployment; supplier mocks call back into the same process.
- **No database**: Redis is the only store; nothing here needs relational persistence.
- **Empty city vs. degraded**: an empty result is 404 only if all suppliers answered; if one failed, it is a 200 `[]` with the degraded header because we cannot tell "unknown city" from "missing data".
- **Redis fails fast** (`enableOfflineQueue: false`, 2 s command timeout) and Temporal's activity retry absorbs short blips.
