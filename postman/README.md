# Postman collections

The collections under `postman/collections` run against either local Compose
or Floci EKS. Select the matching environment:

- **compose** uses `http://localhost:8080` and Floci at `http://localhost:4566`.
- **eks** uses Floci at `https://localhost:4567`. Set its `baseUrl` to the
  local CloudFront URL printed by `npm run up:eks`; the domain is generated
  on startup. Trust `floci/eks/.floci-ca.pem` in Postman for local HTTPS.

Both environments set `target_env=development`, which enables the existing
Floci-specific authentication expectations. The `deployment_target` value
selects cookie checks: Compose expects cookies without `Secure` for HTTP,
while EKS requires `Secure` for HTTPS. Each request disables the cookie
jar: sign-in scripts store tokens in collection variables and protected
requests send the selected identity's explicit Cookie header. Run each entire
collection in order with the default runner settings and no data file.

Both CI workflows install Postman CLI and run each collection against their
own freshly started environment. The EKS workflow supplies the generated
CloudFront URL and local CA automatically. Application requests use Postman's
`auto` HTTP version setting: it negotiates HTTP/2 with the local EKS
CloudFront endpoint and HTTP/1.1 with Compose. Floci SES requests retain their
normal protocol. Use the Postman desktop app or CLI without an HTTP proxy for
the local EKS endpoint. For a manual CLI run against Compose, for example:

```bash
postman collection run 'postman/collections/User Auth API' \
  --environment postman/environments/compose.environment.yaml
```

Each registration flow creates fresh users, and some collections create
suppliers and errands. OTPs are read from Floci SES by recipient email. The
**User Auth API** collection checks refresh, logout and admin operations;
Floci's refresh-token rotation limitations are identified in its assertions.
