# Supplier agent prompts, 25 September–6 October 2026

Created with Cursor ironically using the prompt below

```
In the AI usage add in my chats from supplier when I used it in agent mode to implement my work. Check chats from late september to early october when the project was started. Create it in a markdown file and declare each prompt I made. Allow me to review it 
```

Each entry is one prompt that asked for a direct change.
Entries: 5.

## Index

1. Friday, Sep 25, 2026 — Move supplier create and update onto Drizzle
2. Sunday, Sep 27, 2026 — Set up the local Supabase container and load the seed data
3. Thursday, Oct 1, 2026 — Fix the CRUD table in the README
4. Tuesday, Oct 6, 2026 — Fill in the supplier hours update
5. Tuesday, Oct 6, 2026 — Add sample commands for supplier hours

---

## 1. Move supplier create and update onto Drizzle

- Transcript: `093fe1aa-a28b-46e9-8ff2-44f243e0630f`
- Friday, Sep 25, 2026, 12:54 PM (UTC+8)

```
in src/data/schema.ts

add in the drizzle schema 

// src/db/schema.ts
import { pgTable, serial, text, integer, json, timestamp, varchar } from 'drizzle-orm/pg-core';

export const supplier = pgTable('Supplier_Database', {
    supplierId: serial('supplier_id').primaryKey(),
    name: varchar('name').notNull(),
    type: varchar('type').notNull(),
    buildingName: varchar('building_name').notNull(),
    locationDescription: varchar('location_description').notNull(),
    floor: integer('floor').notNull(),
    location: json('location').notNull(),
    openingHours: json('opening_hours').notNull(),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
    deletedAt: timestamp('deleted_at'),
});

remove any redundant zod code

in SupplierRepository.ts migrate updateSupplierByIdService and createSupplierService to use drizzle-orm

No relative imports 

KEEP everything else raw pg
```

Files changed:
- `supplier-service/package.json`
- `supplier-service/src/data/schema.ts`
- `supplier-service/src/database/db.ts`
- `supplier-service/src/database/SupplierRepository.ts`
- `supplier-service/src/api/supplierController.ts`

---

## 2. Set up the local Supabase container and load the seed data

- Transcript: `7ebabf86-8bac-420d-843d-cd22b8f84a07`
- Sunday, Sep 27, 2026, 6:53 PM (UTC+8)

```
give me some time to read update suppliers in @supplier-service/src/database/supplier-repository.ts 

for now can you fix the dockerfile and compose.yaml to create a local supabase instance, and load in the seed.sql data
then run the application? 

In my @supplier-service/README.md  include run instructions
```

Files changed:
- `supplier-service/supabase/migrations/20260927190000_updated_at_ms_precision.sql`
- `supplier-service/compose.yaml`
- `supplier-service/supabase/docker/roles.sql`
- `supplier-service/src/database/supplier-repository.ts`
- `supplier-service/README.md`

---

## 3. Fix the CRUD table in the README

- Transcript: `792336e2-d24f-4b51-961a-4a1175a3851e`
- Thursday, Oct 1, 2026, 2:23 AM (UTC+8)

```
please fix the table CRUD database in readme.md
```

Files changed:
- `supplier-service/README.md`

---

## 4. Fill in the supplier hours update

- Transcript: `f15ba140-40c9-46bd-b882-aecedb08c40d`
- Tuesday, Oct 6, 2026, 2:18 AM (UTC+8)

```
updateSupplierHoursByIdService

ONLY fill in  THS FUNCTION 

Ask me before making any other changes in @supplier-service/src/data/schema.ts  or @supplier-service/src/data/opening-hours-schema.ts
```

Files changed:
- `supplier-service/src/database/supplier-repository.ts`

---

## 5. Add sample commands for supplier hours

- Transcript: `44fdb43d-7faf-4d8e-b0e6-b38f4b68dd1d`
- Tuesday, Oct 6, 2026, 9:21 AM (UTC+8)

```
Based on the new update supplier hours and add can you update the @supplier-service/README.md  with sample commands?
```

Files changed:
- `supplier-service/README.md`
