# supplier-service messaging

Leave `consumer.ts` and `producer.ts` as unimplemented skeletons until you implement them. The `import '@foc/messaging'` lines will not typecheck until some `package.json` in this compile graph lists the dependency.

supplier-service has two `package.json` files. Use the one that will compile these files.!!! Don't forget to merge the two `package.json` btw

### AI Setup Instructions

## Import `@foc/messaging`

### If you implement from the REST service (`src/`)

1. Open `supplier-service/package.json`.
2. Add `"@foc/messaging": "0.1.0"` under `dependencies`:

```json
"dependencies": {
  "@foc/messaging": "0.1.0",
  "@supabase/supabase-js": "^2.117.1",
  ...
}
```

3. Open the **repository root** `package.json` and add `"supplier-service"` to `workspaces` so npm can link the internal package:

```json
"workspaces": [
  "shared/grpc",
  "order-service/grpc",
  "credit-service/grpc",
  "supplier-service",
  "supplier-service/grpc",
  "shared/messaging"
]
```

4. From the **repository root** (`FoC/`):

```bash
npm install
npm run build --workspace @foc/messaging
```

### If you implement from the gRPC workspace (`grpc/`)

1. Open `supplier-service/grpc/package.json`.
2. Add `"@foc/messaging": "0.1.0"` next to `"@foc/grpc": "0.1.0"`:

```json
"dependencies": {
  "@foc/grpc": "0.1.0",
  "@foc/messaging": "0.1.0",
  "@grpc/grpc-js": "^1.14.5",
  "dotenv": "^18.0.3",
  "zod": "^4.6.5"
}
```

3. From the **repository root** (`FoC/`):

```bash
npm install
npm run build --workspace @foc/messaging
```

4. Include these files in `supplier-service/grpc/tsconfig.json` (`../messaging/**/*.ts`), or move them under `grpc/src`. That tsconfig currently does not compile this folder.

Import from these files as:

```ts
import { RabbitMQClient, QUEUES } from '@foc/messaging';
```
