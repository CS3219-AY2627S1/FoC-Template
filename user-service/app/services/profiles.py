"""Profile response composition."""

from app.models import User
from app.schemas import UserResponse


def own_profile_response(user: User) -> UserResponse:
    """Build a profile response without fetching data from other services."""

    return UserResponse.model_validate(user)
