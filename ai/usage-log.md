# AI Usage Log

## Frontend Implementation
Author: Brenda Tan Kai Xin
Tool: Cursor
Model: GPT-5.6 Sol Medium

## Supplier listing
Date: 2026-09-18
Time: 11:20 AM SGT
Tool: Cursor
Model: GPT-5.6 Sol Medium

Exact prompt:
> Continue with only the next small frontend step.
> Do not change backend APIs, architecture, database schemas, authentication, routing, or authorization.
> Please:
> Remove the default Vite demo UI from App.tsx.
> Remove only the Vite-demo-specific CSS that is no longer needed.
> Create:
> src/pages/SupplierListPage.tsx
> Make App.tsx render SupplierListPage.
> Use Material UI.
> The page should currently contain only:
> heading: Suppliers
> search input with placeholder Search suppliers
> space for future Filter and Sort controls
> a clean content area for supplier results
> Make it responsive for mobile and desktop.
> Do NOT connect to any backend yet.
> Do NOT create mock API endpoints.
> Do NOT add authentication or routing yet.
> Keep the implementation simple because I am a beginner.
> Before editing, tell me exactly which files you plan to change/create. Then make the changes.
> Afterward, explain every changed file and the important React/MUI concepts used.

Key response:
Removed the Vite demo UI and created a beginner-friendly Material UI supplier list page with heading, search input, reserved filter/sort space, and a results area.

Files affected:
- frontend/src/App.tsx
- frontend/src/App.css
- frontend/src/index.css
- frontend/src/pages/SupplierListPage.tsx

Author review:
The output was reviewed and tested, and follow-up instructions were given where changes were needed.

## Supplier card
Date: 2026-09-18
Time: 11:57 AM SGT
Tool: Cursor
Model: GPT-5.6 Sol Medium

Exact prompt:
> Continue locally with only the next small frontend step.
> Do not change backend APIs, architecture, database schemas, authentication, routing, or authorization.
> Please create:
> src/components/SupplierCard.tsx
> The component should display:
> supplier name
> supplier type
> location
> operating hours if available
> a View Details button
> Use React + TypeScript + Material UI.
> Then update src/pages/SupplierListPage.tsx to temporarily show exactly ONE sample supplier for UI development:
> Name: Cool Spot
> Type: Food
> Location: COM2
> Hours: Daily 7:30am - 7:30pm
> Keep the sample data local in the frontend only. Do not create mock APIs or backend logic.
> Make the card responsive on mobile and desktop.
> Keep the implementation simple for a React beginner.
> Before editing, tell me which files you will create/change.
> After editing, explain the important code.

Key response:
Created SupplierCard and rendered one local sample supplier on the list page.

Files affected:
- frontend/src/components/SupplierCard.tsx
- frontend/src/pages/SupplierListPage.tsx

Author review:
The output was reviewed and tested, and follow-up instructions were given where changes were needed.

## Search, filter, sort and pagination
Date: 2026-09-18
Time: 2:19 PM SGT
Tool: Cursor
Model: GPT-5.6 Sol Medium

Exact prompt:
> Continue with only the next small frontend step: make the existing supplier search field functional using React local state.
> Requirements:
> Keep the existing three temporary suppliers.
> Use useState to store the search text.
> As the user types, filter the displayed suppliers.
> Search should match supplier name, type, or location.
> Search should be case-insensitive.
> If no suppliers match, display a simple No suppliers found message.
> Do not add backend calls, routing, pagination, filter dropdowns, sorting, authentication, or architecture changes.
> Keep the implementation simple for a React beginner.

Key response:
Implemented local case-insensitive search over name, type, and location, with a no-results message.

Follow-up prompts in the same conversation also requested:
> Continue with only the next small frontend step: add a supplier type filter to the existing SupplierListPage.tsx.
> Continue with only the next small frontend step: add supplier sorting to SupplierListPage.tsx.
> Continue with only the next small frontend step: add pagination to SupplierListPage.tsx.

Key response:
Added a type dropdown, name sorting, and two-items-per-page pagination that work together with search.

Files affected:
- frontend/src/pages/SupplierListPage.tsx

Author review:
The output was reviewed and tested, and follow-up instructions were given where changes were needed.

## Supplier details and CRUD UI
Date: 2026-09-18
Time: 2:48 PM SGT
Tool: Cursor
Model: GPT-5.6 Sol Medium

Exact prompt:
> Continue with only the next small frontend step: add supplier detail navigation.
> Current frontend already has:
> supplier list
> search
> type filter
> sorting
> pagination
> SupplierCard
> React Router installed
> Requirements:
> Add React Router to the app.
> Keep the supplier list page available at /suppliers.
> Create src/pages/SupplierDetailPage.tsx.
> Add a route /suppliers/:supplierId.
> Make the View Details button in SupplierCard navigate to the corresponding supplier detail page.
> Pass/use the supplier ID for navigation.
> For now, the detail page may read from the existing temporary local supplier data.
> Show supplier name, type, location, and operating hours if available.
> Add a simple Back button to return to the supplier list.
> Keep the implementation simple and beginner-friendly.
> Do not add backend calls, create/edit/delete functionality, authentication, or architecture changes yet.

