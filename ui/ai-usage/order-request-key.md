By @JadeCheah

## Prompt

```
Can I check if the wiring for place request is implemented? there's no reaction, no api calls in the networks tab when I click on it.
```

```
available 10 credits, offer 3 credits, place request button is not opaqued, quite solid
```

- Tool: Claude Code (Claude Opus), 2026-11-06.
- AI found the cause: `crypto.randomUUID()` only exists on secure pages (HTTPS or
  localhost), so on the plain-http EKS link it threw before the request was sent.
- AI added a fallback that builds a v4 UUID with `crypto.getRandomValues`
  (`newRequestKey()` in `pages/CreateRequestPage.tsx`).
- I verified the UI build, and that Place Request sends the request on the EKS link.
