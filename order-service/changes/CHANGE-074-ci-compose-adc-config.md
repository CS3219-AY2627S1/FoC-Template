# CHANGE-074: Validate Compose in CI without developer ADC credentials

- Date: 2026-10-08
- Developer: Yao Xiang, Developer 1
- Status: Implemented; GitHub rerun required
- Change type: CI configuration fix
- Related change: CHANGE-073

## Problem

The Compose check in .github/workflows/ci.yml runs docker compose config on a clean CI checkout. The Order Service bind mount intentionally requires GOOGLE_APPLICATION_CREDENTIALS_HOST, which is set only in each developer's ignored local .env. The user-supplied CI log confirms the required-variable interpolation failure. CI therefore cannot interpolate the Compose file even though it is only validating configuration and should not need personal credentials.

## Fix

The CI Compose-validation step creates an empty file under /tmp and passes its path as GOOGLE_APPLICATION_CREDENTIALS_HOST. This satisfies Compose's required bind-source variable for static configuration parsing. The workflow does not start containers, mount a credential, or publish to Pub/Sub. Local Compose still requires each developer's real ADC file path.

## Affected files

- .github/workflows/ci.yml: provide a temporary empty bind-source path only to the docker compose config --quiet validation step.
- docs/change-log.md, docs/current-sprint.md, docs/active-work/yao-xiang.md, and ../ai/usage-log.md: record the fix and verification limits.

## Verification

- Static inspection confirms the temporary path is scoped to the Compose syntax/configuration check; no runtime step consumes it.
- The modified workflow parsed successfully with js-yaml; git diff --check passed for tracked changed files, and the new change record has no trailing whitespace.
- Follow-up local validation passed: Compose config --quiet returned exit code 0 with an empty placeholder ADC file and isolated Docker CLI config. The Compose plugin was invoked directly to avoid the inaccessible default Docker config; no Docker engine or container was needed.
- GitHub Actions rerun and actionlint remain unverified; gh and actionlint are not installed. The separate Maven failures supplied in the attachment are addressed in CHANGE-075.

## Recovery

Revert only the Validate compose.yaml step if a hosted run shows the temporary file does not satisfy Compose's bind-mount validation. Do not weaken the local Compose ADC requirement or add a credential file to CI.
