export const SUPPLIER_NAMES = ['Supplier A', 'Supplier B'] as const;

export type SupplierName = (typeof SUPPLIER_NAMES)[number];

export interface HotelOffer {
  name: string;
  price: number;
  supplier: SupplierName;
  commissionPct: number;
}

export interface PriceRange {
  minPrice?: number;
  maxPrice?: number;
}

export function normalizeHotelName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Keeps the cheapest offer per hotel. The comparison is strict, so on equal prices
 * the offer seen first wins; callers pass suppliers in a fixed order which makes
 * the tie-break deterministic (Supplier A).
 */
export function deduplicateOffers(offers: readonly HotelOffer[]): HotelOffer[] {
  const cheapestByHotel = new Map<string, HotelOffer>();
  for (const offer of offers) {
    const key = normalizeHotelName(offer.name);
    const current = cheapestByHotel.get(key);
    if (!current || offer.price < current.price) {
      cheapestByHotel.set(key, offer);
    }
  }
  return [...cheapestByHotel.values()];
}
