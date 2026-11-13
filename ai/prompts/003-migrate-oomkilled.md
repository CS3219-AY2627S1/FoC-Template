# Prompt archive: 003

Received 2026-11-06 (Asia/Singapore).

## Prompts

```text
user-service-64c879bd87-7cprx   0/1     Init:CrashLoopBackOff   5 (18s ago)   4m2s
```

```text
kubectl -n foc logs deploy/user-service -c migrate --tail=30
Prisma schema loaded from prisma/schema.prisma
Datasource "db": PostgreSQL database "user_service", schema "public" at "user-db:5432"

kubectl -n foc get pods -l app.kubernetes.io/name=user-db
user-db-0   1/1     Running   0          4m36s
```

```text
OOMKilled
```
