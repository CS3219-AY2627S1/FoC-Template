/** Group screen-space neighbours, including chains, in their original order. */
export function groupOverlappingPoints<T>(
  items: T[],
  getPoint: (item: T) => { x: number; y: number },
  radius = 24,
): T[][] {
  const remaining = new Set(items)
  const points = new Map(items.map((item) => [item, getPoint(item)]))
  const groups: T[][] = []
  for (const first of remaining) {
    const group = [first]
    remaining.delete(first)
    for (let index = 0; index < group.length; index += 1) {
      const point = points.get(group[index])!
      for (const candidate of remaining) {
        const other = points.get(candidate)!
        if (Math.hypot(point.x - other.x, point.y - other.y) <= radius) {
          group.push(candidate)
          remaining.delete(candidate)
        }
      }
    }
    groups.push(group)
  }
  return groups
}
