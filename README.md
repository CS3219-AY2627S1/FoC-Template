<!--
AI Assistance Disclosure
Tool and date: OpenAI Codex (gpt-6.1-sol), 2026-11-11
Scope (AI-16): Compiled the attribution documentation.
Usage log: AI_USAGE_LOG.md
Author review: Changes validated and confirmed.
AI Assistance Disclosure:
Tool: OpenAI Codex (GPT-5), date: 2026-11-11
Scope: Added only the project-level AI disclosure section and usage-log link at the end.
-->

# CS3219 — Software Design and Architecture (AY2627 Sem 1)

## CampusCouriers

**CampusCouriers** is a peer-to-peer campus errand platform where
students can request items to be collected from stores or facilities on
campus, and other students can fulfil (and deliver) those requests. The
platform runs on a closed credit economy — credits cannot be bought,
withdrawn, or exchanged for money, and only circulate within the platform.

---

## Team Members

| Name | Role |
| ----- | ----- |
| MELODI JOY HALIM ([@meloppeitreet](https://github.com/meloppeitreet)) | User Service, Cloud Deployment |
| LIN YU XIN ([@watermelonisred](https://github.com/watermelonisred)) | Supplier Service, Chat Service |
| TAN YE XIN ([@yx-tzzz](https://github.com/yx-tzzz)) | Credit Service, AI Errand Assistance Service |
| YEO YONG XUAN ([@yoyongxuan](https://github.com/yoyongxuan)) | Order Service, RAG Chatbot |
| YONG YI-TZE ELLIOT ([@yytelliot](https://github.com/yytelliot)) | Frontend React App, Notification Service |

---

## Repository Structure

This repository follows a **one-service-per-folder** structure. Application
services live in top-level folders alongside the React frontend, shared data,
event-streaming configuration, deployment manifests, infrastructure code, and
project documentation.

```text
.
├── .github/workflows/
├── ai-errand-assistant-service/
├── chat-service/
├── credit-service/
├── data/
├── debezium/
├── docs/
├── frontend/
├── k8s/
├── notification-service/
├── order-service/
├── RAG-service/
├── scripts/
├── supplier-service/
├── terraform/
├── user-service/
├── compose.yaml
└── README.md
```

Services publish events through a **transactional outbox** relayed to Kafka by Debezium; see
[`debezium/README.md`](debezium/README.md) for the pipeline and the event catalogue.

- Any **nice-to-have (N2H)** feature that warrants its own service should
  be added as an **additional folder** at the same level, following the
  same per-service structure.
- Files for agentic coding tools (e.g. agent configs, prompts, skills)
  may be added as needed, but must still **respect the
  one-service-per-folder skeleton** for core implementation.

---

## AI Use Summary

**Tools:** OpenAI Codex, Anthropic Claude and Claude Code, and GitHub Copilot code review and Autofix. Model versions are recorded where they were available.

**Used for:**

- Generating and refining frontend pages, account and administrator workflows, notification behavior, and integrations with backend services.
- Implementing and refactoring User and Order Service functionality, including authentication, errand lifecycle endpoints, schema changes, validation, and transactional outbox events.
- Producing tests, debugging failures, applying code-review suggestions, and checking edge cases across the frontend and microservices.
- Preparing deployment configuration and automation for Docker Compose, Kafka and Debezium, Kubernetes, AWS Terraform, and GitHub Actions.
- Integrating and deploying the AI errand assistant and RAG assistant.
- Updating technical documentation and AI-use attribution records.

**Verification:** AI-assisted outputs were reviewed, edited where necessary, and validated by the authors.

**Prompts and key exchanges:** See the [AI usage log](AI_USAGE_LOG.md) for the recorded tools, dates, prompts or prompt summaries, key responses, and affected files. File headers link relevant changes to their log entries; for formats that do not support comments, attribution is recorded directly in the log.
