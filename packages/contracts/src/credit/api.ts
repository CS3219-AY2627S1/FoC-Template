import type {
  AllocateInitialCreditCommand,
  DeleteUserCreditCommand,
  ReleaseCreditCommand,
  TransferCreditCommand,
} from './commands'
import type { ReserveCreditRequest, ViewCreditHistoryRequest, ViewCreditRequest } from './requests'
import type {
  ReserveCreditResponse,
  ViewCreditHistoryResponse,
  ViewCreditResponse,
} from './responses'

/** Credit Service methods for backend to implement */
export interface CreditApi {
  /// Synchronous HTTP methods

  /** Views credit balance for the authenticated user. */
  viewCredit(request: ViewCreditRequest): Promise<ViewCreditResponse>

  /** Views up to 100 history records for the authenticated user, skipping request.offset records. */
  viewCreditHistory(request: ViewCreditHistoryRequest): Promise<ViewCreditHistoryResponse>

  /** Reserves credit amount from available credits. */
  reserveCredit(request: ReserveCreditRequest): Promise<ReserveCreditResponse>

  /// Asynchronous commands from Kafka events

  /** Allocates initial credit amount for new user. */
  allocateInitialCredit(command: AllocateInitialCreditCommand): Promise<void>

  /** Releases credit amount from reserved credits. */
  releaseCredit(command: ReleaseCreditCommand): Promise<void>

  /** Transfers credit amount from sender's reserve balance to receiver's available balance. */
  transferCredit(command: TransferCreditCommand): Promise<void>

  /** Closes a user's credit account while preserving settlement history. */
  deleteUserCredit(command: DeleteUserCreditCommand): Promise<void>
}
