import { z } from 'zod';
import { supplierHotelSchema, type SupplierHotel } from '../domain/hotel';
import type { HotelOffer, SupplierName } from '../domain/offer';
import { AppError, DependencyUnavailableError } from '../errors/app-error';
import { ErrorCode } from '../errors/error-codes';

export interface SupplierClient {
  readonly name: SupplierName;
  fetchOffers(city: string): Promise<HotelOffer[]>;
  ping(): Promise<void>;
}

interface SupplierClientOptions {
  name: SupplierName;
  url: string;
  timeoutMs: number;
  fetchFn?: typeof fetch;
}

const supplierResponseSchema = z.array(supplierHotelSchema);

export function createSupplierClient({
  name,
  url,
  timeoutMs,
  fetchFn = fetch,
}: SupplierClientOptions): SupplierClient {
  async function request(): Promise<Response> {
    try {
      const response = await fetchFn(url, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) {
        throw new DependencyUnavailableError(
          ErrorCode.SUPPLIER_UNAVAILABLE,
          `${name} responded with HTTP ${response.status}`,
        );
      }
      return response;
    } catch (error) {
      if (error instanceof AppError) throw error;
      const reason = error instanceof Error ? error.message : String(error);
      throw new DependencyUnavailableError(
        ErrorCode.SUPPLIER_UNAVAILABLE,
        `${name} request failed: ${reason}`,
        { cause: error },
      );
    }
  }

  async function readHotels(response: Response): Promise<SupplierHotel[]> {
    const payload: unknown = await response.json().catch(() => undefined);
    const parsed = supplierResponseSchema.safeParse(payload);
    if (!parsed.success) {
      // Retrying the same malformed payload will not help.
      throw new DependencyUnavailableError(
        ErrorCode.SUPPLIER_INVALID_RESPONSE,
        `${name} returned an invalid payload`,
        { retryable: false },
      );
    }
    return parsed.data;
  }

  return {
    name,

    async fetchOffers(city: string): Promise<HotelOffer[]> {
      const hotels = await readHotels(await request());
      return hotels
        .filter((hotel) => hotel.city.trim().toLowerCase() === city)
        .map((hotel) => ({
          name: hotel.name,
          price: hotel.price,
          supplier: name,
          commissionPct: hotel.commissionPct,
        }));
    },

    async ping(): Promise<void> {
      await (await request()).text();
    },
  };
}
