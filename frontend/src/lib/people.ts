// AI-assisted (Claude Opus 5.5): suppliers for orders, fetched once per id and
// shared across pages. Participant names come with the order detail from
// order-service. Reviewed by authors.
import { useEffect, useState } from "react";
import { suppliersApi } from "./api";
import type { Supplier } from "./types";

const suppliers = new Map<string, Supplier | null>();
const inFlight = new Map<string, Promise<void>>();

function loadSupplier(id: string): Promise<void> {
  let p = inFlight.get(id);
  if (!p) {
    p = suppliersApi
      .get(id)
      .then((s) => void suppliers.set(id, s))
      .catch(() => void suppliers.set(id, null))
      .finally(() => inFlight.delete(id));
    inFlight.set(id, p);
  }
  return p;
}

/** Suppliers by id; missing while loading, null if it could not be read. */
export function useSuppliers(
  supplierIds: (string | null | undefined)[],
): Record<string, Supplier | null | undefined> {
  const key = [...new Set(supplierIds.filter((id): id is string => Boolean(id)))]
    .sort()
    .join(",");
  const [, setVersion] = useState(0);

  useEffect(() => {
    if (!key) return;
    let alive = true;
    const missing = key.split(",").filter((id) => !suppliers.has(id));
    if (missing.length) {
      void Promise.all(missing.map(loadSupplier)).then(
        () => alive && setVersion((v) => v + 1),
      );
    }
    return () => {
      alive = false;
    };
  }, [key]);

  const out: Record<string, Supplier | null | undefined> = {};
  for (const id of key ? key.split(",") : []) out[id] = suppliers.get(id);
  return out;
}
