# AI Usage Log Entry Format

Use this format whenever the Order Service workflow requires an entry in `../ai/usage-log.md`. Match the established project log style; do not introduce a separate unbolded key-value schema.

## Required structure

```markdown
## <task or feature> assistance (Service Name that AI is assisting for in this usage (ie: Order Service / Admin Service / Credit Service / Supplier Service or combinations))

- **Tool:** OpenAI Codex (<model name>)
- **Date:** YYYY-MM-DD
- **Mode:** <planning, research, implementation, verification, documentation, or combined mode>
- **Affected locations:** <files/directories or Git history affected>
- **Prompt:** <the user's prompt, preserving exact wording where practical>
- **Key response:** <concise description of the AI-assisted work and verified result>
- **Author verification:** <how the developer reviewed, selected, corrected, or verified the work>
```

An existing dated-heading style is also valid:

```markdown
## YYYY-MM-DD — <task>

- **Tool:** OpenAI Codex (<model name>)
- **Mode:** ...
- **Exact prompt:**

  > ...

- **Key response:** ...
- **Affected locations:** ...
- **Author verification:** ...
```

## Formatting rules

- Use a normal task heading such as `## <task> assistance` or the existing dated-heading form. Do not use `## AI Usage: ...`.
- Bold every field label and end it with a colon.
- Preserve the surrounding log's Markdown spacing and wrapped-line style.
- Use `**Prompt:**`, `**Exact prompt:**`, `**Exact follow-up prompts:**`, or `**Exact implementation prompt:**` according to the evidence available.
- Put short exact prompts in blockquotes and long prompts in fenced `text` blocks when that improves readability.
- Keep `**Key response:**` concise but include material implementation or verification results.
- Identify actual affected locations; do not claim application source or tests changed when they did not.
- Make `**Author verification:**` explicit. Attribute architecture and product judgment to the developer/team, not the AI.
- If human review is not yet complete, state that it is pending rather than inventing approval or verification.
- Do not record secrets, credentials, private data, hidden reasoning, or unsupported claims.
- Append to the existing log; do not rewrite unrelated historical entries merely to normalize style.

Optional requirement IDs, decisions, deviations, tests, or change-record references belong inside the closest established field—normally `Key response`, `Affected locations`, or `Author verification`—rather than creating a new incompatible schema.
