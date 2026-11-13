import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { requestForLog, withoutPosition } from '../src/logging.ts'

describe('request log', () => {
  it('hides the position a list was sorted from, wherever it is in the query', () => {
    assert.equal(withoutPosition('/suppliers?near=1.297,103.776&sort=distance'), '/suppliers?near=hidden&sort=distance')
    assert.equal(withoutPosition('/suppliers?sort=distance&near=1.297%2C103.776'), '/suppliers?sort=distance&near=hidden')
  })

  it('leaves every other request as it is', () => {
    assert.equal(withoutPosition('/suppliers?q=coffee&page=2'), '/suppliers?q=coffee&page=2')
    assert.equal(withoutPosition('/suppliers?nearby=1'), '/suppliers?nearby=1')
  })

  it('logs the method, the address and the path without the position', () => {
    assert.deepEqual(requestForLog({ method: 'GET', url: '/suppliers?near=1,2', ip: '10.0.0.1' }), {
      method: 'GET',
      url: '/suppliers?near=hidden',
      remoteAddress: '10.0.0.1',
    })
  })
})
