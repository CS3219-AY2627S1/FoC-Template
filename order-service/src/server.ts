import { handleGetOrders, handleCreateOrder, handleUpdateOrderStatus } from "./routes/orders.ts";
import { authenticate } from "./auth.ts";

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);

  // every order endpoint needs a signed-in user, taken from the access token
  const user = await authenticate(req);
  if (user instanceof Response) {
    return user;
  }

  // GET /orders
  if (req.method === "GET" && url.pathname === "/orders") {
    return await handleGetOrders(req);
  }

  // POST /orders
  if (req.method === "POST" && url.pathname === "/orders") {
    return await handleCreateOrder(req, user);
  }

  // PATCH /orders/:id/status
  const statusMatch = url.pathname.match(/^\/orders\/([^/]+)\/status$/);
  if (req.method === "PATCH" && statusMatch) {
    const orderId = statusMatch[1];
    return await handleUpdateOrderStatus(req, orderId, user);
  }

  // 404 Fallback
  return new Response("Endpoint Not Found", { status: 404 });
});
