// A student's position is personal, even rounded to about 100 m as the web client sends it, so
// it never reaches the request log.
export function withoutPosition(url: string): string {
  return url.replace(/([?&]near=)[^&]*/g, '$1hidden')
}

interface LoggedRequest {
  method?: string
  url?: string
  ip?: string
}

// Fastify's own request serializer, minus the position.
export function requestForLog(request: LoggedRequest) {
  return { method: request.method, url: withoutPosition(request.url ?? ''), remoteAddress: request.ip }
}
