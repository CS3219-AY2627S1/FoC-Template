import type { useSession } from '@/api/user/session'
import { ErrorState } from '@/components/ErrorState'
import { LoadingState } from '@/components/LoadingState'

type SessionPendingProps = {
  session: ReturnType<typeof useSession>
}

// What the guards show while the session is not known yet: the check is running, or it failed
// (the user-service cannot be reached) and can be tried again.
export function SessionPending({ session }: SessionPendingProps) {
  if (session.isError && !session.isFetching) {
    return (
      <main id="main" className="mx-auto grid min-h-dvh w-full max-w-md grid-cols-1 content-center px-4 py-12">
        <ErrorState error={session.error} onRetry={() => session.refetch()} />
      </main>
    )
  }
  return <LoadingState variant="page" label="Checking your session" />
}
