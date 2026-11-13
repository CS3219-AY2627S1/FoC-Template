import { QueryCache, QueryClient } from '@tanstack/react-query'
import { sessionKey } from '@/api/user/session'
import { ApiError } from '@/lib/http'

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error) => {
      // A 401 on any request means the session has ended: it expired, was logged out in another
      // tab, or the account was suspended. Marking the session as guest makes RequireSession send
      // the user to the login. Mutations are left out on purpose, so a form keeps its input (N5.4).
      if (error instanceof ApiError && error.status === 401) {
        queryClient.setQueryData(sessionKey, null)
      }
    },
  }),
  defaultOptions: {
    queries: {
      // Trying again only helps without a connection (0) or on a server error (5xx).
      // A refusal like 401, 403 or 404 will not change on its own.
      retry: (failureCount, error) =>
        failureCount < 2 && error instanceof ApiError && (error.status === 0 || error.status >= 500),
    },
    mutations: {
      // Sending a form twice could create something twice.
      retry: false,
    },
  },
})
