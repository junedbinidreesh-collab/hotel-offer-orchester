import type { HotelOffer, PriceRange } from '../../domain/offer';
import type { HotelRepository } from '../../repositories/hotel.repository';
import type { Logger } from '../../utils/logger';
import { runAsActivity } from './failure';

export function createHotelActivities(repository: HotelRepository, logger: Logger) {
  return {
    async saveCityOffers(city: string, offers: HotelOffer[]): Promise<void> {
      await runAsActivity(logger, 'Failed to save offers to Redis', { city }, async () => {
        await repository.replaceCityOffers(city, offers);
        logger.info({ city, offerCount: offers.length }, 'Offers saved to Redis');
      });
    },

    async findCityOffers(city: string, priceRange: PriceRange): Promise<HotelOffer[]> {
      return runAsActivity(logger, 'Failed to read offers from Redis', { city }, () =>
        repository.findCityOffers(city, priceRange),
      );
    },
  };
}

export type HotelActivities = ReturnType<typeof createHotelActivities>;
