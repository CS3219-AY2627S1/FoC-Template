import { useQuery } from '@tanstack/react-query'

// Settings the gateway hands out from its environment (GET /api/config), so the same image
// fits every place it runs (N6.2).
export type ClientConfig = {
  // The test inbox (Mailpit) where every email lands: a full address locally, a path such as /mail/
  // where it is served on the same host as the app. Empty where real emails go out.
  devMailboxUrl: string
}

const noConfig: ClientConfig = { devMailboxUrl: '' }

// Missing or unreadable settings mean "nothing extra to show", never an error for the user.
async function fetchClientConfig(signal: AbortSignal): Promise<ClientConfig> {
  try {
    const response = await fetch('/api/config', { signal, headers: { Accept: 'application/json' } })
    if (!response.ok) return noConfig
    const body: unknown = await response.json()
    const url = typeof body === 'object' && body !== null && 'devMailboxUrl' in body ? body.devMailboxUrl : ''
    // Only a web address or a path on this host can become a link. "//" would lead to another host.
    return { devMailboxUrl: typeof url === 'string' && /^(https?:\/\/|\/(?!\/))/.test(url) ? url : '' }
  } catch (error) {
    if (signal.aborted) throw error
    return noConfig
  }
}

export function useClientConfig() {
  return useQuery({
    queryKey: ['config'],
    queryFn: ({ signal }) => fetchClientConfig(signal),
    staleTime: Infinity,
    retry: false,
  })
}
