# web-client

Rules for anyone, person or coding agent, working in `web-client/`. See `../AGENTS.md` for the repository-wide rules (Git, secrets, style). Part A is enough to work correctly. Part B is the reference you look things up in.

The web client is a React app plus the gateway the browser talks to. It presents what the services answer and owns no domain rules.

# Part A: Quick start

## The rules

1. **Work only in your own folders** (table below). Shared files change only through a pull request that the platform owner reviews.
2. **Data comes only from `src/api/<service>/`**, through hooks that call `request()` from `@/lib/http`. Never call `fetch` in a feature, never write a host, port or URL of a service.
3. **Every view with server data goes through `QueryView`**, which shows the loading, empty and error states (N5.2, N5.3).
4. **No domain rules in the client.** No validation, permission check, state transition or credit calculation. Send what the user entered and show the reason the service gives (N5.4). Showing or hiding a control by a field the service returns (a "Deactivate" button only for `status: 'Active'`) is fine, because the service still decides. If an endpoint is missing, ask the service owner instead of computing the value here.
5. **Only theme classes and `ds-*` patterns.** No arbitrary values (`p-[13px]`), no raw colours or lengths. Details in "Design system" below and in `DESIGN.md`.
6. **Mobile first from 320px, no horizontal scrolling up to 1920px** (N5.1). The hard rules:
   - Every `grid` gets `grid-cols-N`. A plain stack is `grid grid-cols-1`.
   - Every flex child that holds text gets `min-w-0`.
   - Never add `whitespace-nowrap`, `truncate` or a fixed width to content. Badges and segmented options are short labels and handle this themselves.
   - Names, e-mail addresses and anything a user typed get `wrap-anywhere`, so one long word cannot widen the page.
   - A segmented control holds at most 4 short options.
   - In development a red outline and a console warning mark anything that sticks out. It must stay silent at 320 and 393px.
7. **Run the checks** in "Before you finish" before you open a pull request.

## Your files

| Service | Your folders and files | Owner |
| --- | --- | --- |
| user | `src/api/user/`, `src/features/user/`, `nginx/templates/routes/user.conf.template` | Felix |
| supplier | `src/api/supplier/`, `src/features/supplier/`, `nginx/templates/routes/supplier.conf.template` | Viet Quang |
| order | `src/api/order/`, `src/features/order/`, `nginx/templates/routes/order.conf.template` | order-service team |
| credit | `src/api/credit/`, `src/features/credit/`, `nginx/templates/routes/credit.conf.template` | credit-service team |
| platform | `src/app/`, `src/lib/`, `src/components/`, `src/styles/`, `nginx/templates/default.conf.template`, `Dockerfile`, every config file, `package.json`, this file | Felix |

Import another service's data through `@/api/<service>/`. Never change another team's folders, and never import from another feature.

## Recipe: build your pages

1. Find your row above. Every page you own already exists as a placeholder that names its file, and it is already wired into routing and navigation.
2. **Gateway** (order and credit only, user and supplier exist): copy `nginx/templates/routes/user.conf.template` to `<service>.conf.template` and follow "Gateway route for a new service" in Part B. Commit it on its own; the platform owner reviews it.
3. **Types** in `src/api/<service>/types.ts`: copy the response shapes from your service's README or route code, never from memory. If neither shows a response, ask the service owner. A response you do not use is `request<void>`. Use string unions, not `enum`. Lists are `Paginated<T>` from `@/lib/http`.
4. **Hooks** in `src/api/<service>/<resource>.ts`: `use<Things>`, `use<Thing>`, `use<Verb><Thing>`. Every query key starts with the service name and holds all filters. Every mutation invalidates the keys it changes. Copy Template 1.
5. **Pages** in `src/features/<service>/pages/`: replace the placeholder file. Always wrap the page in `Page`, show server data with `QueryView` (Template 2), build forms like Template 3. Components only your feature uses go to `src/features/<service>/components/`. A finished feature to look at: `src/features/user/` with `src/api/user/`.
6. **Routes** live in `src/features/<service>/routes.ts`. Registered paths are frozen, because navigation and other features link to them. A new page goes into the right group there (`guest`, `app` or `admin`), path without a leading slash.
7. **Navigation** is in `src/app/navigation.ts` and changes only by pull request. Never link to `/admin` from the student app.
8. **Something missing?** A missing endpoint is a question for the service owner. A missing token, pattern or shared component is a pull request to the platform owner. When unsure, stop and ask.
9. Run "Before you finish", then open the pull request with the Linear issue (`REL-<n>`) and the requirement id.

