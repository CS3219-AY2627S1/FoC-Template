import * as jose from "npm:jose@6";

// the order service only verifies access tokens, the user service signs them
// with the shared JWT_ACCESS_SECRET (same check as the supplier service)
const accessSecret = Deno.env.get("JWT_ACCESS_SECRET") ?? "";
if (!accessSecret) {
  console.warn("JWT_ACCESS_SECRET is not set, every request will be rejected with 401");
}
const accessKey = new TextEncoder().encode(accessSecret);
const ISSUER = "user-service";

export interface AuthenticatedUser {
  // the token's "sub", a user id from the user service
  id: number;
  // e.g. ["requestor", "courier", "admin"]
  roles: string[];
}

function unauthorized(error: string) {
  return new Response(JSON.stringify({ error }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Checks the "Authorization: Bearer <token>" header.
 * Returns the caller, or a 401 Response to send back as is
 * (the frontend refreshes the token and retries on 401).
 */
export async function authenticate(req: Request): Promise<AuthenticatedUser | Response> {
  const header = req.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) {
    return unauthorized("missing bearer token");
  }

  try {
    const { payload } = await jose.jwtVerify(header.slice("Bearer ".length).trim(), accessKey, {
      algorithms: ["HS256"],
      issuer: ISSUER,
    });
    // user ids are integers, sent as text in "sub" (e.g. "7")
    const id = Number(payload.sub);
    if (!Number.isInteger(id) || id <= 0) {
      return unauthorized("access token is of invalid format");
    }
    const roles = Array.isArray(payload.role)
      ? payload.role.filter((r): r is string => typeof r === "string")
      : [];
    return { id, roles };
  } catch (e) {
    return unauthorized(e instanceof jose.errors.JWTExpired ? "access token expired" : "access token is of invalid format");
  }
}
