export class AuthRequestError extends Error {
  constructor(
    public readonly status?: number,
    public readonly detail?: string,
  ) {
    super(
      status === undefined ? 'Unable to reach the server' : `HTTP ${status}`,
    )
    this.name = 'AuthRequestError'
  }
}

const readErrorMessage = async (
  response: Response,
): Promise<string | undefined> => {
  const data: unknown = await response.json().catch(() => null)

  return data &&
    typeof data === 'object' &&
    'message' in data &&
    typeof data.message === 'string'
    ? data.message
    : undefined
}

export const authRequest = async <T = void>(
  path: string,
  body?: object,
  timeoutMs?: number,
): Promise<T> => {
  const controller = new AbortController()
  const timer = timeoutMs
    ? setTimeout(() => controller.abort(), timeoutMs)
    : undefined

  try {
    let response: Response
    try {
      response = await fetch('/api' + path, {
        method: 'POST',
        credentials: 'same-origin',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      })
    } catch {
      throw new AuthRequestError()
    }

    if (!response.ok) {
      const detail = await readErrorMessage(response)
      throw new AuthRequestError(response.status, detail)
    }

    if (response.status === 204) return undefined as T
    return (await response.json()) as T
  } finally {
    clearTimeout(timer)
  }
}
