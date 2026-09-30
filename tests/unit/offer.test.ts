import { describe, expect, it } from 'vitest';
import { deduplicateOffers, normalizeHotelName, type HotelOffer } from '../../src/domain/offer';

const offer = (name: string, price: number, supplier: HotelOffer['supplier'], commissionPct = 10): HotelOffer => ({
  name,
  price,
  supplier,
  commissionPct,
});

describe('deduplicateOffers', () => {
  it('selects the cheaper offer when Supplier B is cheaper', () => {
    const result = deduplicateOffers([offer('Holtin', 6000, 'Supplier A'), offer('Holtin', 5340, 'Supplier B', 20)]);

    expect(result).toEqual([offer('Holtin', 5340, 'Supplier B', 20)]);
  });

  it('selects the cheaper offer when Supplier A is cheaper', () => {
    const result = deduplicateOffers([offer('Radison', 5900, 'Supplier A', 13), offer('Radison', 6200, 'Supplier B', 15)]);

    expect(result).toEqual([offer('Radison', 5900, 'Supplier A', 13)]);
  });

  it('keeps hotels that exist only in Supplier A', () => {
    const result = deduplicateOffers([offer('Ibis Central', 3200, 'Supplier A')]);

    expect(result).toEqual([offer('Ibis Central', 3200, 'Supplier A')]);
  });

  it('keeps hotels that exist only in Supplier B', () => {
    const result = deduplicateOffers([offer('Lemon Tree', 4100, 'Supplier B')]);

    expect(result).toEqual([offer('Lemon Tree', 4100, 'Supplier B')]);
  });

  it('keeps the first offer (Supplier A) when prices are equal', () => {
    const result = deduplicateOffers([offer('Taj Palace', 12500, 'Supplier A', 12), offer('Taj Palace', 12500, 'Supplier B', 8)]);

    expect(result).toEqual([offer('Taj Palace', 12500, 'Supplier A', 12)]);
  });

  it('treats names that differ only by case or whitespace as the same hotel', () => {
    const result = deduplicateOffers([offer('Park Plaza', 7200, 'Supplier A'), offer('  PARK   PLAZA ', 6900, 'Supplier B')]);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ supplier: 'Supplier B', price: 6900 });
  });

  it('handles a mix of overlapping and unique hotels', () => {
    const result = deduplicateOffers([
      offer('Holtin', 6000, 'Supplier A'),
      offer('Ibis Central', 3200, 'Supplier A'),
      offer('Holtin', 5340, 'Supplier B'),
      offer('Lemon Tree', 4100, 'Supplier B'),
    ]);

    expect(result.map((o) => o.name).sort()).toEqual(['Holtin', 'Ibis Central', 'Lemon Tree']);
  });

  it('returns an empty list for no offers', () => {
    expect(deduplicateOffers([])).toEqual([]);
  });
});

describe('normalizeHotelName', () => {
  it('trims, collapses whitespace and lower-cases', () => {
    expect(normalizeHotelName('  Taj   PALACE ')).toBe('taj palace');
  });
});
