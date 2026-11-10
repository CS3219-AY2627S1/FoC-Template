# Supplier Service current-authorization contract (v1)

Supplier Service verifies each normal User Service access JWT locally with
`GET /.well-known/jwks.json`. It must validate the RS256 signature, `kid`,
issuer, audience, expiry, `sub`, `sid`, and `roleVersion`. A locally valid
token permits normal authenticated supplier browsing only; Supplier Service
must not infer supplier-management permission from a JWT role claim.

Immediately before every supplier create, update, or deactivation operation,
Supplier Service calls:

```http
POST /v1/internal/authorization-decisions
Authorization: Bearer <the user's access JWT>
X-FoC-Service-Secret: <SUPPLIER_SERVICE_SHARED_SECRET>
X-Correlation-ID: <request correlation ID>
Content-Type: application/json

{"action":"SUPPLIER_CREATE"}
```

The permitted `action` values are `SUPPLIER_CREATE`, `SUPPLIER_UPDATE`, and
`SUPPLIER_DEACTIVATE`. A successful response is:

```json
{
  "subjectId": "a stable user UUID",
  "accountStatus": "ACTIVE",
  "systemRole": "ADMIN",
  "allowed": true
}
```

The only supported `accountStatus` values are `ACTIVE` and `DELETED`.

Supplier Service performs the operation only when the response status is 200,
`allowed` is `true`, and `accountStatus` is `ACTIVE`. It fails closed (deny the
operation) on every other status, malformed response, network error, timeout,
or `allowed: false`. Do not retry a caller's state-changing supplier operation
after a failed authorization call.

For local Compose, use the repository-root stack, which connects Supplier and
User through its `user-internal` network. Call `http://user-service:8000`, and
supply the generated `SUPPLIER_SERVICE_SHARED_SECRET` through
`supplier-service/.env`.
The User Service endpoint still requires the secret even on that internal
network. In AWS, replace this shared secret with task IAM or mTLS-equivalent
service identity; the request and fail-closed response contract stay the same.

User Service has no Supplier database access. This endpoint returns no profile,
credential, refresh-token, or key material.
