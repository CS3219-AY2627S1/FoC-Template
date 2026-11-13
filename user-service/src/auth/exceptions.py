class AuthenticationUnavailableError(RuntimeError):
    pass


class InvalidCredentialsError(ValueError):
    pass

class UserAlreadyExistsError(ValueError):
    pass


class UserNotFoundError(ValueError):
    pass
