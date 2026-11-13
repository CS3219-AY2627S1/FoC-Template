import type { EstimateCreditRequest } from './requests'
import type { EstimateCreditResponse } from './responses'

/** Credit Estimation Service API boundary. */
export interface CreditEstimationApi {
  /** Estimate credit value for an errand based on its details. */
  estimateCredit(request: EstimateCreditRequest): Promise<EstimateCreditResponse>
}
