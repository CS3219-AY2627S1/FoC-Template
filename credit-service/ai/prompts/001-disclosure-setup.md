<!--
AI Assistance Disclosure:
Tool: OpenAI Codex (model: GPT-6), date: 2026-10-19 (Asia/Singapore).
Scope: Archived the user's supplied text verbatim; added archive labels and this header; relocated under credit-service.
-->

# Prompt archive — 001

Received 2026-10-19 (Asia/Singapore). Text inside the following fences is the
user's supplied text, not AI-generated policy or an AI-generated assignment.

## Supplied repository instruction

```text
# AGENTS.md instructions

<INSTRUCTIONS>
<!-- postman-cli:installation:start -->
Postman CLI is installed on this device, and can be used for API Engineering work.
<!-- postman-cli:installation:end -->
</INSTRUCTIONS>
```

## Exact task prompt

```text
i'm going to implement credit-service in this branch with your help, and we need to record all the usage as we implement this according to these guidelines



What’s Allowed 

You may use AI tools\* for: 

- Requirements work: discovering, interpreting, formatting, specific style writing 
- Writing implementation code (e.g., functions, classes, unit tests) once requirements and architecture are finalized by you. 
- Boilerplate generation (e.g., config, scaffolding, repetitive glue code). 
- Debugging assistance (e.g., error explanations, test suggestions). 
- Refactoring and documentation improvements (e.g., docstrings, comments). 
- Learning support (e.g., “explain this algorithm”). 



All allowed uses require explicit citation (see citation point below). 

*\* AI tools: Systems that generate or transform text/code (e.g., ChatGPT, GitHub Copilot, etc.,).&#xA0;*

What’s Not Allowed 

You must not use AI tools for: 

- Requirements work: wholesale outsourcing of requirements elicitation to AI tools, prioritizing project requirements; consolidating backlog, sprint planning. 
- Architecture & design: proposing/changing system architecture, component boundaries, selecting design patterns, deciding data schemas, defining interfaces, or making performance/security trade-offs. 
- Decision rationales: drafting your trade-off analyses, risk mentions, or justification mentions. 



Your Responsibilities 

- Accountable: You remain fully responsible for understanding and validating any AI-assisted code. 
- Quality & compliance: Ensure outputs meet assignment specs, performance or security guidelines, and licensing constraints. 
- Privacy: Do not paste proprietary, personal, or assessment content into tools that store prompts. 



Required Citation & Disclosure 

Every submission using AI must include: 

- Source & mode: which tool(s), how it was used (generate/refactor/debug/explain). 
- Prompts: the exact prompts + key responses. 
- Location(s): place the attribution comment at the top of each AI-influenced file (see below) as a comment, 
- \


CS3219 Project Document AY2627 Sem1 

16 





-

* a consolidated disclosure in your project README as the last section. Add a link to the README in the slide deck 
* a usage log file in the project repository 
* \




**Example: Short File**-**Header Attribution (in each affected file)&#xA0;**

AI Assistance Disclosure: 

Tool: ChatGPT (model: GPT-5.6 Luna Light), date: 2026-08-11 

Scope: Generated initial implementation of modules X and Y; suggested test cases for Z. 

Author review: I validated correctness, edited for style, and added boundary checks. 

**Example: Project**-**Level Disclosure&#xA0;**

(put in README and add link to the README in submission slide deck) 

AI Use Summary 

Tools: ChatGPT (GPT-5.6 Luna Light), GitHub Copilot 

Prohibited phases avoided: requirements elicitation; architecture/design decisions. Used for: 

- Generating boilerplate for Express server and Jest config. 
- Getting suggestions for refactoring; for data parsing function; I retained A, rejected B (explanation below). 
- Generating unit tests for edge cases (I added two additional tests). Verification: All AI outputs reviewed, edited, and tested by the authors. Prompts/Key Exchanges: See /ai/usage-log.md at the end of this segment. 



**Example: Logging&#xA0;**

- Maintain a log, /ai/usage-log.md, in the repository with timestamps, prompts, and usage scenarios. 
- Mark any pasted AI code blocks with comments like: 



// AI-generated (edited by \<name>). 

- Add all your SKILLS.md/AGENTS.md to the repository before the final submission. 



Academic Integrity & Licensing 

- You must ensure generated code does not introduce incompatible licenses or plagiarized content. If the tool cites a source, credit it. 
- If unsure about licensing, rewrite in your own words or implement from specifications. 



Evaluation & Penalties 

- Missing or misleading disclosure may reduce the assignment grade or be treated as an academic integrity violation. 

CS3219 Project Document AY2627 Sem1 

17 





- Using AI in prohibited phases (requirements/architecture/design) will incur penalties up to receiving a zero on the project. 



Team Agreement 

- Teams must agree on AI usage norms and maintain a shared /ai/usage-log.md. 
- Each member remains accountable for understanding the entire codebase. 



Quick Checklist (before you submit your work) 

- Requirements and architecture not generated wholesale by AI. 
- AI is used only for implementation/debugging/refactoring/docs. 
- All AI-influenced files have header attributions. 
- README/report includes the project-level AI use summary. 
- Prompts and key outputs archived in /ai/usage-log.md. 
- All AI outputs are reviewed, tested, and verified by the authors. 
```
