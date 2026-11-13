// A page is 1 or more; a page size is 1..100 and defaults to 20, so a bad or hostile query cannot
// ask for a negative slice or the whole collection at once. Pure, so the controllers stay thin and
// this is the one place the limits live.
export function paginationParams(query: { page?: unknown; pageSize?: unknown }): { page: number; pageSize: number } {
    const page = Math.max(1, Math.trunc(Number(query.page)) || 1);
    const pageSize = Math.min(100, Math.max(1, Math.trunc(Number(query.pageSize)) || 20));
    return { page, pageSize };
}