## Before you finish

In `web-client/`, with Node 24 or newer (`npm ci` once after a pull, to install exactly the locked packages):

```bash
npm run build
npm run lint
grep -rnE '[a-z0-9]-\[' src
grep -rnE '(^|[^[:alnum:]_])fetch\(' src/features
```

Both commands pass, and both greps print nothing. `npm run lint` also enforces the import rules.

From the repository root, `docker compose up --build --wait`, then check on http://localhost:8080:

- [ ] No horizontal scrolling at 320, 393, 768, 1024, 1440 and 1920px, and no red outline in `npm run dev`.
- [ ] Every page you touched works with the keyboard alone, with a visible focus ring.
- [ ] You have seen the loading, empty and error state of every list and detail view. `docker compose stop <service>` shows the error state.
- [ ] Every navigation entry still opens its page.
- [ ] Your placeholder is gone, `.env.example` lists any new variable, the pull request template is filled in.

# Part B: Reference

## How a request travels

```
Browser  ──  /api/supplier/suppliers?q=coffee   (same origin, session cookie goes along)
   │
web-client container (nginx, port 8080)
   ├─ /api/<service>/<allowed paths>   strips /api/<service>, forwards to ${<SERVICE>_SERVICE_URL}
   ├─ any other /api/...               404 as JSON, so /internal/* is never reachable
   ├─ service down                     503 as JSON (SERVICE_UNAVAILABLE)
   └─ everything else                  index.html, React Router takes over
```

The browser only ever sees relative paths, so there is no CORS and the HttpOnly session cookie stays first-party. One image runs locally and in the cloud because the service addresses are environment variables read when the container starts (N6.2). Why it is built this way: `../docs/decisions/0002-web-client-gateway.md`.

Each service has one short name, used everywhere:

| Short name | URL prefix | Folders | Gateway file | Query keys | Variable |
| --- | --- | --- | --- | --- | --- |
| `user` | `/api/user/` | `src/api/user/`, `src/features/user/` | `routes/user.conf.template` | `['user', ...]` | `USER_SERVICE_URL` |
| `supplier` | `/api/supplier/` | `src/api/supplier/`, `src/features/supplier/` | `routes/supplier.conf.template` | `['supplier', ...]` | `SUPPLIER_SERVICE_URL` |
| `order` | `/api/order/` | `src/api/order/`, `src/features/order/` | `routes/order.conf.template` | `['order', ...]` | `ORDER_SERVICE_URL` |
| `credit` | `/api/credit/` | `src/api/credit/`, `src/features/credit/` | `routes/credit.conf.template` | `['credit', ...]` | `CREDIT_SERVICE_URL` |

Never put a service URL into a `VITE_*` variable, never read cookies, never keep auth or user data in `localStorage` or `sessionStorage`.

## Folders and import rules

```
src/
├── app/          router, shells, guards, navigation, error pages     platform
├── lib/          request(), ApiError, Paginated, FeatureRoutes, format helpers
├── components/   Page, QueryView, states, fields, Pagination        shared UI
├── api/<svc>/    types and data hooks of one service
├── features/<svc>/
│   ├── routes.ts        the feature's pages, by group
│   ├── pages/           one file per page
│   └── components/      parts only this feature uses
└── styles/       design tokens and patterns                          platform
```

| Area | May import |
| --- | --- |
| `lib` | nothing else from `src` |
| `components` | `@/lib` |
| `api/<svc>` | `@/lib`, its own folder with `./` |
| `features/<svc>` | `@/lib`, `@/components`, any `@/api/<svc>`, its own folder with relative paths. Never another feature, never `src/app`. |
| `app` | everything |

Across areas always import with `@/...`. Inside your area use relative paths. There are no barrel files (`index.ts`). Keep a feature to one folder level (`pages/`, `components/`), and keep `lib`, `components` and `api/<svc>` flat. `npm run lint` fails on a forbidden import and says what to do instead.

