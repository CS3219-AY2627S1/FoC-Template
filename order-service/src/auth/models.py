from uuid import UUID

from pydantic import BaseModel


class UserRoleResponse(BaseModel):
    user_id: UUID
    role: str