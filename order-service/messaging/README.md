# order-service messaging

### AI Setup Instructions

## Import `@foc/messaging`

1. Open `order-service/grpc/package.json`.
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

4. Import from these files as:

```ts
import { RabbitMQClient, QUEUES } from '@foc/messaging';
```

`grpc/tsconfig.json` currently only compiles `grpc/src/**/*.ts`. These skeletons stay out of that graph until you implement them (either include `../messaging/**/*.ts` in that tsconfig, or move the files under `grpc/src`).
