# Order frontend

- Apply the root [product design contract](../../design.md) for the shared shell, foundations and
  cross-service journeys. Order requirements remain authoritative for errand behavior.
- Design source and API adaptations: [docs/design-source.md](docs/design-source.md). The Order
  README and running OpenAPI contract define fields and behaviour; Figma example data does not.
- React + TanStack Query + react-router, same tooling as the Credit frontend. Reuse
  `src/api/orderApi.ts`, `src/components/` and the CSS tokens in `src/styles.css`.
- The UI reuses the shared-origin session (`sessionStorage["foc.user-session"]`). Role checks in the
  UI are for navigation only; the backend authorises every action.
- Run `npm run lint`, `npm run typecheck`, `npm test` and `npm run build` here. Check flows at 375 px
  and desktop, keyboard focus, and error states.
