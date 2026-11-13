// Liveness endpoint for Docker/Cloud Run health checks. Not under /api, which the gateway
// reserves for backend services, and not /healthz: Cloud Run reserves paths ending in "z".
export function GET() {
  return Response.json({ status: "UP" })
}
