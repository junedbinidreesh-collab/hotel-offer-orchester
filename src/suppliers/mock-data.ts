import type { SupplierHotel } from '../domain/hotel';

// Deterministic fixtures. Overlap is intentional:
//  - Holtin (delhi): B is cheaper            - Radison (delhi): A is cheaper
//  - Taj Palace (delhi): equal price         - Park Plaza (delhi): name differs only by case
//  - Ibis Central, Leela Residency: A only   - Lemon Tree, Hyatt Regency: B only
//  - Radison (mumbai) / Sea Breeze / Rambagh Heritage: overlap in other cities
export const SUPPLIER_A_HOTELS: readonly SupplierHotel[] = [
  { hotelId: 'a1', name: 'Holtin', price: 6000, city: 'delhi', commissionPct: 10 },
  { hotelId: 'a2', name: 'Radison', price: 5900, city: 'delhi', commissionPct: 13 },
  { hotelId: 'a3', name: 'Taj Palace', price: 12500, city: 'delhi', commissionPct: 12 },
  { hotelId: 'a4', name: 'Leela Residency', price: 9800, city: 'delhi', commissionPct: 11 },
  { hotelId: 'a5', name: 'Ibis Central', price: 3200, city: 'delhi', commissionPct: 9 },
  { hotelId: 'a6', name: 'Park Plaza', price: 7200, city: 'delhi', commissionPct: 14 },
  { hotelId: 'a7', name: 'Sea Breeze', price: 8200, city: 'mumbai', commissionPct: 12 },
  { hotelId: 'a8', name: 'Radison', price: 6100, city: 'mumbai', commissionPct: 13 },
  { hotelId: 'a9', name: 'Rambagh Heritage', price: 15000, city: 'jaipur', commissionPct: 15 },
];

export const SUPPLIER_B_HOTELS: readonly SupplierHotel[] = [
  { hotelId: 'b1', name: 'Holtin', price: 5340, city: 'delhi', commissionPct: 20 },
  { hotelId: 'b2', name: 'Radison', price: 6200, city: 'delhi', commissionPct: 15 },
  { hotelId: 'b3', name: 'Taj Palace', price: 12500, city: 'delhi', commissionPct: 8 },
  { hotelId: 'b4', name: 'Lemon Tree', price: 4100, city: 'delhi', commissionPct: 12 },
  { hotelId: 'b5', name: 'Hyatt Regency', price: 10400, city: 'delhi', commissionPct: 10 },
  { hotelId: 'b6', name: 'PARK PLAZA', price: 7500, city: 'delhi', commissionPct: 16 },
  { hotelId: 'b7', name: 'Sea Breeze', price: 8500, city: 'mumbai', commissionPct: 10 },
  { hotelId: 'b8', name: 'Marine Drive Inn', price: 4800, city: 'mumbai', commissionPct: 11 },
  { hotelId: 'b9', name: 'Rambagh Heritage', price: 14200, city: 'jaipur', commissionPct: 12 },
];
