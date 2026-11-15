Follow the AI usage policy
# AI Usage Policy 

## What's Allowed
You may use AI tools* for:
- Requirements work: discovering, interpreting, formatting, specific style writing
- Writing implementation code (e.g., functions, classes, unit tests) once requirements and architecture are finalized by you.
- Boilerplate generation (e.g., config, scaffolding, repetitive glue code).
- Debugging assistance (e.g., error explanations, test suggestions).
- Refactoring and documentation improvements (e.g., docstrings, comments).
- Learning support (e.g., "explain this algorithm").

All allowed uses require explicit citation (see citation point below).

* AI tools: Systems that generate or transform text/code (e.g., ChatGPT, GitHub Copilot, etc.).

## What's Not Allowed
You must not use AI tools for:
- Requirements work: wholesale outsourcing of requirements elicitation to AI tools, prioritizing project requirements; consolidating backlog, sprint planning.
- Architecture & design: proposing/changing system architecture, component boundaries, selecting design patterns, deciding data schemas, defining interfaces, or making performance/security trade-offs.
- Decision rationales: drafting your trade-off analyses, risk mentions, or justification mentions.

## Your Responsibilities
- Accountable: You remain fully responsible for understanding and validating any AI-assisted code.
- Quality & compliance: Ensure outputs meet assignment specs, performance or security guidelines, and licensing constraints.
- Privacy: Do not paste proprietary, personal, or assessment content into tools that store prompts.

## Required Citation & Disclosure
Every submission using AI must include:
- Source & mode: which tool(s), how it was used (generate/refactor/debug/explain).
- Prompts: the exact prompts + key responses.
- Location(s):
  - place the attribution comment at the top of each AI-influenced file (see below) as a comment,
  - a consolidated disclosure in your project README as the last section. Add a link to the README in the slide deck
  - a usage log file in the project repository

### Example: Short File-Header Attribution (in each affected file)
AI Assistance Disclosure:
Tool: ChatGPT (model: GPT-5.6 Luna Light), date: 2026-08-11
Scope: Generated initial implementation of modules X and Y; suggested test cases for Z.
Author review: I validated correctness, edited for style, and added boundary checks.

### Example: Project-Level Disclosure
(put in README and add link to the README in submission slide deck)
AI Use Summary
Tools: ChatGPT (GPT-5.6 Luna Light), GitHub Copilot
Prohibited phases avoided: requirements elicitation; architecture/design decisions.
Used for:
- Generating boilerplate for Express server and Jest config.
- Getting suggestions for refactoring; for data parsing function; I retained A, rejected B (explanation below).
- Generating unit tests for edge cases (I added two additional tests).
Verification: All AI outputs reviewed, edited, and tested by the authors.
Prompts/Key Exchanges: See /ai/usage-log.md at the end of this segment.

### Example: Logging
- Maintain a log, `/ai/usage-log.md`, in the repository with timestamps, prompts, and usage scenarios.
- Mark any pasted AI code blocks with comments like:
  `// AI-generated (edited by <name>).`
- Add all your `SKILLS.md`/`AGENTS.md` to the repository before the final submission.

