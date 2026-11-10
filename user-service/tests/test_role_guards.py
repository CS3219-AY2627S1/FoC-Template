# AI Assistance Disclosure:
# Tool: ChatGPT (Codex, model: gpt-5.6-terra), date: 2026-09-21
# Scope: Added or extended tests for system-role guards.
# Author review: I validated correctness and added boundary checks where needed.

from __future__ import annotations

from app.auth.dependencies import has_minimum_role
from app.models import SystemRole


def test_fixed_role_hierarchy_is_server_side_and_inherited() -> None:
    assert has_minimum_role(SystemRole.USER, SystemRole.USER)
    assert not has_minimum_role(SystemRole.USER, SystemRole.ADMIN)
    assert has_minimum_role(SystemRole.ADMIN, SystemRole.USER)
    assert has_minimum_role(SystemRole.ADMIN, SystemRole.ADMIN)
    assert not has_minimum_role(SystemRole.ADMIN, SystemRole.SUPER_ADMIN)
    assert has_minimum_role(SystemRole.SUPER_ADMIN, SystemRole.USER)
    assert has_minimum_role(SystemRole.SUPER_ADMIN, SystemRole.ADMIN)
    assert has_minimum_role(SystemRole.SUPER_ADMIN, SystemRole.SUPER_ADMIN)