Key response:
Added React Router, supplier detail pages, and ID-based navigation from SupplierCard.

Follow-up prompts in the same conversation also requested Create, Edit, and Delete UI:
> Continue with only the next small frontend step: add a Create Supplier page.
> Continue with only the next small frontend step: add Edit Supplier functionality.
> Continue with only the next small frontend step: add Delete Supplier UI.

Key response:
Added create/edit forms and a delete confirmation dialog, with TODOs for later Supplier Service integration and no backend calls.

Files affected:
- frontend/src/App.tsx
- frontend/src/components/SupplierCard.tsx
- frontend/src/pages/SupplierListPage.tsx
- frontend/src/pages/SupplierDetailPage.tsx
- frontend/src/pages/CreateSupplierPage.tsx
- frontend/src/pages/EditSupplierPage.tsx

Author review:
The output was reviewed and tested, and follow-up instructions were given where changes were needed.

## Responsive navigation and Requester/Courier toggle
Date: 2026-09-18
Time: 6:22 PM SGT
Tool: Cursor
Model: GPT-5.6 Sol Medium

Exact prompt:
> Continue with a UI/UX refinement step only.
> Do not change backend APIs, authentication, authorization, database schemas, service interfaces, or architecture.
> Please update the existing Supplier UI to better match our existing wireframe.
> Add:
> a responsive application navigation component
> on mobile, a bottom navigation containing:
> Home
> Suppliers
> My Requests
> Account
> visually indicate that Suppliers is the active section
> on desktop, adapt this navigation into an appropriate top navigation rather than keeping a mobile bottom bar
> add a location-pin icon beside each supplier location
> add a clock icon beside operating hours
> allow SupplierCard to show a supplier image or placeholder image
> Use Material UI and MUI icons if appropriate.
> Do NOT add an interactive map.
> Do NOT add map APIs or geolocation.
> Do NOT implement the other navigation pages yet; the navigation items may remain non-functional placeholders except Suppliers.

Key response:
Added responsive top/bottom navigation, location/clock icons, and supplier image placeholders.

Follow-up prompt:
> Continue with only the next UI/frontend step: add the existing Requester/Courier mode toggle from our wireframe to the responsive navigation.

Later follow-up:
> Please inspect AppNavigation.tsx only.
> The Requester/Courier toggle is visible, but clicking Requester or Courier currently produces no visible response.

Key response:
Added a Requester/Courier toggle with local state, then made the active option visually distinct.

Files affected:
- frontend/src/App.tsx
- frontend/src/components/AppNavigation.tsx
- frontend/src/components/SupplierInfo.tsx
- frontend/src/components/SupplierCard.tsx
- frontend/src/pages/SupplierDetailPage.tsx

Author review:
The output was reviewed and tested, and follow-up instructions were given where changes were needed.

## Admin-only controls
Date: 2026-09-19
Time: 3:40 PM SGT
Tool: Cursor
Model: GPT-5.6 Sol Medium

Exact prompt:
> Continue with only the next frontend/UI step.
> Our existing requirements already specify:
> all users can view suppliers
> only Admin users can create, edit, or delete suppliers
> Update the existing Supplier UI so admin-only controls are conditionally displayed.
> Requirements:
> Add Supplier should only appear when the current user has Admin permission.
> Edit and Delete on Supplier Details should only appear for Admin.
> Normal Requester/Courier users should still be able to view suppliers, search, filter, sort, paginate, and view details.
> Do NOT add Admin to the Requester/Courier toggle.
> For now, use a clearly temporary frontend-only boolean/prop for previewing the two UI states.
> Add a TODO stating that this temporary value must later be replaced by the role information provided by the team’s User Service/auth integration.
> Do not create authentication logic, tokens, APIs, backend authorization, or new architecture.

Key response:
Hid Add/Edit/Delete behind a temporary `TEMPORARY_IS_ADMIN` preview flag passed as `isAdmin`.

Files affected:
- frontend/src/App.tsx
- frontend/src/pages/SupplierListPage.tsx
- frontend/src/pages/SupplierDetailPage.tsx

Author review:
The output was reviewed and tested, and follow-up instructions were given where changes were needed.

## Loading, error and success states
Date: 2026-09-19
Time: 3:58 PM SGT
Tool: Cursor
Model: GPT-5.6 Sol Medium

