# Internal HTTPS

Service-to-service HTTP calls use TLS. In the current implementation, Credit
Service forwards bearer tokens to User Service over
`https://user-service:8080`; Kafka continues to use its own protocol.

## Local Compose certificates

Generate a development certificate authority and a User Service server
certificate before starting Compose:

```powershell
.\scripts\generate-dev-tls.ps1
```

The generated server certificate is valid for the Compose DNS name
`user-service`, `localhost`, and `127.0.0.1`. Compose mounts the server
certificate and key only into User Service, and mounts only the CA certificate
into Credit Service and Frontend Service. Credit verifies both the
certificate chain and hostname; Frontend Service's Node runtime trusts the CA
through `NODE_EXTRA_CA_CERTS`.
Certificate files live under `certs/` and are excluded from Git.

Do not use these development keys outside a local environment. A deployed
environment should inject certificates from its secret manager or platform PKI
and rotate them independently of the application image. Set
`USER_SERVICE_TLS_CERT_FILE`, `USER_SERVICE_TLS_KEY_FILE`, and
`INTERNAL_CA_CERT_FILE` to the host-side paths used by Compose.

`USER_SERVICE_URL` must use `https://`, and Credit Service also requires
`USER_SERVICE_CA_FILE` to point to the CA bundle inside its runtime. The client
does not fall back to plaintext or disable certificate verification.
