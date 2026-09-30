import type { HotelOffer, PriceRange, SupplierName } from '../domain/offer';

// Must match the exported workflow function name; the client starts it by name so
// the Node process never imports workflow code (which only runs in the sandbox).
export const HOTEL_OFFER_WORKFLOW_NAME = 'hotelOfferWorkflow';

export interface HotelOfferWorkflowInput {
  city: string;
  priceRange: PriceRange;
}

export interface HotelOfferWorkflowResult {
  offers: HotelOffer[];
  totalOffers: number;
  failedSuppliers: SupplierName[];
}
