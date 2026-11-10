// AI-assisted (Claude Opus 5.5): order details for order chats, fetched once per
// order from order-service through the gateway. Reviewed by authors.
import { useEffect, useRef, useState } from "react";
import { ordersApi, type OrderResponse } from "../api";

const cache = new Map<string, OrderResponse | null>();
const inFlight = new Map<string, Promise<void>>();

function load(orderId: string): Promise<void> {
  let p = inFlight.get(orderId);
  if (!p) {
    p = ordersApi
      .get(orderId)
      .then((order) => void cache.set(orderId, order))
      .catch(() => void cache.set(orderId, null))
      .finally(() => inFlight.delete(orderId));
    inFlight.set(orderId, p);
  }
  return p;
}

/**
 * Orders by id (null while loading or if it cannot be read). Changing `revision`
 * refetches them, e.g. when an order event arrives in the chat.
 */
export function useOrders(
  orderIds: (string | null)[],
  revision: string | number = 0,
): Record<string, OrderResponse | null> {
  const key = [...new Set(orderIds.filter((id): id is string => Boolean(id)))].sort().join(",");
  const [, setVersion] = useState(0);
  const lastRevision = useRef(revision);

  useEffect(() => {
    if (!key) return;
    let alive = true;
    if (lastRevision.current !== revision) {
      lastRevision.current = revision;
      key.split(",").forEach((id) => cache.delete(id));
    }
    const missing = key.split(",").filter((id) => !cache.has(id));
    if (missing.length) {
      void Promise.all(missing.map(load)).then(() => alive && setVersion((v) => v + 1));
    }
    return () => {
      alive = false;
    };
  }, [key, revision]);

  const out: Record<string, OrderResponse | null> = {};
  for (const id of key ? key.split(",") : []) out[id] = cache.get(id) ?? null;
  return out;
}