Two features that need to work together connect through the URL, never through imports. Example: "Post an errand" (order) links to `/suppliers?select=1`, and the supplier page sends the user back with `?supplier=<id>`.

## Templates

Copy and adapt these. They were run against the real supplier-service. For the same patterns in a finished feature, read `src/features/user/` and `src/api/user/`:

| You need | Look at |
| --- | --- |
| a form that sends, shows field errors and keeps the input | `pages/SignupPage.tsx`, `components/EditProfileForm.tsx` |
| a mutation that updates the session or other cached data | `api/user/auth.ts` (`useLogin`), `api/user/account.ts` (`useUpdateProfile`) |
| a server reason with extra details, like attempts left | `pages/VerifyPage.tsx` |
| a paged list with the page in the URL, table from `md`, cards below | `pages/AdminStudentsPage.tsx` |
| status values shown as badges | `components/AccountStateBadge.tsx` |
| a form that returns to an overview, which shows a notice once | `components/EditProfileForm.tsx`, `pages/ProfilePage.tsx` |
| a detail page whose back button returns to the list it was opened from | `pages/AdminStudentDetailPage.tsx`, `components/BackButton.tsx` |
| an action that needs a reason and shows the service's refusal | `components/AccountStateForm.tsx` |

### Template 1: API module

`src/api/supplier/types.ts`:

```ts
// Mirrors the supplier JSON in supplier-service/README.md, section "API". Change both together.

export type SupplierStatus = 'Active' | 'Inactive'

export type Supplier = {
  id: string
  name: string
  type: string
  zone: string
  building: string
  address: string
  status: SupplierStatus
  availability: { open: boolean; closesAt: string | null; nextOpensAt: string | null }
}

export type SupplierFilters = {
  q?: string
  zone?: string
  page: number
}

export type SupplierChanges = {
  name?: string
  zone?: string
}
```

`src/api/supplier/suppliers.ts`:

```ts
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { request } from '@/lib/http'
import type { Paginated } from '@/lib/http'
import type { Supplier, SupplierChanges, SupplierFilters } from './types'

// Every key starts with the service name, and a list key holds all of its filters.
export const supplierKeys = {
  all: ['supplier'] as const,
  list: (filters: SupplierFilters) => ['supplier', 'list', filters] as const,
  detail: (id: string) => ['supplier', 'detail', id] as const,
}

export function useSuppliers(filters: SupplierFilters) {
  return useQuery({
    queryKey: supplierKeys.list(filters),
    queryFn: ({ signal }) => request<Paginated<Supplier>>('supplier', '/suppliers', { query: filters, signal }),
    // Keeps the old page on screen while the next one loads, instead of a skeleton.
    placeholderData: keepPreviousData,
  })
}

export function useSupplier(id: string) {
  return useQuery({
    queryKey: supplierKeys.detail(id),
    queryFn: ({ signal }) => request<Supplier>('supplier', `/suppliers/${id}`, { signal }),
  })
}

export function useUpdateSupplier(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (changes: SupplierChanges) =>
      request<Supplier>('supplier', `/suppliers/${id}`, { method: 'PATCH', body: changes }),
    // Lists and details may all show the old values, so everything of this service reloads.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: supplierKeys.all }),
  })
}
```

### Template 2: list page with filters in the URL

`src/features/supplier/pages/SuppliersPage.tsx`:

