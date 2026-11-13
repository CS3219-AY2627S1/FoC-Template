import { afterEach, describe, expect, it } from 'vitest'
import type { Server } from 'node:http'
import { once } from 'node:events'
import { createApp } from '../src/app.js'

let server: Server | undefined

afterEach(async () => {
  if (server) await new Promise<void>((resolve) => server!.close(() => resolve()))
  server = undefined
})

describe('errand API Kafka readiness', () => {
  it('stays live but reports unready until the publisher connects', async () => {
    let kafkaReady = false
    server = createApp(() => kafkaReady).listen(0, '127.0.0.1')
    await once(server, 'listening')
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Expected a TCP listener')
    const baseUrl = `http://127.0.0.1:${address.port}`

    expect((await fetch(`${baseUrl}/health`)).status).toBe(200)
    expect((await fetch(`${baseUrl}/healthz`)).status).toBe(503)

    kafkaReady = true
    expect((await fetch(`${baseUrl}/healthz`)).status).toBe(200)
  })
})
