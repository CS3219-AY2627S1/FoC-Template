## AI Assistance Disclosure:
## Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-03
## Scope: Boilerplate generation — provide the revision template copied from credit-service conventions.
## Author review: Keith confirmed review of all affected changes.
## Details: notification-service/ai/usage-log.md; ai-20261103-001

"""${message}.

Revision ID: ${up_revision}
Revises: ${down_revision | comma,n}
Create Date: ${create_date}

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

${imports if imports else ""}

revision: str = ${repr(up_revision)}
down_revision: Union[str, None] = ${repr(down_revision)}
branch_labels: Union[str, Sequence[str], None] = ${repr(branch_labels)}
depends_on: Union[str, Sequence[str], None] = ${repr(depends_on)}


def upgrade() -> None:
    ${upgrades if upgrades else "pass"}
