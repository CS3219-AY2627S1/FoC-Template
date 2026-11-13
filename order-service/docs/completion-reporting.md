# Per-Turn Completion Reporting

Use this reporting contract in the final response for every Order Service chat turn handled under this workflow, including workflow setup, architecture/design, implementation, tests, verification, documentation, review, advisory-only questions, status requests, partial work, blocked work, and turns that end by requesting a decision. Commentary progress updates do not need this format.

Lead with the task outcome or direct answer. The report is an auditable baseline, not the entire response. Add task-specific explanatory content and extra headers whenever they materially improve understanding. Optional headers may appear before, between, or after the required sections, but keep the required sections below in their relative order and include each exactly once.

Useful optional headers include `Context Summary`, `Root Cause`, `Recommended Fix`, `Architecture Proposal`, `API Gaps`, `Project D1 Traceability`, `Compatibility Impact`, `Security Impact`, `User-Visible Changes`, `Decision Required`, `Migration Notes`, `Rollback Considerations`, and `Next Steps`. This list is illustrative, not exhaustive. Add an optional header only when its content is meaningful for the current turn.

## Required sections

### Added

- New files, decisions, workflows, records, documentation, tests, implementation, or other artifacts created.
- Include purpose and exact location where relevant.
- If nothing was added, write `None.`

### Updated

- Existing files, specifications, skills, workflows, indexes, decisions, logs, tests, or implementation modified.
- Summarize each meaningful change.
- If nothing was updated, write `None.`

### Removed

- Deleted files, obsolete entries, superseded workflows, removed requirements, or deliberately removed behavior.
- Include authorization and recovery or rollback information where relevant.
- If nothing was removed, write `None.`

### Design Decisions

- Important decisions, constraints, alternatives, trade-offs, retained rules, approval state, and assumptions.
- Distinguish confirmed or approved decisions from proposals, recommendations, and assumptions.
- Never represent AI advice, silence, implementation, or passing tests as human approval.
- If no design decision was made, write `None.`

### Affected Artifacts

State `Changed` or `Unchanged` for every area below and identify relevant files or effects concisely. Use `Not applicable` only when an area genuinely cannot apply.

- Requirements and product architecture
- API contracts and integrations
- Architecture and design decisions
- Diagrams and data models
- Application source code
- Tests and test specifications
- Development workflows and skills
- Documentation and project indexes
- AI usage and disclosure records
- Deployment, persistence, or infrastructure configuration

For advisory-only or informational turns, explicitly state that no project artifacts were modified.

### Verification

- List only inspections, validations, tests, and checks actually performed, with their results.
- Include failed, skipped, and unavailable checks with reasons.
- Distinguish deterministic checks, judgment-based inspection, and external confirmation.
- Do not call an integration verified when it was only planned, documented, superficially inspected, mocked, stubbed, or reported by another party without checking the approved contract and actual implementation.

### Remaining Issues

- List unresolved blockers, risks, assumptions, pending approvals, unverified integrations, incomplete scope, and follow-up work.
- If the task could not be completed, explain the blocker and report only work actually performed.
- If none remain, write `None.`

## Accuracy and persistence rules

- Preserve exact paths, branch names, IDs, statuses, and validation results when relevant.
- Distinguish added from updated content, planned from completed work, proposed from approved decisions, inspected from verified integrations, and blockers from completed outcomes.
- Never fabricate files, changes, tests, approvals, API classifications, or verification results.
- Prototypes, mocks, claims, stubs, and proposed contracts are not verified implementations unless independently checked against the effective approved contract.
- For implementation turns, include the Project D1 traceability, sequence/class responsibilities, TDD evidence, tests, contracts, frontend/backend impact, persistent-context updates, and remaining risks required by `AGENTS.md` as meaningful task-specific sections or details.
- For frontend turns, include the directory/structure used, backend files affected, application role/`USER` mode, API contracts, responsive verification, shared files, and blockers required by `docs/frontend-integration-workflow.md`.
- Do not create a separate per-turn summary Markdown file. Update the durable record that owns the information, then use this format only in the final chat response.