Exact prompt:
> Continue with only the next frontend/UI step: add reusable UI states for the Supplier flow.
> Add frontend-only UI states for:
> loading suppliers
> no suppliers available
> no search/filter results
> generic supplier loading error
> success feedback after create/edit/delete actions
> Keep all of this frontend-only for now.
> Do not invent backend APIs.
> Do not implement fetching/authentication.

Key response:
Added reusable loading/empty/error UI and success snackbars for create/edit/delete preview actions.

Files affected:
- frontend/src/components/SupplierListStatus.tsx
- frontend/src/components/SuccessSnackbar.tsx
- frontend/src/pages/SupplierListPage.tsx
- frontend/src/pages/CreateSupplierPage.tsx
- frontend/src/pages/EditSupplierPage.tsx
- frontend/src/pages/SupplierDetailPage.tsx

Author review:
The output was reviewed and tested, and follow-up instructions were given where changes were needed.

## Login, Register and Account UI
Date: 2026-09-19
Time: 8:06 PM SGT
Tool: Cursor
Model: GPT-5.6 Sol Medium

Exact prompt:
> Continue with only the next frontend/UI step: make the existing navigation items functional.
> Please add simple frontend routes and placeholder pages for:
> /home
> /requests
> /account

Follow-up prompt:
> Continue with only the next frontend/UI step: replace the Account placeholder with a basic Account/Profile page for D2.

Follow-up prompt:
> Continue with only the next frontend/UI step: create the Login page for the existing User Service flow.

Follow-up prompt:
> Continue with only the next frontend/UI step: create the Register page for the existing User Service flow.

Follow-up prompt:
> Continue with only the next frontend/UI step: add temporary login/logout navigation behaviour for UI development.

Follow-up prompt:
> Refine only the logout placement.
> Move the existing Logout action out of AccountPage.tsx and into the authenticated application navigation.

Key response:
Added Home/Requests/Account routes, a local profile page, login/register forms, public-page navigation hiding, and temporary login/logout navigation without tokens or sessions.

Files affected:
- frontend/src/App.tsx
- frontend/src/components/AppNavigation.tsx
- frontend/src/pages/HomePage.tsx
- frontend/src/pages/MyRequestsPage.tsx
- frontend/src/pages/AccountPage.tsx
- frontend/src/pages/LoginPage.tsx
- frontend/src/pages/RegisterPage.tsx

Author review:
The output was reviewed and tested, and follow-up instructions were given where changes were needed.

## FoC polish
Date: 2026-09-25
Time: 9:35 AM SGT
Tool: Cursor
Model: GPT-5.6 Sol Medium

Exact prompt:
> Perform a visual polish pass only. Do not change functionality, routing, APIs, state logic, authentication logic, schemas, or architecture.
> Keep the current Material UI structure but make the application feel like a cohesive branded campus errand platform rather than default MUI.
> Improve:
> consistent app branding and colour system
> page title/subtitle hierarchy
> supplier card visual hierarchy
> category chips
> card spacing, border radius and subtle elevation
> desktop use of available space
> mobile spacing
> Requester/Courier visual distinction
> navbar polish
> consistent button styles
> Preserve accessibility and responsive behaviour.

Follow-up prompt:
> Replace the current Home placeholder with a simple polished FoC dashboard.

Key response:
Added a FoC theme, polished navigation/cards, and replaced Home with a dashboard of quick-action cards.

Files affected:
- frontend/src/theme.ts
- frontend/src/App.tsx
- frontend/src/components/AppNavigation.tsx
- frontend/src/components/SupplierCard.tsx
- frontend/src/pages/SupplierListPage.tsx
- frontend/src/pages/SupplierDetailPage.tsx
- frontend/src/pages/LoginPage.tsx
- frontend/src/pages/RegisterPage.tsx
- frontend/src/pages/AccountPage.tsx
- frontend/src/pages/HomePage.tsx
- frontend/src/pages/MyRequestsPage.tsx
- frontend/src/pages/CreateSupplierPage.tsx
- frontend/src/pages/EditSupplierPage.tsx

Author review:
The output was reviewed and tested, and follow-up instructions were given where changes were needed.

## Interactive NUS campus map

Date: 2026-09-25
Time: 2.10 PM
Tool: Cursor
Model: GPT-5.6 Sol Medium

Exact prompt:
> Replace the current illustrated/static campus map with a real interactive NUS campus map.
> Use Leaflet.js with OpenStreetMap tiles. Do NOT use a static image or custom-drawn fake map.
> Requirements:
> - The map should show the real NUS Kent Ridge + UTown geography.
> - Users must be able to pan and zoom the map.
> - Use Leaflet.js and react-leaflet.
> - Use OpenStreetMap tiles.
> - Add markers for NUS locations such as COM2, PGP, UTown, PC Commons, Central Library and University Hall.
> - Store locations using latitude/longitude data.
> - Clicking a marker should open a popup.
> - Add a search box for NUS locations.
> - Keep the map responsive on desktop and mobile.
> - Do not hard-code marker positions using CSS percentages.

