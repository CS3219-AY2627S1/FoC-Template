class CreditNotFoundError(ValueError):
    pass


class CreditReservationNotFoundError(ValueError):
    pass


class InsufficientCreditsError(ValueError):
    pass


class CreditReservationConflictError(ValueError):
    pass


class CreditsAlreadyTransferredError(CreditReservationConflictError):
    pass


class CreditsAlreadyReleasedError(CreditReservationConflictError):
    pass


class CreditConsistencyError(ValueError):
    pass


class CreditRequestConflictError(ValueError):
    pass
