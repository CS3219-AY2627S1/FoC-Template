export const creditQueryKeys = {
  user: (userId?: string) => ['credits', userId] as const,
}
