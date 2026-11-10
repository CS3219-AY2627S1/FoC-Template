import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Client generation needs no URL; migrations and Studio receive it at runtime.
    url: process.env.DATABASE_URL,
  },
});
