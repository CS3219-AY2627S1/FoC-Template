# CHANGE-008: Standardize Order Service AI Usage Formatting

Date: 2026-09-26

Status: Completed

Approved by: User

## Requested change

Rewrite the Shared Next.js frontend workflow entry in `../ai/usage-log.md` to match the established project format and persist that format so future Order Service AI disclosures remain consistent.

## Reason

The CHANGE-007 disclosure used a new `## AI Usage:` heading and unbolded key-value fields that did not match the existing log's task heading, bold field labels, prompt, key-response, affected-location, and author-verification style.

## Scope

- Rewrote only the Shared Next.js frontend workflow entry; unrelated historical entries were preserved.
- Added `docs/ai-usage-format.md` as the single formatting authority.
- Removed the competing schema from `docs/architecture-review-playbook.md` and linked the new guide.
- Added the guide to mandatory context, structured/navigation records, the repository-local skill/index, change log, and active-work handoff.

## Verification

- The corrected entry uses a normal task heading and bold `Tool`, `Date`, `Mode`, `Affected locations`, `Prompt`, `Key response`, and `Author verification` labels.
- The entry accurately states that no application source changed and that the developer supplied/approved the context.
- The repository-local skill and TOML validate.
- `git diff --check` passes.

## Rollback or reversal considerations

Reverting this change would restore an inconsistent log schema and allow future disclosures to drift from the established format.
