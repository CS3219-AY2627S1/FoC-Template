# Gateway Service

Shared infrastructure; apply the editor/reviewer rule in [root AGENTS.md](../AGENTS.md).

Own edge routing, forwarded headers, health and route verification. Add routes only for
producer-published paths, ports and contracts. Keep domain logic, databases, JWT signing and
downstream authorization in the owning services.

Preserve methods, paths, query strings, bodies, authorization headers, status codes and error
media types unless an approved contract requires transformation. See the
[README](README.md) for routes and verification.