```tsx
import { useState } from 'react'
import type { SubmitEvent } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useSuppliers } from '@/api/supplier/suppliers'
import { EmptyState } from '@/components/EmptyState'
import { Page } from '@/components/Page'
import { Pagination } from '@/components/Pagination'
import { QueryView } from '@/components/QueryView'
import { SelectField } from '@/components/SelectField'
import { TextField } from '@/components/TextField'

const zoneOptions = [
  { value: '', label: 'All zones' },
  { value: 'Central', label: 'Central' },
  { value: 'Computing', label: 'Computing' },
]

export function SuppliersPage() {
  // Filters and page live in the URL, so reload, back and a shared link keep them.
  const [searchParams, setSearchParams] = useSearchParams()
  const q = searchParams.get('q') ?? ''
  const zone = searchParams.get('zone') ?? ''
  // The address bar can hold anything. What is not a page number from 1 shows page 1.
  const page = Math.max(1, Math.trunc(Number(searchParams.get('page'))) || 1)
  const suppliers = useSuppliers({ q: q || undefined, zone: zone || undefined, page })

  // The box holds what is typed until the search runs. When back, forward or "Clear filters"
  // change q in the URL, the box follows.
  const [search, setSearch] = useState(q)
  const [shownQ, setShownQ] = useState(q)
  if (shownQ !== q) {
    setShownQ(q)
    setSearch(q)
  }

  // A new filter always starts again at page 1.
  function setFilter(name: 'q' | 'zone', value: string) {
    setSearchParams((params) => {
      if (value) params.set(name, value)
      else params.delete(name)
      params.delete('page')
      return params
    })
  }

  function handleSearch(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    setFilter('q', search.trim())
  }

  function setPage(next: number) {
    setSearchParams((params) => {
      params.set('page', String(next))
      return params
    })
  }

  return (
    <Page title="Suppliers">
      <form role="search" noValidate onSubmit={handleSearch} className="grid grid-cols-1 gap-4 md:grid-cols-3 md:items-end">
        <TextField label="Search" name="q" type="search" value={search} onChange={setSearch} />
        <SelectField label="Zone" name="zone" value={zone} onChange={(value) => setFilter('zone', value)} options={zoneOptions} />
        <button type="submit" className="ds-btn ds-btn--glass">
          Search
        </button>
      </form>
      <QueryView
        query={suppliers}
        loadingLabel="Loading suppliers"
        isEmpty={(result) => result.items.length === 0}
        empty={
          <EmptyState
            title={q || zone ? 'No suppliers match these filters' : 'No suppliers yet'}
            action={
              <button type="button" className="ds-btn ds-btn--glass" onClick={() => setSearchParams({})}>
                Clear filters
              </button>
            }
          />
        }
      >
        {(result) => (
          <>
            <ul className="ds-surface ds-rows">
              {result.items.map((supplier) => (
                <li key={supplier.id} className="flex items-center justify-between gap-3 p-4">
                  <Link to={`/suppliers/${supplier.id}`} className="min-w-0 wrap-anywhere">
                    {supplier.name}
                  </Link>
                  <span className={supplier.availability.open ? 'ds-badge ds-badge--success' : 'ds-badge ds-badge--neutral'}>
                    {supplier.availability.open ? 'Open' : 'Closed'}
                  </span>
                </li>
              ))}
            </ul>
            <Pagination page={result.page} pageSize={result.pageSize} total={result.total} onPageChange={setPage} />
          </>
        )}
      </QueryView>
    </Page>
  )
}
```

A detail page is the same without filters: `const { id = '' } = useParams()`, then `useSupplier(id)` inside `QueryView`, and `<Page title={supplier.data?.name ?? 'Supplier'}>`.

### Template 3: form

`src/features/supplier/components/EditSupplierForm.tsx`:

```tsx
import { useState } from 'react'
import type { SubmitEvent } from 'react'
import { useUpdateSupplier } from '@/api/supplier/suppliers'
import type { Supplier } from '@/api/supplier/types'
import { FormError } from '@/components/FormError'
import { Notice } from '@/components/Notice'
import { SubmitButton } from '@/components/SubmitButton'
import { TextField } from '@/components/TextField'
import { fieldErrorsOf } from '@/lib/http'

type EditSupplierFormProps = {
  supplier: Supplier
}

export function EditSupplierForm({ supplier }: EditSupplierFormProps) {
  // Controlled fields: a refused request leaves every value the user typed in place (N5.4).
  const [values, setValues] = useState({ name: supplier.name, zone: supplier.zone })
  const update = useUpdateSupplier(supplier.id)
  const fieldErrors = fieldErrorsOf(update.error)

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    update.mutate(values)
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="ds-surface grid grid-cols-1 gap-4 p-5">
      <FormError error={update.error} fields={['name', 'zone']} />
      {update.isSuccess && <Notice tone="success" role="status" title="Saved" />}
      <TextField
        label="Name"
        name="name"
        value={values.name}
        onChange={(name) => setValues({ ...values, name })}
        errors={fieldErrors.name}
      />
      <TextField
        label="Zone"
        name="zone"
        value={values.zone}
        onChange={(zone) => setValues({ ...values, zone })}
        errors={fieldErrors.zone}
      />
      <SubmitButton pending={update.isPending} pendingLabel="Saving…">
        Save changes
      </SubmitButton>
    </form>
  )
}
```

