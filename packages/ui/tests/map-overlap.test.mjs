import assert from 'node:assert/strict'
import test from 'node:test'
import { groupOverlappingPoints } from '../src/map-overlap.ts'

const point = (id, x, y = 0) => ({ id, x, y })
const ids = (groups) => groups.map((group) => group.map((item) => item.id))

test('groups coincident points and neighbours at the 24px boundary, leaving distant pins alone', () => {
  const items = [point('a', 0), point('b', 0), point('c', 24), point('d', 49)]
  assert.deepEqual(ids(groupOverlappingPoints(items, (item) => item)), [['a', 'b', 'c'], ['d']])
  assert.equal(items.length, 4)
})

test('follows chains even when the linking point is encountered last', () => {
  const items = [point('a', 0), point('c', 48), point('b', 24)]
  assert.deepEqual(ids(groupOverlappingPoints(items, (item) => item)), [['a', 'b', 'c']])
})

test('uses two dimensional screen distance and splits groups when zoom spreads points apart', () => {
  const items = [point('a', 0, 0), point('b', 16, 16)]
  assert.deepEqual(ids(groupOverlappingPoints(items, (item) => item)), [['a', 'b']])
  assert.deepEqual(ids(groupOverlappingPoints(items, ({ x, y }) => ({ x: x * 2, y: y * 2 }))), [
    ['a'],
    ['b'],
  ])
  assert.deepEqual(
    groupOverlappingPoints([], (item) => item),
    [],
  )
})
