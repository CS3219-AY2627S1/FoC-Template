# Timestamp: 2026-09-21

# Key Prompt:

I have already defined the Supplier backend requirements, service structure, interfaces, validation criteria, error messages, and cross-service behaviour. Using the existing contracts and project conventions, help me scaffold and draft the implementation below. Do not redesign the service or make new product decisions.

SUPPLIER DATA AND CRUD

- Use the existing Express controller, service, repository structure with PostgreSQL.
- A Supplier contains id, name, location, operational status, operating hours, and supported service types.
- Location contains latitude, longitude, building name, and floor number. Operating hours contain opening time, closing time, and days of the week.
- Support listing Suppliers, getting one Supplier, creating, partially updating, and deleting.
- A duplicate Supplier should return the existing `DUPLICATE_SUPPLIER` error. A missing Supplier should return the existing not found error.
- Store location and operating hours in the existing JSON database fields and map the database rows back to the shared Supplier contract.

FILTERING

- Supplier listing supports operational status and service type filters.
- Status `all` means no status filter. `operational` maps to true and `not-operational` maps to false.
- Service types use PostgreSQL array overlap. An explicitly empty service type array should return no results.
- Combine multiple filters using bound parameters and order the results by Supplier name.

ROUTES AND AUTHORIZATION

- Mount the Supplier routes at `/api/supplier`.
- Authenticated and verified users can list Suppliers and get one Supplier.
- Only users with the Cognito role `admin` or `super-admin` can create, update, or delete Suppliers. Do not require a User Service profile lookup for administrator mutations.
- Add `/health` for liveness and make `/healthz` check the PostgreSQL connection.

# Key Prompt 2:

You are now implementing the Supplier field validation and error handling.

- `location` is required and must be an object. Latitude and longitude must be numbers, building name must be a non-empty string, and floor number must be a number.
- `operatingHours` is required. Opening and closing times must use the 24-hour `HH:mm` format.
- Days of the week must be a non-empty array containing only values from the shared `Day` contract.
- Service types must be a non-empty array containing only values from the shared `ServiceType` contract.
- Keep the existing validation messages and duplicate Supplier handling. Do not add additional validation rules.

# Key Prompt 3:

You are now implementing the internal Supplier selection interface and availability calculation used by the Errand Service.

- Mount the internal Supplier routes at `/internal/suppliers`.
- Protect them using `x-supplier-service-token` and the configured internal service token. Refer to the User Service and Credit Service internal middleware for the existing pattern.
- Add `POST /validate-selection`. It receives a Supplier id and optional service type.
- Return `SUPPLIER_NOT_FOUND` if the Supplier does not exist, `SUPPLIER_INACTIVE` if it is not active, and `SERVICE_TYPE_NOT_OFFERED` if the selected type is not offered.
- A Supplier is active only when `isOperational` is true and the current local time is within its operating hours using the configured timezone.
- If opening and closing times are equal, treat the Supplier as active for the configured day.
- For normal hours, include the opening and closing boundaries. For overnight hours, continue availability after midnight by checking the previous configured day.

# Key Prompt 4:

You are now implementing Supplier update integration with the Errand Service and the remaining build setup.

- After a Supplier update succeeds, send the updated Supplier information to `POST {ERRAND_API_URL}/internal/errands/supplier-events`.
- Authenticate using `x-errand-service-token` and send Supplier id, name, location, operating hours, operational status, and service types.
- This is a best-effort notification and must not block the Supplier update response.
- Try up to 3 times. Wait 1 second after the first failure and 2 seconds after the second failure. Log HTTP and network failures.
- The Errand Service decides how to update or delete affected Errands. Do not put Errand lifecycle logic in the Supplier Service.
- Scaffold the database connection, application wiring, repository, service, controllers and routes, internal middleware, migration startup helper, and Docker build. Do not change the existing contracts, database model, routes, authorization, availability rules, or retry values.

# Usage Scenario:

Scaffolded and drafted the author-defined Supplier CRUD, filtering, availability, authorization, and Supplier-to-Errand update flow, then assisted with syntax, container, migration, and integration debugging.
