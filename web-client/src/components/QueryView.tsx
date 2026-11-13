import type { UseQueryResult } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { ApiError } from '@/lib/http'
import { ErrorState } from './ErrorState'
import { LoadingState } from './LoadingState'
import { Notice } from './Notice'

// Both or neither: a list has to say when it counts as empty and what to show then (N5.3).
type EmptyProps<T> =
  | { isEmpty: (data: T) => boolean; empty: ReactNode }
  | { isEmpty?: undefined; empty?: undefined }

type QueryViewProps<T> = EmptyProps<T> & {
  query: UseQueryResult<T>
  // Read out by screen readers while loading, e.g. "Loading suppliers" (N5.2).
  loadingLabel: string
  children: (data: T) => ReactNode
}

const offline = new ApiError(0, 'NETWORK_ERROR', 'You are offline. This loads as soon as the connection is back.')

export function QueryView<T>({ query, loadingLabel, isEmpty, empty, children }: QueryViewProps<T>) {
  // Data is checked first on purpose: a failed refresh in the background must never
  // replace data the user is already looking at.
  if (query.data === undefined) {
    if (query.isError && !query.isFetching) {
      return <ErrorState error={query.error} onRetry={() => query.refetch()} />
    }
    if (query.fetchStatus === 'paused') return <ErrorState error={offline} />
    return <LoadingState label={loadingLabel} />
  }

  return (
    <>
      {query.isError && (
        <Notice tone="danger" role="alert" title="Could not refresh">
          {query.error.message} Showing what was loaded before.
        </Notice>
      )}
      {isEmpty?.(query.data) ? empty : children(query.data)}
    </>
  )
}