Key response:
Cursor replaced the previous static campus illustration with an interactive Leaflet map using OpenStreetMap tiles, added NUS location markers and search/reset controls, and simplified the map controls by removing the redundant Zoom out button.

Packages installed:
- leaflet
- react-leaflet
- @types/leaflet

Files affected:
- frontend/package.json
- frontend/package-lock.json
- frontend/src/components/CampusMap.tsx
- frontend/src/data/nusLocations.ts
- frontend/src/pages/HomePage.tsx

Author review:
The map was reviewed and tested locally. Follow-up instructions were used to simplify the controls and improve the UI.

## Order Service frontend Phase 1 integration
Author: Brenda Tan Kai Xin
Date: 2026-10-23
Time: 4:22 PM SGT
Tool: Cursor
Model: GPT-5.6 Sol Medium

Exact prompt:
> We have finished the inspection.
>
> Proceed with the Order frontend integration, but do NOT modify Credit Service or Order-Credit request payload yet
>
> Implement only:
>
> 1. Gateway Order routing
> 2. Real frontend Order API types/mapping
> 3. Real requester order listing
> 4. Real order details where possible
> 5. Supplier/current-user enrichment
>
> Do NOT implement/create backend contract work yet.
> Do NOT modify Order Service business logic.
> Do NOT modify Credit Service.
> Do NOT commit or push automatically.
>
> Detailed requirements:
>
> A. Gateway
> - Add ORDER_SERVICE_URL following the existing User/Supplier service configuration style.
> - Proxy /api/orders and /api/orders/* to Order Service.
> - Preserve Authorization/authenticated headers using the same approach as existing services.
> - Use configuration/env, not a hard-coded localhost URL.
> - For root Docker networking, prepare the URL for:
>   http://order-service-api:3003
>   but inspect the existing compose/service naming before assuming this exact hostname works.
>
> B. frontend/src/api/orders.ts
> Replace preview/mock API behaviour with real API functions through the existing shared client.
>
> Create explicit raw backend types using snake_case response:
> - order_id, requester_id, courier_id, status, title, description, supplier_id,
>   delivery_location, credit_amount, accept_by, created_at, accepted_at, picked_up_at,
>   completed_at, cancelled_at, expired_at
>
> Also model the paginated response { data, total, limit, offset }.
> Keep these raw API types separate from the existing frontend Order view model.
>
> C. Mapping
> Create one mapping/enrichment function rather than converting fields throughout React pages.
> Map snake_case API fields to the frontend Order view model.
> For itemDescription, preserve backend title and description without inventing timestamps.
>
> D. Enrichment
> For requester-owned orders:
> - use fetchCurrentUser() for requester information
> - use fetchSupplierById(supplier_id) for supplier name/building/floor
> - courier may remain unresolved for now if needed
> Handle failed supplier enrichment gracefully.
>
> E. My Requests
> Replace preview data in fetchMyRequests with GET /orders?requester_id={current user id}.
> Preserve Active/Past tabs, pagination UI, styling, loading/error states.
>
> F. Order Details
> Connect fetchOrderById to GET /orders/{id} with the same mapping/enrichment.
>
> G. Important workflow correction
> Follow actual backend:
> - COURIER accepts
> - COURIER marks pickup
> - REQUESTER completes
> - REQUESTER cancels
> Do NOT keep a frontend assumption that the Courier completes the order.
>
> H. Preview flag
> Do NOT globally set isOrderApiConnected() to true until screens are genuinely integrated.

Key response:
Added gateway `/api/orders` proxying to Order Service, replaced preview order API types with snake_case rows, centralised mapping/enrichment (supplier + current user), and connected requester My Requests / order details to the real API while keeping courier-completes assumptions out of the flow.

Files affected:
- gateway/.env.example
- gateway/docker-compose.yml
- gateway/src/config/env.ts
- gateway/src/server.ts
- frontend/src/api/client.ts
- frontend/src/api/orders.ts
- frontend/src/api/users.ts
- frontend/src/components/OrderCard.tsx
- frontend/src/orders/orderTypes.ts
- frontend/src/pages/MyRequestsPage.tsx
- frontend/src/pages/OrderDetailsPage.tsx
- frontend/src/pages/RequestCreationPage.tsx

Author review:
The output was reviewed and tested, and follow-up instructions were given for courier integration and admin order monitoring.

## Courier Order Service integration
Author: Brenda Tan Kai Xin
Date: 2026-10-23
Time: 4:56 PM SGT
Tool: Cursor
Model: GPT-5.6 Sol Medium

Exact prompt:
> Now integrate the Courier side with real Order Service.
>
> Do not change Order Service business logic.
> Do not change Credit Service.
> Do not commit or push automatically.
> Preserve the current UI styling and pagination where possible.
>
> Current backend endpoints:
> GET /api/orders (OPEN unexpired when no owner filter)
> GET /api/orders/{order_id}
> POST /api/orders/{order_id}/accept (COURIER only)
> POST /api/orders/{order_id}/pickup (COURIER only)
>
> Important: Completion is NOT a Courier action.
> POST /api/orders/{order_id}/complete is REQUESTER only.
>
> Please implement:
> 1. Fulfil Requests — real GET /orders, enrich supplier/requester, remove preview banner when connected
> 2. Available Request Details — GET /orders/{id}, Accept when appropriate, back to Fulfil Requests
> 3. Accept — POST accept, handle conflict, redirect to My Tasks Active on success
> 4. My Tasks — GET /orders?courier_id={current user}; Active = ACCEPTED/PICKED_UP; Past = COMPLETED/CANCELLED/EXPIRED as returned
> 5. Pickup — POST pickup; after PICKED_UP wait for requester confirmation; no Courier Complete action
> 6. API layer — replace fake fetchAvailableRequests / fetchMyCourierTasks / acceptOrder / markOrderPickedUp; reuse mapping
> 7. User lookup — helper or batch User Service lookup; do not query User DB directly

Key response:
Connected Fulfil Requests, courier order details, Accept, My Tasks, and Pickup to the real Order Service through the shared orders API mapper, with requester/supplier enrichment and no courier-complete action.

Files affected:
- frontend/src/api/orders.ts
- frontend/src/api/users.ts
- frontend/src/pages/FulfilRequestsPage.tsx
- frontend/src/pages/MyTasksPage.tsx
- frontend/src/pages/OrderDetailsPage.tsx
- frontend/src/components/OrderCard.tsx

Author review:
The output was reviewed and tested against the requester-create → courier-accept → pickup flow.

## Admin Dashboard Orders monitoring
Author: Brenda Tan Kai Xin
Date: 2026-10-26
Time: 5:14 PM SGT
Tool: Cursor
Model: GPT-5.6 Sol Medium

Exact prompt:
> Implement the Admin Dashboard -> Orders tab using the existing real Order Service integration.
>
> Current state:
> - Admin Dashboard already has Users / Suppliers / Orders tabs.
> - Orders tab is only a placeholder saying order monitoring is pending Order Service integration.
> - Requester and Courier order screens are already connected to Order Service through the gateway.
> - Reuse the existing order API types, mapping, supplier enrichment, and user-name enrichment from frontend/src/api/orders.ts.
> - Do NOT duplicate order mapping logic.
> - Do NOT modify Order Service business logic.
> - Do NOT modify Credit Service.
> - Do NOT change unrelated Admin Dashboard styling.
> - Do NOT commit or push automatically.
>
> Goal:
> Turn the Admin Orders tab into a real read-only administrative order-monitoring view.
>
> Requirements:
> 1. Admin order list from Order Service through the gateway (inspect ADMIN query behaviour; do not invent endpoints)
> 2. Display order id, title, requester, courier, supplier, delivery location, credits, status, acceptance deadline, created time
> 3. Status filter + page search if backend search is unavailable; pagination via limit/offset
> 4. Support OPEN, ACCEPTED, PICKED_UP, COMPLETED, CANCELLED, EXPIRED
> 5. Admin order detail via existing OrderDetailsPage — read-only, no Accept/Pickup/Complete/Cancel; back to Admin Orders
> 6. Reuse enrichment helpers; keep ADMIN route/role protection
> 7. Loading / error / empty / retry states
> 8. Remove the Orders placeholder copy

Key response:
Replaced the Admin Orders placeholder with a real status-filtered, paginated monitoring table and `/admin/orders/:orderId` read-only detail reuse of OrderDetailsPage, using `fetchAdminOrders` on top of the existing mapper.

Files affected:
- frontend/src/App.tsx
- frontend/src/api/orders.ts
- frontend/src/pages/AdminDashboardPage.tsx
- frontend/src/pages/OrderDetailsPage.tsx

Author review:
The output was reviewed and tested; Admin order monitoring was verified against live Order Service data.

## Automatic order expiry and credit release
Author: Brenda Tan Kai Xin
Date: 2026-10-26
Time: 6:15 PM SGT
Tool: Cursor
Model: GPT-5.6 Sol Medium

Exact prompt:
> Implement the complete automatic order expiry workflow across Order Service, Credit Service, and frontend.
>
> Current known behaviour:
> - Orders have OPEN, ACCEPTED, PICKED_UP, COMPLETED, CANCELLED, EXPIRED statuses.
> - accept_by exists.
> - expired_at exists.
> - Public OPEN listing already hides overdue orders.
> - Accept already rejects orders past accept_by.
> - But overdue orders remain OPEN in the DB.
> - expired_at is never set.
> - ORDER_EXPIRED is not currently published.
> - Reserved credits therefore remain reserved.
> - Frontend already understands EXPIRED in some places, including Admin status filtering, but no real orders reach that state.
>
>
> IMPORTANT:
> First inspect the current implementation of:
> 1. Order state-transition/repository/service logic
> 2. Existing ORDER_COMPLETED and ORDER_CANCELLED event publishing
> 3. RabbitMQ publisher/consumer setup
> 4. Credit Service order-event switch/consumer
> 5. Existing credit release transaction logic
> 6. Existing idempotency handling
> 7. Frontend handling of EXPIRED orders
>
> Do not invent a new event architecture if an existing pattern can be reused.
> Then implement the smallest safe solution.
>
> ORDER SERVICE REQUIREMENTS
> 1. Add a background expiry process inside Order Service.
> 2. Periodically find orders with status = OPEN and accept_by <= now.
> 3. Transition atomically OPEN -> EXPIRED and set expired_at.
> 4. Ensure an order cannot be expired twice and cannot expire if accepted concurrently.
> 5. Publish ORDER_EXPIRED only for successfully transitioned orders, following existing event/RabbitMQ conventions.
>
> CREDIT SERVICE REQUIREMENTS
> 1. Handle ORDER_EXPIRED in the existing consumer/switch.
> 2. Reuse cancellation credit-release logic where possible.
> 3. Release the reservation back to the requester; keep release idempotent.
>
> FRONTEND REQUIREMENTS
> 1. EXPIRED is a past request; Order Details and Admin EXPIRED filter show real expired orders.
> 2. No requester/courier action buttons for EXPIRED.
> 3. Backend remains the source of truth — no frontend timer that invents status.
>
> BACKGROUND PROCESS
> Prefer a lightweight periodic worker inside Order Service:
> - do not block startup
> - handle errors safely
> - no overlapping scans
> - sensible interval
> - clean stop on shutdown if supported
> Do not introduce Redis/cron/a new service unless already used.
>
> After implementation, report files changed, worker interval, event payload, concurrency/idempotency mechanism, and remaining limitations.
> Do not commit or push.

Key response:
Added Order Service `expiryWorker` + `expireDueOpenOrders` (locked, skipLocked, status-guarded UPDATE), published `ORDER_EXPIRED`, and extended Credit Service to release reserved credits idempotently. Frontend already treated EXPIRED as past/admin-filterable, so no separate status invention was added on the client.

Files affected:
- order-service/.env.example
- order-service/app/config/env.ts
- order-service/app/events/expiryWorker.ts
- order-service/app/index.ts
- order-service/app/models/types.ts
- order-service/app/service/orderService.ts
- credit-service/src/events/processOrderEvent.ts
- credit-service/src/events/rabbitmq.ts
- credit-service/src/service/transactionService.ts
- credit-service/src/types/eventTypes.ts

Author review:
The output was reviewed and tested for OPEN→EXPIRED transition, credit release, and that accepted orders are not expired by a concurrent worker scan.


## Development Guidance
Tool: ChatGPT
Model: GPT-5.6 Sol

Usage:
Learning support, code explanations and debugging guidance.

## Supplier Service CRUD
Author: Maegan Tan
Tool: Gemini (model: 3.1 Pro)
Model: GPT-5.6 Sol Medium
Date: 2026-09-27

### Type Implementation
Prompt: Provided the SQL schema, AI was used to implement the types
Author review: Code manually reviewed and verified
Files affected:
- supplier-service/src/models/types.ts

### CRUD Implementation
Prompt: Provided function names and the Supplier model, AI was used to implement the CRUD operations
Author review: Code manually reviewed and tested with Postman
Files affected:
- supplier-service/src/models/types.ts
- supplier-service/src/controllers/supplierController.ts
- supplier-service/src/service/supplierService.ts

### RBAC Implementation
Tool: GitHub Copilot (GPT-6 Luna)
Prompt: Implementation was done incrementally with the following prompts
- Implement boilerplate code for a Role-Based Access Control middleware. Refer to the auth middleware in user-services. Include the jwt dependencies and create type files needed, but do not use the middleware in the routes yet
- Implement the middleware in each route, include all three roles in the permissions each route
  Author Review: Code reviewed and tested with postman
  Files affected:
- supplier-service/src/middleware/authMiddleware.ts
- supplier-service/src/routes/supplierRoutes.ts
- supplier-service/src/types/auth.ts
- supplier-service/src/types/express.d.ts

## Credit Service 
Author: Maegan Tan
Tool: Gemini (model: 3.1 Pro)
Model: GPT-5.6 Sol Medium
Date: 2026-10-15

### SQL Query Implementation
Prompt: Provided function names and the SQL Schema, AI was used to implement the SQL queries
Author review: Code manually reviewed and tested with Postman
Files affected:
- credit-service/src/service/walletService.ts
- credit-service/src/service/transactionService.ts

### Event management

Prompt: Provided event types, implemented handling events from RabbitMQ
- Set up the skeleton code for processing of events by credit service
Models: Gemini (model: 1.5 Pro), Grok 4.7
Author Review: Code manually reviewed and tested. For event handling, skeleton code was generated and the logic was verified and tested.
Files affected
- credit-service/src/events/orderEvents.ts
- credit-service/src/events/processOrderEvent.ts
- credit-service/src/events/rabbitmq.ts

## Debugging Errors that arose in cloud deployment
Author: Maegan Tan
Tool: GitHub Copilot
Date: 2026-11-07

Prompt:
> Order service failing to start in deployment with a PostgreSQL `pg_hba.conf` error indicating no encryption.

Key response:
Added an opt-in PostgreSQL SSL setting, enabled it for the deployed order-service task definition, and documented the setting for local configuration

Files affected:
- order-service/app/config/db.config.ts
- order-service/app/models/index.ts

Author review: Reviewed manually and tested on deployment


## AWS RDS SSL connection for remaining microservices
Author: Maegan Tan
Tool: GitHub Copilot
Date: 2026-11-07

Exact prompt:
> I need to fix an AWS RDS SSL connection issue across my remaining microservices (User, Credit, Supplier, and Order services).
>
> Please scan the codebase for these services and locate the files where the PostgreSQL database connection pool is initialized (specifically where `new Pool(...)` from the `pg` library is called).
>
> Example of the error faced:
> error: no pg_hba.conf entry for host "172.30.2.40", user "postgres", database "user_service", no encryption

Key response:
Added opt-in SSL to the User, Credit, and Supplier PostgreSQL pools, enabled it in their ECS task definitions, and documented the local setting. Order service already had SSL enabled.

Files affected:
- user-service/src/config/db.ts
- credit-service/src/config/db.ts
- supplier-service/src/config/db.ts
- user-service/task-definition.json
- credit-service/task-definition.json
- supplier-service/task-definition.json
- user-service/.env.example
- credit-service/.env.example
- supplier-service/.env.example

## Supplier favourite frontend controls
Author: Maegan Tan
Tool: GitHub Copilot (Copilot SDK)
Date: 2026-11-08

Exact Prompt:
> Make only frontend changes, do not change backend APIs, architecture, database schemas, authentication, routing, or authorization.
> Please:
> - add the new backend API for deleting and adding favourite suppliers to the frontend/src/api/suppliers.ts files
> - on the SupplierListPage for requester and courier views, add a star button to the top right corner of each modal that displays the supplier. This button should send requests to the backend to add or delete favourites. If the current supplier.isFavourite is true when suppliers are first loaded, the star should have already been pressed.
> - On the SupplierDetailPage, a similar functionality should be added to display whether it is a favourite
> - Use Material UI
>
Key response:
Added the frontend favourite API calls, mapped the response flag, and implemented Material UI favourite controls for supplier cards and the detail page. Investigated the error and found the existing backend favourite routes are wired to the supplier search and get-by-ID handlers instead of favourite handlers. No backend changes were made because the request is frontend-only; the backend route handler mapping must be corrected for these calls to work.

Files affected:
- frontend/src/api/suppliers.ts
- frontend/src/components/SupplierCard.tsx
- frontend/src/components/SupplierFavouriteButton.tsx
- frontend/src/interfaces.ts
- frontend/src/pages/SupplierDetailPage.tsx
- frontend/src/pages/SupplierListPage.tsx
- ai/usage-log.md

Author review: Read through all code and verified through testing

## Align supplier favourite switch
Author: Maegan Tan
Tool: GitHub Copilot (Copilot SDK)
Date: 2026-11-08

Exact Prompt:
> Please move the show favourites toggle to the right side of the box

Key response:
Aligned the "Show favourites" switch to the right side of the supplier filters box.

Files affected:
- frontend/src/pages/SupplierListPage.tsx
- ai/usage-log.md

Author review: Read through all code and verified through testing

## Supplier favourite filtering
Author: Maegan Tan
Tool: GitHub Copilot (Copilot SDK)
Date: 2026-11-08

Exact Prompt:
> Please:
> - Include a new toggle "Show favourites" on the top left of the SupplierList page. When pressed, show only favourited suppliers. On load, the toggle should be toggled off.

Key response:
Added a Material UI "Show favourites" switch to the supplier list, off by default.

Files affected:
- frontend/src/pages/SupplierListPage.tsx
- ai/usage-log.md

Author review: Read through all code and verified through testing

## Supplier and credit service unit tests
Author: Maegan Tan
Tool: GitHub Copilot (Copilot SDK in VS Code)
Date: 2026-11-10

Exact Prompt:
> Write unit tests for functions in supplier-service and credit-service.
>
> For each function, consider the following test cases
> - Happy paths: Verify that the function produces the expected result under normal conditions.
> - Edge cases: Test boundary values, empty inputs, missing or optional fields, and other unusual but valid inputs.
> - Error handling: Verify that errors and exceptions are handled correctly, including invalid inputs and dependency failures.
> - Business logic: Ensure that the function behaves correctly according to its intended business rules.

Key response:
Added database-isolated unit tests for supplier CRUD and favourite operations, plus wallet initialization/lookups and credit reservation, transfer, release, and idempotent release behavior. Tests cover successful results, missing records and empty inputs, database failures, and transaction rollback/cleanup.

Files affected:
- supplier-service/test/supplierService.test.ts
- credit-service/test/creditService.test.ts
- ai/usage-log.md

Author review: Tests reviewed and verified by author

## User and order service unit tests
Author: Maegan Tan
Tool: GitHub Copilot (Copilot SDK in VS Code)
Date: 2026-11-10

Exact Prompt:
> Write unit tests for functions in user-service and order-service.
>
> For each function, consider the following test cases
> - Happy paths: Verify that the function produces the expected result under normal conditions.
> - Edge cases: Test boundary values, empty inputs, missing or optional fields, and other unusual but valid inputs.
> - Error handling: Verify that errors and exceptions are handled correctly, including invalid inputs and dependency failures.
> - Business logic: Ensure that the function behaves correctly according to its intended business rules.

Key response:
Added database- and network-isolated tests for user authentication, profiles, passwords, role administration, wallet initialization, order creation and state transitions, event recording, and credit reservation. Tests include validation and authorization errors, missing records, rollback/compensation, token rotation, expiry, pagination, and dependency failures.

Files affected:
- user-service/test/userServices.test.ts
- order-service/test/orderServices.test.ts
- ai/usage-log.md

Author review: Tests reviewed and verified by author

## Order Service: transactional outbox and RabbitMQ event publishing

Author: Chloe Low
Tool: Claude (Sonnet 5.5)
Date: 2026-10-19

Prompt:
> I am implementing an order service API. When an order is completed, cancelled or expires, the credit service must transfer or release reserved credits. Help me implement event publishing to RabbitMQ, ensuring that the order status change and the event are committed atomically. Use durable topic exchange and ensure events are not silently dropped if no consumer queue is bound.

Key response:
Suggested writing events to an outbox table in the same database transaction as the order
status change, and a background relay that polls unpublished rows (FOR UPDATE SKIP LOCKED),
publishes them with publisher confirms and the `mandatory` flag, and marks them as published.
Provided a standard event envelope (event_id, event_type, timestamp, data), a RabbitMQ
connection module with lazy reconnection, an HTTP client for credit reservation, and
centralised environment validation.

Files affected:
- order-service/app/events/rabbitmq.ts
- order-service/app/events/outboxRelay.ts
- order-service/app/events/orderEvents.ts
- order-service/app/models/outboxEventModel.ts
- order-service/app/clients/creditClient.ts
- order-service/app/config/env.ts

Author review: Reviewed, adapted to the project's order lifecycle, and tested locally with Docker Compose.

## Auto-subscribe new users to SNS notifications
Author: Chloe Low
Tool: Claude (Opus 5.5)
Date: 2026-11-10

Prompt:
> My app uses AWS SNS to send email notifications and I want users to be automatically subscribed after sign up. Help me implement best-effort event publishing to RabbitMQ. When a user signs up, the user service should publish a UserRegistered event, and the notification service should consume it and subscribe the user’s email address to the SNS topic.

Key response:
User service now publishes a best-effort USER_REGISTERED event (user_id, email) to a "users" topic exchange after registration commits. The notification service binds its queue to user.registered and calls SNS Subscribe with a per-user filter policy, so SNS sends the confirmation email at sign-up. Added RabbitMQ config to the user service compose file and ECS task definition, plus unit tests.

Files affected:
- user-service/src/events/userEvents.ts (new)
- user-service/src/services/authService.ts
- user-service/package.json
- user-service/package-lock.json
- user-service/docker-compose.yml
- user-service/task-definition.json
- user-service/.env.example
- notification-service/src/notifications/subscriber.ts (new)
- notification-service/src/notifications/filterPolicy.ts (new)
- notification-service/src/events/userEvent.ts (new)
- notification-service/src/events/consumer.ts
- notification-service/src/config.ts
- notification-service/test/templates.test.ts
- notification-service/README.md
- ai/usage-log.md

Author review: Reviewed and tested locally.
