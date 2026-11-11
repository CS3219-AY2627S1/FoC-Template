/**
 * AI Assistance Disclosure
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-11-02
 * Scope: Generated the match ranking that orders search results by how
 *        closely a name matches what was typed.
 * Reviewed by Ngooi Jun Sen.
 */

/**
 * How closely a result matches the search, lower first:
 *   0  the name is exactly the search
 *   1  the name starts with it
 *   2  a word in the name starts with it ("lim" in "Bob Lim")
 *   3  the name contains it anywhere
 *   4  only another field matches (a building, an email)
 * Infinity when nothing matches. Case-insensitive.
 */
export function matchRank(needle: string, name: string, others: (string | null | undefined)[] = []): number {
  const query = needle.trim().toLowerCase();
  if (query === '') return 0;

  const subject = name.toLowerCase();
  if (subject === query) return 0;
  if (subject.startsWith(query)) return 1;
  if (subject.split(/[\s\-_.,()&/]+/).some((word) => word.startsWith(query))) return 2;
  if (subject.includes(query)) return 3;
  if (others.some((other) => other?.toLowerCase().includes(query))) return 4;
  return Infinity;
}

/**
 * Sorts by match rank, keeping the given order within each rank (a stable
 * sort), so the page's own sort still applies among equally close matches.
 */
export function byMatch<T>(items: T[], needle: string, rank: (item: T, needle: string) => number): T[] {
  if (needle.trim() === '') return items;
  return items
    .map((item, index) => ({ item, index, rank: rank(item, needle) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((entry) => entry.item);
}
