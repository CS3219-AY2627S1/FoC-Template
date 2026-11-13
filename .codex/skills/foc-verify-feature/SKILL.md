---
name: foc-verify-feature
description: Run applicable FoC verification checks and report evidence and limitations.
---

# FoC Verify Feature

Follow the [root reading path](../../../AGENTS.md). Use the approved test plan, owning service's
documented commands and relevant CI jobs. Reuse current results for unchanged code.

Run completion checks for affected code/API/migrations or frontend work. Use Compose build/start
and health smoke checks for runtime/integration changes when required dependencies/configuration
exist. Verify affected generated contracts against the running service.

For frontend changes, verify the shared [product design contract](../../../design.md), affected
role/session behavior, desktop and `375px` layouts, keyboard/focus and error states. Shared-shell
changes also run `python3 .github/scripts/test_ui_design_contract.py` and compare all affected
service routes; a single service rendering correctly is not sufficient evidence.

When a change adds or renames a required `compose.yaml` variable (`${NAME:?...}`), touches
`.env.example` or CI environment blocks, run `python3 .github/scripts/compose_env_check.py`.
CI does not read `.env`; every job that runs Compose and the Kafka smoke script must provide the
variable, as must `.env.example`.

Report build, tests, static checks, packaging and smoke results as applicable. Missing scaffolds,
dependencies, skipped checks and unverified cross-service flows are limitations, never passes.
Return failures for repair and rerun affected checks; do not suppress failures.
