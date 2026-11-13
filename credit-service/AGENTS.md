<!--
AI Assistance Disclosure:
Tool: OpenAI Codex (model: GPT-6), dates: 2026-10-19–2026-10-21 (Asia/Singapore).
Scope: Recorded the user's AI-use rules, credit-service log location, approved JSON attribution exception, and relocated manifest path.
-->

## AI assistance and disclosure

Follow the user's assignment rules recorded in
[the original prompt](credit-service/ai/prompts/001-disclosure-setup.md).

- Before generating implementation code or unit tests, obtain the human's finalized
  requirements and architecture. Existing files provide context, but do not by
  themselves establish human approval of unresolved decisions.
- Do not perform wholesale requirements elicitation, prioritize requirements,
  consolidate backlogs, or plan sprints.
- Do not propose or change architecture, component boundaries, design patterns,
  data schemas, interfaces, or performance/security trade-offs. If implementation
  requires an unresolved decision in these areas, ask the human to decide it.
- Do not draft decision rationales, trade-off analyses, risk mentions, or
  justifications. These must come from the human authors.
- Allowed assistance includes bounded requirements interpretation/formatting,
  implementation after human finalization, boilerplate, debugging, refactoring,
  documentation, and explanations.
- Record each substantive user prompt verbatim and its key responses in
  `credit-service/ai/usage-log.md` or a linked prompt archive for credit-service
  work. Keep this service's AI records under `credit-service/ai/`, not a root
  `ai/` folder. Include timestamp and timezone,
  tool/model, usage mode, affected paths, checks actually run, and review status.
  Log follow-up requests and corrections as well. Do not replace exact prompts
  with summaries or archive credentials, personal, proprietary, or restricted
  assessment content; ask the user to resolve any conflict with exact logging.
- Keep a comment attribution at the top of every AI-influenced file using the
  file format's supported comment syntax. Identify tool/model, date, actual
  scope, author-review status, and the relevant log entry. Preserve required
  interpreter directives. For formats without comments, obtain the human's
  decision on an acceptable attribution method before creating the file.
- JSON exception approved by the user on 2026-10-20 (usage-log entry 005):
  attribute `credit-service/package.json` (relocated from
  `credit-service/grpc/package.json` in exchange 024) and the root `package-lock.json`
  in `credit-service/README.md` and the service usage log. These files cannot
  contain comments. Do not ask again for this approved attribution method.
- Label pasted AI implementation blocks using a supported comment such as
  `AI-generated; human review pending.` Only add an editor's name or claim human
  review after the human confirms it. Agent-run checks are not human validation.
- Keep the consolidated AI Use Summary as the last section of the credit-service/README.md.
  Update it and the log as assistance occurs; do not claim project-wide history
  or team approval that has not been provided.
- Credit any cited source and record any licensing information actually supplied;
  do not invent provenance or claim license verification without evidence.
- Keep all project agent/skill instructions used in the repository for final
  submission. Record any additional skill instructions used and ensure they are
  included before submission. Do not overwrite teammates' instructions.
- The human authors remain responsible for understanding, reviewing, validating,
  and submitting assisted work. They must agree team norms and link the README
  from the submission slide deck.
