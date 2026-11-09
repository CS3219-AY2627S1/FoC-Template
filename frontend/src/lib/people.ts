// AI-assisted (Claude Opus 5.5): display names and suppliers for orders, fetched
// once per id and shared across pages. Reviewed by authors.
import { useEffect, useState } from "react";
import { suppliersApi, usersApi } from "./api";
import type { Supplier } from "./types";

const names = new Map<string, string | null>();
const suppliers = new Map<string, Supplier | null>();
const inFlight = new Map<string, Promise<void>>();

function once(key: string, load: () => Promise<void>): Promise<void> {
  let p = inFlight.get(key);
  if (!p) {
    p = load().finally(() => inFlight.delete(key));
    inFlight.set(key, p);
  }
  return p;
}

function loadName(id: string): Promise<void> {
  return once(`user:${id}`, () =>
    usersApi
      .publicProfile(id)
      .then((u) => void names.set(id, u.display_name))
      .catch(() => void names.set(id, null)),
  );
}

function loadSupplier(id: string): Promise<void> {
  return once(`supplier:${id}`, () =>
    suppliersApi
      .get(id)
      .then((s) => void suppliers.set(id, s))
      .catch(() => void suppliers.set(id, null)),
  );
}

function uniq(ids: (string | null | undefined)[]): string[] {
  return [...new Set(ids.filter((id): id is string => Boolean(id)))].sort();
}

/** Display names by user id; missing while loading, null if the lookup failed. */
export function useDisplayNames(
  userIds: (string | null | undefined)[],
): Record<string, string | null | undefined> {
  const key = uniq(userIds).join(",");
  const [, setVersion] = useState(0);

  useEffect(() => {
    if (!key) return;
    let alive = true;
    const missing = key.split(",").filter((id) => !names.has(id));
    if (missing.length) {
      void Promise.all(missing.map(loadName)).then(() => alive && setVersion((v) => v + 1));
    }
    return () => {
      alive = false;
    };
  }, [key]);

  const out: Record<string, string | null | undefined> = {};
  for (const id of key ? key.split(",") : []) out[id] = names.get(id);
  return out;
}

/** Suppliers by id; missing while loading, null if it could not be read. */
export function useSuppliers(
  supplierIds: (string | null | undefined)[],
): Record<string, Supplier | null | undefined> {
  const key = uniq(supplierIds).join(",");
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

/**
 * How to show a person on an order: "You" for the signed-in user, their display
 * name when known, otherwise the fallback (their role).
 */
export function personLabel(
  userId: string | null | undefined,
  meId: string | undefined,
  nameMap: Record<string, string | null | undefined>,
  fallback: string,
): string {
  if (!userId) return fallback;
  if (userId === meId) return "You";
  return nameMap[userId] ?? fallback;
}