## Data

- Load data only with React Query hooks from `src/api/<service>/`. Never load in `useEffect`.
- A query key starts with the service name and contains every filter and the page: `['supplier', 'list', filters]`.
- After a mutation, invalidate what it changed. Invalidating the service prefix (`['supplier']`) is fine.
- Filters and the page belong in the URL (`useSearchParams`), and a new filter resets the page to 1.
- Show dates and times with `formatDate`, `formatTime` or `formatDateTime` from `@/lib/format`. They use campus time (Asia/Singapore) on every device.
- Retries are set centrally: network errors and 5xx retry twice, 4xx and mutations never.
- A 401 on any query ends the session in the client and sends the user to the login. You do not handle it.

`request<T>(service, path, { method, body, query, signal })` builds `/api/<service><path>`, drops `undefined` query values and throws an `ApiError` with `status` (0 for no connection), `code`, `message` (the service's own text) and `fieldErrors`. Pass the `signal` React Query gives you, so leaving a page cancels its requests.

## Forms

- Controlled fields with `useState`, and `<form noValidate onSubmit={handleSubmit}>` with `event.preventDefault()` first.
- Never `<form action={...}>`. React resets uncontrolled fields after an action, so a refused request would wipe what the user typed.
- The event type is `SubmitEvent<HTMLFormElement>` from `react`. `FormEvent` is deprecated.
- `fieldErrorsOf(mutation.error)` gives the messages per field. Pass them to `TextField` or `SelectField` as `errors`. `FormError` shows everything else, so give it the list of fields the form already shows.
- `SubmitButton` refuses a second click or Enter while the request runs, so it cannot send twice. It uses `aria-disabled`, not `disabled`, so keyboard focus stays on it when the service refuses the form.
- No client-side validation. `type`, `autoComplete` and `inputMode` are hints for the keyboard, not checks.
- A mutation outside a form (log out, delete, grant a role) shows its error with `FormError` next to its button, like `src/features/user/components/LogoutButton.tsx`.
- A button in every row of a list is a small component in `components/` with its own mutation hook, so each row shows its own pending state and its own error.
- If an action removes the control that had keyboard focus, move the focus to something nearby, for example the row's name with `tabIndex={-1}`. Otherwise keyboard users are thrown back to the top of the page.
- There is no confirmation dialog yet (`DESIGN.md`, "Open"). Ask the platform owner before you build one.

## Loading, empty and error states

`QueryView` is required for every view with server data:

- Data loaded: renders `children(data)`. If a refresh fails later, the data stays and a notice appears above it.
- No data yet and the request failed: `ErrorState` with the service's message and "Try again" where retrying can help.
- Offline: an offline message, and the request runs again when the connection is back.
- Still loading: `LoadingState` with the `loadingLabel` for screen readers.
- `isEmpty(data)` true: shows `empty`, which is an `EmptyState`. It names what is empty and has an action (N5.3): "Clear filters" when a filter is active, otherwise the next useful step, such as a link to create the first one.

## Session and access

- `useSession()` from `@/api/user/session` is the only source of who is logged in: `undefined` while checking, `null` for a guest, otherwise a `PublicUser` with `roles`. On a page in the `app` or `admin` group, `useCurrentUser()` returns that `PublicUser` directly, since the guard already made sure someone is logged in.
- The guards in `src/app/guards/` decide which pages show. The admin console under `/admin` shows only for the `administrator` role, and everyone else sees "Administrator access required".
- That is display only. Every service checks every request itself, so the client never decides access and never hides a check behind a role test.
- Log out with `useLogout()` or `LogoutButton`. It reloads the page, which clears every cached answer.

## Routing and navigation

A feature registers its pages in `routes.ts`:

```ts
import type { FeatureRoutes } from '@/lib/routing'
import { SupplierDetailPage } from './pages/SupplierDetailPage'
import { SuppliersPage } from './pages/SuppliersPage'

export const supplierRoutes: FeatureRoutes = {
  app: [
    { path: 'suppliers', Component: SuppliersPage },
    { path: 'suppliers/:id', Component: SupplierDetailPage },
  ],
}
```

| Group | Who sees it | Layout | Example path |
| --- | --- | --- | --- |
| `guest` | logged-out visitors only | narrow centred column. Only the user feature has these pages; they use its `AuthCard` instead of `Page`. | `login` becomes `/login` |
| `app` | any logged-in account | student shell, tab bar on phones | `wallet` becomes `/wallet` |
| `admin` | administrators | admin console, menu on phones | `orders` becomes `/admin/orders` |

| Thing | Name |
| --- | --- |
| list page | `<Things>Page`, e.g. `SuppliersPage` |
| detail page | `<Thing>DetailPage`, e.g. `SupplierDetailPage` |
| admin page | `Admin<Things>Page`, e.g. `AdminSuppliersPage` |
| hooks | `use<Things>`, `use<Thing>`, `use<Verb><Thing>` |
| URL parameter | `useParams()` from `react-router` |

Navigation entries live in `src/app/navigation.ts` and each one must match a registered path.

## Components

All in `src/components/`. `npm run dev` and http://localhost:5173/_dev/ui shows each of them in every state.

| Component | Use it for |
| --- | --- |
| `Page` | every page: `title` (also the tab title), optional `subtitle` and `actions`. It renders the one `h1`. |
| `QueryView` | every view with server data, see above |
| `LoadingState`, `EmptyState`, `ErrorState` | the three states, usually through `QueryView` |
| `Notice` | an info, success or danger message box |
| `FormError` | a refused request, without repeating field messages |
| `TextField`, `SelectField` | labelled inputs with hint and server errors |
| `TextAreaField` | longer text such as a reason, with an optional character count that refuses nothing |
| `SubmitButton` | the primary button of a form, with a pending label |
| `Pagination` | page buttons for a `Paginated` list |
| `PlaceholderPage` | the "not built yet" page. Delete its use when your page is real. |

Buttons, links styled as buttons, badges, surfaces and amounts are classes, not components: `<button className="ds-btn ds-btn--primary">`, `<Link className="ds-btn ds-btn--glass">`, `<span className="ds-badge ds-badge--info">`. Icons come from `lucide-react`, always with `aria-hidden="true"` next to a visible label.

## Design system

Read `DESIGN.md` before writing any UI, and open `design-system.html` in a browser to see the whole design language. The rules that matter most:

1. **Never write a raw colour or length.** No hex, no `rgb()`, no px in a component. Use a Tailwind class from the theme (`bg-surface`, `text-muted`, `rounded-card`, `p-3`) or a pattern class from `patterns.css`.
2. **Tailwind's default palette and scales are deliberately removed.** `theme.css` sets `--color-*: initial` and the same for radius, shadow, text, font, tracking, leading, ease, blur and breakpoint. So `bg-red-500` and `rounded-lg` do not compile. **This is intended, not a bug.** Do not remove those `initial` lines to make a class work.
3. **No arbitrary values.** `bg-[#ff5a3c]` and `p-[13px]` defeat the point.
4. **Missing token?** Add it to `tokens.semantic.css`, referencing a primitive, and mention it in the pull request. Never inline the value instead.
5. **Components never reference a primitive.** `--ds-coral-600` is not for components, `--ds-color-accent` is.
6. **Buttons and fields are 12px rounded rectangles, not pills.** Pills are only for chips, badges, segmented controls, tabs and nav bars. `.ds-btn--primary` is the one main action of a view, `.ds-btn--glass` the white secondary button.
7. **Write full class names.** Tailwind only finds classes it can read in the source, so `'ds-badge--' + tone` never works. Map values to complete class strings instead, like `Notice.tsx` does.

Available pattern classes, so you do not reinvent them:

```
surfaces  .ds-surface  .ds-surface--chrome  .ds-surface--sunken
          .ds-surface--panel  .ds-hairline  .ds-rows
buttons   .ds-btn  .ds-btn--primary  .ds-btn--glass  .ds-btn--text
          .ds-btn--icon
badges    .ds-badge  .ds-badge--danger  .ds-badge--info
          .ds-badge--success  .ds-badge--neutral
forms     .ds-label  .ds-field-label  .ds-field  .ds-field-error
          .ds-select  .ds-segmented
feedback  .ds-notice  .ds-notice--info  .ds-notice--success  .ds-notice--danger
          .ds-skeleton
numbers   .ds-num  .ds-stat-value  .ds-stat-unit  .ds-amount
          .ds-amount--out  .ds-amount--in
shell     .ds-nav-item  .ds-tabbar  .ds-tabbar-item
other     .ds-placeholder  .ds-bar
```

A button always carries `.ds-btn` plus one variant, for example `className="ds-btn ds-btn--primary"`. Same for badges, notices and amounts.

Extra utilities from `theme.css`: `glass`, `glass-soft`, `bg-accent-gradient`, `bg-backdrop-mesh`, `tap-target`, `nums-tabular`, `max-w-layout`.

Import order in `src/index.css` is deliberate. `base.css` and `patterns.css` are imported into cascade layers so Tailwind utilities can still override them. Do not flatten those imports.

House rules on top of N5:

- Interactive targets at least 44x44px below the `md` breakpoint. Icon-only controls use `.ds-btn--icon` or `tap-target`.
- Body text at least 16px. Anything smaller is a label, never prose.
- Build mobile first and add `md:` and `lg:`, never `max-*` downward.
- Keyboard focus stays visible. Do not remove an outline without replacing it.
- Wide content scrolls inside its own container. A table goes into `<div className="overflow-x-auto">` from `md` up, and below `md` the same data is a list of cards.

## Layout

- The shells come from `src/app/layouts/`. From `lg` (1024px) there is a sidebar; below it the student app has a floating tab bar and the admin console a menu at the top. Your page only renders its content inside `Page`.
- `Page` puts the title (and optional subtitle and actions) at the top of the content and centres everything at `max-w-layout` with `px-4 md:px-8`. Do not add another outer container or a second title.
- Use `grid grid-cols-1 gap-4` for stacks and add columns from `md:` or `lg:`.

## TypeScript and React

- Named exports, one component per file, the file named after the component.
- `import type` for types. No `any`, no `@ts-ignore`, no `enum`, no constructor parameter properties.
- No `dangerouslySetInnerHTML`.
- Set a tab title with one string: `<title>{`${name} · Relay`}</title>`. `Page` does that for you.
- UI text and docs are in English.

## Gateway route for a new service

For order and credit, once the service has an API:

1. Copy `nginx/templates/routes/user.conf.template` to `nginx/templates/routes/<service>.conf.template`:

   ```nginx
   # Routes for the order-service. Only the paths below are reachable from the browser.
   location ~ ^/api/order/(orders|disputes)(/|$) {
     set $upstream ${ORDER_SERVICE_URL};
     rewrite ^/api/order(/.*)$ $1 break;
     proxy_pass $upstream;
   }
   ```

   List only the top-level paths the browser needs. Never `internal` or `health`.
2. Add the variable to the `web-client` service in `../compose.yaml`, for example `ORDER_SERVICE_URL: http://order-service:3000`, and to `../.env.example`. A route file without its variable stops nginx from starting, on purpose. The service itself has to be on the `edge` network in `../compose.yaml`, otherwise nginx cannot find it and answers 503.
3. `docker compose up --build -d web-client`, then check that `curl -i http://localhost:8080/api/order/orders` reaches your service and `curl -i http://localhost:8080/api/order/internal/x` answers 404.
4. Commit these shared files on their own and ask the platform owner for review.

## Do and don't

| Do | Don't |
| --- | --- |
| `request('supplier', '/suppliers')` in `src/api/supplier/` | `fetch('http://localhost:3002/suppliers')` anywhere |
| show `error.message` from the service | write your own reason why a request failed |
| `QueryView` with `isEmpty` and an `EmptyState` with an action | an empty list with no message |
| filters in the URL | filters only in `useState` |
| `grid grid-cols-1 gap-4 md:grid-cols-2` | `grid gap-4`, `w-[300px]`, `whitespace-nowrap` |
| link to `/suppliers?select=1` | import from `@/features/supplier` |
| ask the service owner for a missing endpoint | compute totals, states or permissions in the client |
| a pull request for a new token or shared component | edit `src/components` or `src/styles` in your feature branch |

When something does not fit these rules, stop and ask the owner of the folder instead of working around it.
