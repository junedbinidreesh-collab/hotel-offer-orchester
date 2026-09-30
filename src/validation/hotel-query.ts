import type { PriceRange } from '../domain/offer';
import { ValidationError } from '../errors/app-error';
import { ErrorCode } from '../errors/error-codes';

export interface HotelQuery {
  city: string;
  priceRange: PriceRange;
}

const MAX_CITY_LENGTH = 64;
// City ends up inside Redis keys, so keep it to plain place-name characters.
const CITY_PATTERN = /^\p{L}[\p{L} .'-]*$/u;
const PRICE_PATTERN = /^\d+(\.\d+)?$/;

export function parseHotelQuery(query: Record<string, unknown>): HotelQuery {
  const city = parseCity(query.city);
  const minPrice = parsePrice('minPrice', query.minPrice);
  const maxPrice = parsePrice('maxPrice', query.maxPrice);

  if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
    throw new ValidationError(ErrorCode.INVALID_PRICE_RANGE, 'minPrice cannot be greater than maxPrice');
  }
  return { city, priceRange: { minPrice, maxPrice } };
}

function parseCity(raw: unknown): string {
  if (raw === undefined) {
    throw new ValidationError(ErrorCode.CITY_REQUIRED, 'city query parameter is required');
  }
  if (typeof raw !== 'string') {
    throw new ValidationError(ErrorCode.INVALID_CITY, 'city must be provided exactly once');
  }
  const city = raw.trim().replace(/\s+/g, ' ').toLowerCase();
  if (city === '') {
    throw new ValidationError(ErrorCode.CITY_REQUIRED, 'city must not be empty');
  }
  if (city.length > MAX_CITY_LENGTH || !CITY_PATTERN.test(city)) {
    throw new ValidationError(ErrorCode.INVALID_CITY, 'city contains invalid characters or is too long');
  }
  return city;
}

function parsePrice(name: 'minPrice' | 'maxPrice', raw: unknown): number | undefined {
  if (raw === undefined) return undefined;

  const value = typeof raw === 'string' ? raw.trim() : '';
  if (value.startsWith('-') && Number.isFinite(Number(value))) {
    throw new ValidationError(ErrorCode.INVALID_PRICE, `${name} must not be negative`);
  }
  if (!PRICE_PATTERN.test(value)) {
    throw new ValidationError(ErrorCode.INVALID_PRICE, `${name} must be a non-negative number`);
  }
  return Number(value);
}
