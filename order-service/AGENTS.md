# AGENTS.md — order-service

Guidance for AI coding agents working in this folder.

## Scope rules (course AI policy)
- The root `../AGENTS.md` (AI usage policy, guardrails, header and log formats) applies here in full.
- Implementation code only. Do **not** decide or change the Prisma schema's domain
  models, API routes/DTOs, auth, or inter-service communication. Ask the team.
- Every new file starts with the AI Assistance Disclosure header (see any file in `src/`).
- Log work in the root `/ai/usage-log.md`, not in `AI-NOTES.md` (legacy).

## Stack facts
- Express 5 + TypeScript strict, **native ESM**: relative imports end in `.js`;
  `verbatimModuleSyntax` → use `import type` for types.
- `src/server.ts` is the only file with side effects (listen, signals).
  `createApp({ prisma })` in `src/app.ts` is pure wiring; routers are factories taking deps.
- Prisma 7 with `prisma-client` generator → `src/generated/prisma` (git-ignored).
  Datasource URL lives in `prisma.config.ts`, not `schema.prisma`. Client uses `@prisma/adapter-pg`.
- Env validated by zod in `src/config/env.ts`.
- Dev runner: tsx (no type-check). Build: tsc. Tests: Vitest + supertest. Lint: oxlint. Format: Prettier.

## Commands
`npm run dev | build | typecheck | test | test:e2e | lint | format | db:generate | db:migrate`
