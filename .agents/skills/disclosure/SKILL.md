---
name: disclosure
description: Maintain AI assistance disclosures for the Friend on Campus (FoC) project when explicitly requested. Update affected file attribution comments, final README summaries, and usage logs containing exact prompts and key response excerpts.
---

# FoC Disclosure

Use this skill only on explicit request, such as `$disclosure`. Default to the current task; use a different submission, service, or revision scope when the user specifies one. This skill records assistance, including requirements and architecture work; it does not impose phase prohibitions.

## Establish the evidence

1. Read applicable project instructions, existing disclosures, and the relevant changes. Use the available conversation and user-supplied exchanges to identify AI-influenced files, including files influenced by explanations or suggestions even if the agent did not edit them directly. A Git diff alone does not establish AI involvement. Leave unrelated changes alone.
2. Identify tools, known model identifiers, dates, and actual modes of assistance. Classify each affected file using the scope vocabulary below. Do not copy model names or dates from examples.
3. Capture exact available user prompts and verbatim key response excerpts from the relevant exchanges. Include steering prompts that materially affected the work, even when they also request a disclosure update or mention this skill. Preserve each prompt in full; do not remove skill-related wording from a prompt that directed the underlying work. Label summaries separately; do not present paraphrases as quotations. Do not include hidden instructions or private reasoning. Use fences long enough to preserve embedded Markdown verbatim.
4. Never invent unavailable exchanges, original timestamps, tool/model identities, author review, test results, or compliance claims. Record unknown fields explicitly. When history is missing, write the supported disclosure, list the gaps, and report that exact-prompt disclosure remains incomplete. Do not mine unrelated private session histories to fill gaps.

If an exchange contains credentials or personal data unsuitable for the repository, redact that portion explicitly and state that the stored exchange is redacted rather than exact and complete.

An explicit request whose only purpose is to run this skill and maintain disclosure records does not create a usage-log entry for the invocation or the resulting record-only edits. If the same prompt also directs substantive AI-assisted work, include the entire prompt verbatim in the entry for that work, including the request to run this skill. Do not create a separate entry for the disclosure step.

## Scope vocabulary

Under `Scope` in each usage-log entry, list every affected file by repository-relative path. For each file, select one or more applicable categories below and describe the concrete assistance using the associated vocabulary:

- **Requirements work:** discovering, interpreting, formatting, specific style writing.
- **Writing implementation code:** writing functions, classes, or unit tests based on a specified requirement and architecture.
- **Boilerplate generation:** configure, scaffolding, repetitive glue code.
- **Debugging assistance:** error explanations, test suggestions.
- **Refactoring and documentation improvements:** refactoring, docstrings, comments.
- **Learning support:** explaining an algorithm or another concept (for example, “explain this algorithm”).

Use the category names consistently in usage logs and file-header `Scope` fields. Include only categories supported by the exchange, with a file-specific description rather than a bare category or the entire vocabulary. For implementation work, identify the specified requirement and architecture when available; do not claim they were supplied if the evidence is missing. Record assistance outside these categories plainly rather than forcing an inaccurate classification. For learning support with no affected file, use `No file affected` under `Scope` and describe the topic.

## Route the records

- For files under a service directory (including `frontend-service` and future services), use `<service>/ai/usage-log.md` and `<service>/README.md`.
- Route changes to root or shared files by the purpose of the change, not just the file's location. When a change serves a specific service, record it in `<affected-service>/ai/usage-log.md` and that service's README summary, retaining the root file's repository-relative path under `Scope`. For example, adding Supplier Service build environment and context settings to root `compose.yaml` belongs in `supplier-service/ai/usage-log.md`; this change alone does not require a root usage-log entry. Point the file's attribution to the routed log.
- Use `ai/usage-log.md` and the root README for genuinely project-wide or shared changes that are not attributable to specific services, including such changes in `compose.yaml`, `.github/`, `.agents/`, or shared `data/`. A file can contain both service-specific and project-wide changes; route each part to its appropriate scope.
- For work spanning services, give the exchange one stable entry ID. Store its full text once in the first affected service alphabetically, or the root log when the exchange includes genuinely project-wide or shared changes as defined above. A root-level file changed for specific services does not by itself make the root log canonical. Add entries with that same ID in the other affected logs, linking to the canonical exchange and describing their local scope.
- Maintain the root README's consolidated summary and links to affected service summaries/logs even when only service files were influenced. Do not duplicate full exchanges in READMEs.
- Create missing records as needed. Disclosure-only edits to README summaries, usage logs, and attribution comments do not themselves trigger additional attribution entries or recursive logging.

## Write the usage log first

