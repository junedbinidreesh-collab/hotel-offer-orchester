import { z } from 'zod';

// Shape returned by the supplier APIs. Validated at the boundary so a malformed
// supplier payload fails loudly instead of leaking NaN prices into Redis.
export const supplierHotelSchema = z.object({
  hotelId: z.string().min(1),
  name: z.string().trim().min(1),
  price: z.number().nonnegative(),
  city: z.string().min(1),
  commissionPct: z.number().min(0).max(100),
});

export type SupplierHotel = z.infer<typeof supplierHotelSchema>;
