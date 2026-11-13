import { NextResponse, type NextRequest } from "next/server"

// In the cloud the UI must be used through the gateway: only the gateway routes /api/* to the
// backend services, so pages opened on the frontend's own Cloud Run URL cannot load any data.
// The gateway sets X-Forwarded-Host to its own host; anything else is a direct visit and is
// redirected to the same path on the public (gateway) URL. FOC_PUBLIC_URL is unset locally.
export function proxy(request: NextRequest) {
  const publicUrl = process.env.FOC_PUBLIC_URL
  if (!publicUrl) return NextResponse.next()

  const publicHost = new URL(publicUrl).hostname
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(":")[0]
  if (forwardedHost === publicHost) return NextResponse.next()

  const target = new URL(request.nextUrl.pathname + request.nextUrl.search, publicUrl)
  return NextResponse.redirect(target, 308)
}

export const config = {
  // Health checks and build assets are served on any host.
  matcher: ["/((?!health$|_next/static|_next/image|favicon.ico).*)"],
}