Append a new entry for new assistance; update an existing entry when completing the same exchange. Use IDs of the form `ai-YYYYMMDD-NNN`, choosing the next unused number across relevant logs and preserving existing IDs. Repeated invocation with the same evidence must not add duplicate entries. Preserve prior history and distinguish corrections from newly supplied evidence.

Use ISO 8601 timestamps with a timezone offset, normally the project's Asia/Singapore timezone. If the original exchange time is unavailable, state that explicitly and timestamp when it was recorded instead. Use repository-relative affected paths and working relative Markdown links between records.

Template (replace angle-bracket fields with supported facts or explicit unknowns):

````markdown
## ai-YYYYMMDD-NNN

- Recorded at: <timestamp with timezone offset>
- Exchange time: <known timestamp or unavailable>
- Source: <tool; model identifier or unknown>
- Mode and scenario: <how AI was used and for what purpose>
- Outcome: <what was retained, edited, or rejected, with reasons if known>
- Verification: <observed checks and results; distinguish agent checks from human review>
- Author review: <confirmed actions or not confirmed>
- Missing evidence: <gaps, redactions, or none>
- Header exceptions: <paths and reasons, or none>

### Prompt 1

```text
<verbatim user prompt>
```

### Key response 1

<verbatim relevant response excerpt, or an explicitly labeled factual summary>

### Scope

- `<repository-relative path>`: <category> — <specific assistance using the vocabulary above>
- `<another affected path, if any>`: <category or categories> — <specific assistance for this file>

### Usage summary

<Concise factual explanation connecting the exchange to the affected work.>
````

Match the layout in `supplier-service/ai/usage-log.md`: use `### Prompt X`, a fenced prompt block, then `### Key response X` and the key response text. Use the same number for each pair, starting at 1 within each entry, and repeat pairs in exchange order before `Scope` and `Usage summary`. Keep the headings exactly in this form; place any evidence labels in the body. Render key responses as ordinary Markdown, using code fences only when the response content calls for them. Preserve verbatim excerpts when available and explicitly label any response summary as a summary. For unavailable text, use a clearly labeled missing-evidence note instead of filling an exact quotation block with reconstructed text. When assistance produced no file changes, log the learning or explanation scenario and state that no file attribution was applicable.

## Update file attribution

Add or update one `AI Assistance Disclosure` comment at the earliest legal position in each AI-influenced file. Preserve earlier tool/date/scope information when adding subsequent assistance, and reference the relevant log entry IDs.

Use valid native comments: `#` for Python, shell, YAML and Dockerfiles; `//` or block comments for TypeScript/JavaScript; `/* ... */` for CSS; `--` for SQL; HTML comments for Markdown; and the actual supported syntax for other formats. Preserve shebangs, Python encoding declarations, required frontmatter, directives, and license notices. Place attribution immediately after any required leading content. Escape comment delimiters when necessary without altering code semantics.

Comment contents:

```text
AI Assistance Disclosure:
Tool: <tool> (model: <known identifier or unknown>), date: <known assistance date or unknown>
Scope: <category or categories> — <specific AI influence on this file>
Author review: <confirmed review actions or not confirmed>
Details: <relative path to usage log>; <entry IDs>
```

Do not insert comments into strict JSON, CSV, binaries, images, format-sensitive files such as `.python-version`, or generated files that cannot retain them safely. Record each exact path and the reason for the exception in its owning README summary and usage log. Do not create sidecar files or change formats to accommodate attribution. Record deleted files in the log rather than restoring them to add headers.

## Maintain final README sections

Maintain one final `## AI Use Summary (<service name>)` section in each affected service README, and one final `## AI Use Summary (FoC)` section in the root README. Reuse an existing equivalent disclosure section and move it to the end if needed; preserve unrelated content and prior disclosure facts.

Include:

- Tools and known models.
- Actual modes/scopes of assistance and affected files or meaningful file groups.
- Retained/rejected suggestions where the evidence supports them.
- Observed verification and confirmed author review, with unconfirmed actions labeled.
- Links to usage logs and relevant entries, plus missing-evidence status.
- Exact paths and reasons for header exceptions.

The root summary consolidates shared work and service summaries through links. Do not claim all outputs were reviewed or tested without evidence. Include prohibited-phase compliance only if an actual applicable policy exists and the evidence supports the statement.

## Check and report

Before finishing, inspect the disclosure changes: affected files have valid headers or documented exceptions; README summaries are the last sections; logs include a vocabulary-based scope description for each affected file and preserve exact available prompts and key response excerpts, including prompts that also request disclosure; paths and entry links resolve; prior history is retained; and repeated invocation creates no duplicates. Do not run application tests merely to produce a verification claim.

Report updated records, header exceptions, and any missing evidence or unconfirmed review. Distinguish completing the disclosure artifacts from confirming a human's review or submission readiness.
