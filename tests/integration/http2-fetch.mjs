/*
 * AI Assistance Disclosure:
 * Tool: ChatGPT (model: GPT-6.1 Terra), date: 2026-11-06
 * Scope: Generated implementation of HTTP/2 request helper for local Floci EKS integration checks
 * Author review: Verified correctness.
 */

import { connect } from 'node:http2'

// Floci's HTTPS CloudFront emulator currently returns 502 for HTTP/1.1
// proxy requests. Use the browser-facing HTTP/2 path for EKS smoke tests.
export function fetchOverHttp2(input, options = {}) {
  const url = new URL(input)
  return new Promise((resolve, reject) => {
    const session = connect(url.origin)
    session.once('error', reject)
    const request = session.request({
      ':method': options.method ?? 'GET',
      ':path': url.pathname + url.search,
      ...options.headers,
    })
    const chunks = []
    let status = 0
    request.on('response', (headers) => { status = Number(headers[':status']) })
    request.on('data', (chunk) => chunks.push(chunk))
    request.on('error', (error) => { session.destroy(); reject(error) })
    request.on('end', () => {
      session.close()
      const body = Buffer.concat(chunks).toString('utf8')
      resolve({
        status,
        ok: status >= 200 && status < 300,
        text: async () => body,
        json: async () => JSON.parse(body),
      })
    })
    request.end(options.body)
  })
}
