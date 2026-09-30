import { describe, expect, it } from 'vitest';
import { ValidationError } from '../../src/errors/app-error';
import { parseHotelQuery } from '../../src/validation/hotel-query';

function errorCodeFor(query: Record<string, unknown>): string | undefined {
  try {
    parseHotelQuery(query);
    return undefined;
  } catch (error) {
    return error instanceof ValidationError ? error.code : 'UNEXPECTED';
  }
}

describe('parseHotelQuery', () => {
  it('normalises the city', () => {
    expect(parseHotelQuery({ city: '  Delhi ' }).city).toBe('delhi');
  });

  it('parses no price filters', () => {
    expect(parseHotelQuery({ city: 'delhi' }).priceRange).toEqual({ minPrice: undefined, maxPrice: undefined });
  });

  it('parses minPrice only, maxPrice only and both', () => {
    expect(parseHotelQuery({ city: 'delhi', minPrice: '5000' }).priceRange).toEqual({ minPrice: 5000, maxPrice: undefined });
    expect(parseHotelQuery({ city: 'delhi', maxPrice: '7000.5' }).priceRange).toEqual({ minPrice: undefined, maxPrice: 7000.5 });
    expect(parseHotelQuery({ city: 'delhi', minPrice: '5000', maxPrice: '7000' }).priceRange).toEqual({
      minPrice: 5000,
      maxPrice: 7000,
    });
  });

  it('accepts equal minPrice and maxPrice', () => {
    expect(errorCodeFor({ city: 'delhi', minPrice: '5000', maxPrice: '5000' })).toBeUndefined();
  });

  it('rejects a missing or empty city', () => {
    expect(errorCodeFor({})).toBe('CITY_REQUIRED');
    expect(errorCodeFor({ city: '   ' })).toBe('CITY_REQUIRED');
  });

  it('rejects malformed cities', () => {
    expect(errorCodeFor({ city: ['delhi', 'mumbai'] })).toBe('INVALID_CITY');
    expect(errorCodeFor({ city: 'del*hi:1' })).toBe('INVALID_CITY');
    expect(errorCodeFor({ city: 'a'.repeat(65) })).toBe('INVALID_CITY');
  });

  it('rejects non-numeric prices', () => {
    expect(errorCodeFor({ city: 'delhi', minPrice: 'abc' })).toBe('INVALID_PRICE');
    expect(errorCodeFor({ city: 'delhi', maxPrice: '' })).toBe('INVALID_PRICE');
    expect(errorCodeFor({ city: 'delhi', maxPrice: '1e3' })).toBe('INVALID_PRICE');
    expect(errorCodeFor({ city: 'delhi', minPrice: ['1', '2'] })).toBe('INVALID_PRICE');
  });

  it('rejects negative prices', () => {
    expect(errorCodeFor({ city: 'delhi', minPrice: '-1' })).toBe('INVALID_PRICE');
    expect(errorCodeFor({ city: 'delhi', maxPrice: '-500' })).toBe('INVALID_PRICE');
  });

  it('rejects minPrice greater than maxPrice', () => {
    expect(errorCodeFor({ city: 'delhi', minPrice: '8000', maxPrice: '6000' })).toBe('INVALID_PRICE_RANGE');
  });
});
