<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# FoC frontend notes

- Follow the root [AGENTS.md](../AGENTS.md) (section 10): UI only, call services via `useApi()`
  through the gateway, pages under `src/app/<feature>/`, register navigation in
  `src/config/navigation.ts`.
- Use shadcn/ui components from `src/components/ui/` (Base UI flavour: `render={...}`, not `asChild`).
- Configuration comes from `readPublicConfig()` at request time; do not add `NEXT_PUBLIC_*` variables.
