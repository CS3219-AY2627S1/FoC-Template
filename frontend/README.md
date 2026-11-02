# frontend

The FoC web UI: Next.js 16 (App Router) + TypeScript + Tailwind CSS 4 + shadcn/ui.
It only renders UI and calls the backend services through the gateway. See the root
[AGENTS.md](../AGENTS.md) section 10 for conventions.

## Run

```bash
# Everything in containers (recommended): from the repo root
docker compose up --build            # UI at http://localhost:8080

# Hot-reload dev server against the containerised gateway/emulators
npm install
FOC_API_BASE_URL=http://localhost:8080 \
FOC_FIREBASE_AUTH_EMULATOR_URL=http://localhost:9099 \
npm run dev                          # http://localhost:3000
```

## Structure

```text
src/
├── app/                  # routes: app/<feature>/page.tsx
├── components/
│   ├── ui/               # shadcn/ui components (npx shadcn@latest add <name>)
│   ├── providers/        # config + auth context
│   └── <feature>/        # feature components
├── config/navigation.ts  # register your feature's nav entry here
├── hooks/use-api.ts      # authenticated fetch through the gateway
├── lib/                  # api client, firebase, runtime config
└── proxy.ts              # cloud: redirect direct visits to the gateway (FOC_PUBLIC_URL)
```

## Sign-in

- Locally: the Firebase Auth emulator. Create any account on the sign-in page.
- Cloud: the team Firebase project (`cs3219-p28-auth`), which enforces a password policy. The
  sign-up form checks the project's policy as you type (Firebase `validatePassword`).
- Health check for Docker and Cloud Run: `GET /health`. Paths ending in `z` are reserved by Cloud Run.

## Configuration

Read on the server at request time (`src/lib/runtime-config.ts`), so one image works in
every environment:

| Variable | Meaning |
| --- | --- |
| `FOC_ENVIRONMENT` | `local` / `staging` / `production` (shown as a badge outside production) |
| `FOC_API_BASE_URL` | gateway origin; empty = same origin |
| `FOC_FIREBASE_PROJECT_ID`, `FOC_FIREBASE_API_KEY`, `FOC_FIREBASE_AUTH_DOMAIN`, `FOC_FIREBASE_APP_ID` | Firebase web config |
| `FOC_FIREBASE_AUTH_EMULATOR_URL` | Auth emulator URL (local only) |
| `FOC_PUBLIC_URL` | Cloud only: the gateway URL; direct visits to the frontend's own URL redirect there |

## Order personal-list controls (CHANGE-094)

My Requests/My Errands use the existing gateway Order mine API with optional status, All statuses default and previous/next pages. Status change resets page 1 and discards old reads. Order lists and Credit data poll every 5 seconds while authenticated/visible. Courier accepted action says Abort errand and still calls cancel-accepted. Existing Base UI/design/auth infrastructure is reused. Tests: npm test, npm run lint, npm run typecheck. Normal build needs the existing Google Fonts downloads; Order verification is recorded in order-service/changes/CHANGE-094-order-ui-status-filters.md.

## Missing locations in saved orders (CHANGE-097)

Order lists show saved cards even when Supplier lookup reports missingIds, using the existing Location unavailable label for missing locations. Valid location names remain unchanged. Missing locations no longer leave My Requests, My Errands or Available Errands waiting indefinitely. This display fallback does not restore deleted/reset supplier data.


## Real Reporting integration (2026-10-29)

Requester reporting uses the authenticated reportable-Order list and atomic hold API. OPEN/terminal Orders cannot be reported. Admin Reports now calls /api/reports in every runtime mode, downloads evidence with a bearer token and uses stable command IDs for Order-coordinated resolution; 202 remains pending. It no longer uses reportApiMode to select sample data. Configure/enable both service sagas before resolving; Report backend flags remain default-off. See ../reporting-service/HANDOFF.md.

Report form (effective CHANGE-169): Order/Courier reports use the original active-order dropdown; Credits/General have no Order selector and submit without association. The red response-count badge and five-second visible/authenticated polling remain. Duplicate-report errors preserve the form. No new public runtime configuration is needed.
