# Supplier frontend design sources

The Figma file is a visual and workflow reference for the responsive Supplier UI. It was produced quickly, so implementation may improve information hierarchy and task flow while preserving its overall Friend on Campus visual language.

## Canonical references

- [Desktop screens and flows](https://www.figma.com/design/C0Y1GNnZrxvPX36oQemnff/Friend-on-Campus-%E2%80%94-Impeccable-Redesign?node-id=3-3&t=itVba3jHlA5ZxVp0-1)
  - Supplier L01 Location administration: node `6:6731`
  - Supplier L02 Create location: node `6:6795`
  - Supplier L03 Edit location and validation: node `6:6855`
  - Supplier L04 Delete confirmation: node `6:6925`
  - Supplier L05 Delete success: node `6:6965`
- [Mobile Supplier starting point](https://www.figma.com/design/C0Y1GNnZrxvPX36oQemnff/Friend-on-Campus-%E2%80%94-Impeccable-Redesign?node-id=7-1421&t=itVba3jHlA5ZxVp0-1): node `7:1421`
- [Shared components section](https://www.figma.com/design/C0Y1GNnZrxvPX36oQemnff/Friend-on-Campus-%E2%80%94-Impeccable-Redesign?node-id=4-198&t=itVba3jHlA5ZxVp0-1): node `4:198`
- [Public directory reference](https://www.figma.com/design/C0Y1GNnZrxvPX36oQemnff/Friend-on-Campus-%E2%80%94-Impeccable-Redesign?node-id=6-1420&t=itVba3jHlA5ZxVp0-1): R02 node `6:1420`

The shared-components link currently targets the section heading. When implementing a component, inspect the component instances used by the target screen and then locate the corresponding component beneath that section.

## API references

With the complete stack running through the gateway:

- Swagger UI: <http://localhost:8088/swagger-ui/index.html>
- OpenAPI JSON: <http://localhost:8088/docs/supplier/openapi.json>
- Supplier API: <http://localhost:8088/api/suppliers>

The backend contract takes precedence over example data and incomplete form fields in Figma. In particular, the real Supplier model includes building information, optional location details, operating hours, image URL, status, timestamps, and optimistic-lock versioning.

## Current design vocabulary

- Typeface: Public Sans, bundled locally.
- Canvas: `#f5f7f5`; surface: white; ink: `#20332d`; muted: `#57655f`; action: `#23654e`; border: `#d4ddd7`.
- Primary spacing steps: 8, 12, 16, 24, 32, and 56 pixels.
- Primary card radius: 12 pixels.
- Mobile reference width: 375 pixels; desktop reference width: 1280 pixels.

Use the CSS custom properties in `src/styles/tokens.css` rather than copying raw values throughout components.

## Task 13 directory adaptations

The public Supplier experience deliberately adapts R02 rather than reproducing its Order
Service workflow:

- “Choose a pickup location” becomes a standalone “Campus locations” directory, with no
  selection action.
- Search is joined by API-backed category and building filters, safe sorting, result totals,
  and pagination because the real Supplier API supports those operations.
- The directory heading is a left-aligned text block without the decorative storefront icon or
  descriptive line, leaving the filters and live result count to explain the directory contents.
- Cards become a responsive one-, two-, or three-column grid and include operating hours and
  directions when available.
- The latest supplied card reference is adapted into category-tinted Lucide icon blocks, compact
  metadata rows and one consistent detail action. Colours support the visible category text and
  do not imply availability or other state. The category colour stays inside the icon and badge;
  Supplier cards use a neutral outline without a coloured top edge.
- A separate detail route shows coordinates and optional images; administrative version and
  timestamp fields stay hidden.
- Unimplemented global navigation and the Admin route are not linked from the public shell.
  The Admin scaffold remains directly reachable for later authenticated work.
- The exact Figma bag and arrow vectors are committed under `src/assets/`; no expiring Figma
  asset URLs are used at runtime.
- Supplier details use a local, Figma-aligned campus storefront illustration when a photo is
  missing, loading, or unavailable. This preserves the image layout without implying that a
  generic photograph depicts the real location.
- Directory cards and the detail hero share the same category presentation. Real Supplier photos
  remain confined to the detail route, with the existing local illustration as the fallback; no
  stock or mock supplier imagery is introduced.

## Task 15 administration adaptations

The administrative UI follows Supplier screens L01–L05 while adapting the hurried draft to
the complete API and a safer responsive workflow:

- L01's location cards become a readable table on desktop and management cards on mobile;
  both show status and expose the same edit, activate/deactivate, and delete actions.
- Search, category, building, status, sorting, and pagination use the administrative API and
  remain shareable through URL parameters.
- L02/L03 use one reusable form containing every real Supplier field. Status is selectable on
  creation and remains a separate version-checked action during editing.
- L02/L03 also provide one explicit image-source choice: no photo, an external HTTPS/HTTP URL,
  or a JPEG/PNG/WebP upload. Uploaded images remain confined to Supplier details, use the same
  placeholder and error behavior, and never make the private object-store URL public.
- L04/L05 are implemented as focused confirmation dialogs and accessible in-page success
  feedback instead of separate destructive-action routes. This keeps context on small screens
  and makes cancellation unambiguous.
- Deletion explicitly recommends `INACTIVE` for ordinary removal. `409` conflicts require a
  deliberate latest-record reload and are never silently retried.
- The route remains absent from ordinary-user navigation. The shared User session controls the
  frontend experience, while Supplier Service's `ADMIN` JWT checks remain authoritative.

## Shared-origin integration

Production User and Supplier pages are presented through gateway port `8088`. Supplier assets use
`/supplier-assets/**`, preventing collisions with User assets under `/user-assets/**`. The Supplier
SPA may read the validated shared User session for navigation and bearer forwarding, but this is a
user-experience aid only; designs must never imply that hiding an admin control replaces backend
authorization.
