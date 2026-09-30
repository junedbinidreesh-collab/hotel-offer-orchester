import { NotFoundError } from '../errors/app-error';
import { ErrorCode } from '../errors/error-codes';
import type { HotelOfferWorkflowInput, HotelOfferWorkflowResult } from '../temporal/types';

export interface HotelOfferWorkflowRunner {
  run(input: HotelOfferWorkflowInput, context: { requestId: string }): Promise<HotelOfferWorkflowResult>;
}

export class HotelService {
  constructor(private readonly workflowRunner: HotelOfferWorkflowRunner) {}

  async getHotels(input: HotelOfferWorkflowInput, requestId: string): Promise<HotelOfferWorkflowResult> {
    const result = await this.workflowRunner.run(input, { requestId });

    // An empty city is only "not found" when every supplier answered; if one was down
    // we cannot tell whether the city is unknown or the data is just missing.
    if (result.totalOffers === 0 && result.failedSuppliers.length === 0) {
      throw new NotFoundError(ErrorCode.NO_HOTELS_FOUND, `No hotels found for city "${input.city}"`);
    }
    return result;
  }
}
