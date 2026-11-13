import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ErrandForm } from '../components/ErrandForm/ErrandForm'
import { applyDraft, draftFromForm } from '../schemas/errandAi.schema'
import * as api from '../api/errandAi.api'
import { setAccessToken } from '#/features/auth/lib/accessTokenStore'
import type { AiCapabilities, AiChatResponse } from '../schemas/errandAi.schema'
import type { CreateErrandValues } from '../schemas/createErrand.schema'

vi.mock('../api/errandAi.api', () => ({
  getErrandAiCapabilities: vi.fn(),
  chatWithErrandAi: vi.fn(),
  transcribeErrandAudio: vi.fn(),
}))
vi.mock('#/features/suppliers/hooks/usePickupLocations', () => ({
  usePickupLocations: () => ({ data: [], isSuccess: true }),
}))
const pickup = {
  id: '8e1f0000-0000-4000-8000-000000000002',
  name: 'Campus Cafe',
  address: 'COM1',
}
const initial: CreateErrandValues = {
  pickup: null,
  deliveryLocation: '',
  description: '',
  notes: '',
  creditReward: 5,
  expiryMinutes: 60,
}
const result: AiChatResponse = {
  message: 'Ready to review with 10 credits and 2 hours.',
  draft: {
    pickup,
    deliveryLocation: 'COM3',
    description: 'Coffee',
    notes: 'No sugar',
    creditReward: 10,
    expiryMinutes: 120,
  },
  missingFields: [],
  supplierChoices: [],
}
const clients: Array<QueryClient> = []
type User = ReturnType<typeof userEvent.setup>

function setup(values = initial, availableCredits?: number) {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  })
  clients.push(client)
  const onReview = vi.fn()
  const view = render(
    <QueryClientProvider client={client}>
      <ErrandForm
        values={values}
        availableCredits={availableCredits}
        onReview={onReview}
      />
    </QueryClientProvider>,
  )
  return { ...view, onReview, user: userEvent.setup() }
}
beforeEach(() => {
  vi.resetAllMocks()
  Element.prototype.scrollIntoView = vi.fn()
  setAccessToken(
    `header.${btoa(JSON.stringify({ sub: 'requester', roles: ['USER'] }))}.signature`,
  )
  vi.mocked(api.chatWithErrandAi).mockResolvedValue(result)
  vi.mocked(api.getErrandAiCapabilities).mockResolvedValue({
    chatEnabled: true,
    voiceEnabled: true,
  })
})
afterEach(() => {
  clients.forEach((client) => client.clear())
  clients.length = 0
  setAccessToken(null)
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
const messageInput = () =>
  screen.getByRole('textbox', { name: 'Message to AI assistant' })

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((complete) => {
    resolve = complete
  })
  return { promise, resolve }
}

async function openAssistant(user: User) {
  await user.click(
    await screen.findByRole('button', { name: 'Create with AI' }),
  )
}

async function sendMessage(user: User, text: string) {
  fireEvent.change(messageInput(), { target: { value: text } })
  await user.click(screen.getByRole('button', { name: 'Send message' }))
}

async function chat(user: User, text = 'Coffee to COM3') {
  await openAssistant(user)
  await sendMessage(user, text)
  await screen.findByRole('button', { name: 'Fill into form' })
}
it('uses form values, fills only on request, and passes the draft to review', async () => {
  const { user, onReview } = setup({ ...initial, description: 'Lunch' })
  await chat(user)
  expect(vi.mocked(api.chatWithErrandAi).mock.calls[0][0].draft).toMatchObject({
    description: 'Lunch',
    creditReward: 5,
    expiryMinutes: 60,
  })
  expect(screen.getByLabelText('Delivery location *')).toHaveValue('')
  expect(onReview).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: 'Fill into form' }))
  expect(screen.getByLabelText('Delivery location *')).toHaveValue('COM3')
  expect(screen.getByLabelText('Courier reward *')).toHaveValue(10)
  await user.click(screen.getByRole('button', { name: 'Continue' }))
  await waitFor(() =>
    expect(onReview).toHaveBeenCalledWith(result.draft, expect.anything()),
  )
})
it('requires an AI-filled reward to fit the available balance before review', async () => {
  const { user, onReview } = setup(initial, 5)
  await chat(user)
  await user.click(screen.getByRole('button', { name: 'Fill into form' }))
  const reward = screen.getByLabelText('Courier reward *')
  expect(reward).toHaveValue(10)
  await user.click(screen.getByRole('button', { name: 'Continue' }))
  await waitFor(() => expect(reward).toHaveAttribute('aria-invalid', 'true'))
  expect(onReview).not.toHaveBeenCalled()
  await user.clear(reward)
  await user.type(reward, '5')
  await user.click(screen.getByRole('button', { name: 'Continue' }))
  await waitFor(() =>
    expect(onReview).toHaveBeenCalledWith(
      { ...result.draft, creditReward: 5 },
      expect.anything(),
    ),
  )
})
it('preserves unknown draft fields while applying explicit text clears', () => {
  const values = {
    ...initial,
    pickup,
    deliveryLocation: 'Old delivery',
    description: 'Lunch',
    notes: 'Old notes',
  }
  expect(
    applyDraft(values, {
      ...draftFromForm(initial),
      deliveryLocation: '',
      creditReward: null,
      expiryMinutes: null,
    }),
  ).toEqual({ ...values, deliveryLocation: '', notes: '' })
})
it('sends supplier selection through chat and retries without duplicate messages', async () => {
  vi.mocked(api.chatWithErrandAi)
    .mockResolvedValueOnce({
      ...result,
      supplierChoices: [pickup],
      draft: { ...result.draft, pickup: null },
    })
    .mockRejectedValueOnce(new Error('unavailable'))
    .mockResolvedValueOnce(result)
  const { user } = setup()
  await chat(user)
  await user.click(screen.getByRole('button', { name: /Campus Cafe/ }))
  await screen.findByRole('button', { name: 'Retry message' })
  const request = vi.mocked(api.chatWithErrandAi).mock.calls[1][0]
  expect(request.selectedSupplierId).toBe(pickup.id)
  expect(request.history).toHaveLength(2)
  expect(
    request.history.some((message) => message.content === 'Choose Campus Cafe'),
  ).toBe(false)
  await user.click(screen.getByRole('button', { name: 'Retry message' }))
  await waitFor(() => expect(api.chatWithErrandAi).toHaveBeenCalledTimes(3))
  expect(vi.mocked(api.chatWithErrandAi).mock.calls[2][0]).toEqual(request)
  expect(
    within(screen.getByRole('log')).getAllByText('Choose Campus Cafe'),
  ).toHaveLength(1)
})
it('keeps input on failure and aborts pending requests on unmount', async () => {
  vi.mocked(api.chatWithErrandAi).mockRejectedValueOnce(new Error('no key'))
  const { user, unmount } = setup()
  await openAssistant(user)
  await sendMessage(user, 'Coffee')
  await screen.findByRole('button', { name: 'Retry message' })
  expect(messageInput()).toHaveValue('Coffee')
  const pending = deferred<AiChatResponse>()
  vi.mocked(api.chatWithErrandAi).mockReturnValue(pending.promise)
  await user.click(screen.getByRole('button', { name: 'Retry message' }))
  const signal = vi.mocked(api.chatWithErrandAi).mock.calls[1][1]
  unmount()
  expect(signal.aborted).toBe(true)
  await act(async () => pending.resolve(result))
})
it('Enter in the assistant does not submit the errand form', async () => {
  const { user, onReview } = setup(result.draft as CreateErrandValues)
  await openAssistant(user)
  const input = messageInput()
  fireEvent.change(input, { target: { value: 'Change notes' } })
  fireEvent.keyDown(input, { key: 'Enter' })
  await waitFor(() => expect(api.chatWithErrandAi).toHaveBeenCalledTimes(1))
  expect(onReview).not.toHaveBeenCalled()
})

function mockMicrophone(
  onStop: (deliver: () => void) => void = (deliver) => deliver(),
) {
  const stopTrack = vi.fn()
  const stream = { getTracks: () => [{ stop: stopTrack }] }
  class Recorder {
    static isTypeSupported = () => true
    state = 'inactive'
    mimeType = 'audio/webm'
    ondataavailable?: (event: { data: Blob }) => void
    onstop?: () => void
    start() {
      this.state = 'recording'
    }
    stop() {
      this.state = 'inactive'
      onStop(() => {
        this.ondataavailable?.({ data: new Blob(['audio']) })
        this.onstop?.()
      })
    }
  }
  vi.stubGlobal('MediaRecorder', Recorder)
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn().mockResolvedValue(stream) },
  })
  return stopTrack
}
it('collapsing the panel cancels recording without uploading and preserves the composer', async () => {
  const stopTrack = mockMicrophone()
  const { user } = setup()
  await openAssistant(user)
  fireEvent.change(messageInput(), { target: { value: 'Keep this' } })
  await user.click(screen.getByRole('button', { name: 'Record voice message' }))
  await screen.findByRole('button', { name: 'Stop recording' })
  await user.click(screen.getByRole('button', { name: 'Close AI assistant' }))
  expect(stopTrack).toHaveBeenCalledTimes(1)
  expect(api.transcribeErrandAudio).not.toHaveBeenCalled()
  await openAssistant(user)
  expect(messageInput()).toHaveValue('Keep this')
  expect(
    screen.queryByRole('button', { name: 'Stop recording' }),
  ).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Record voice message' }))
  await screen.findByRole('button', { name: 'Stop recording' })
  await user.keyboard('{Escape}')
  expect(
    screen.queryByRole('dialog', { name: 'Create with AI' }),
  ).not.toBeInTheDocument()
  expect(stopTrack).toHaveBeenCalledTimes(2)
  expect(api.transcribeErrandAudio).not.toHaveBeenCalled()
})
it('keeps the composer locked through delayed audio delivery and transcription', async () => {
  let deliver!: () => void
  const stopTrack = mockMicrophone((finish) => {
    deliver = finish
  })
  const transcript = deferred<string>()
  vi.mocked(api.transcribeErrandAudio).mockReturnValue(transcript.promise)
  const { user, onReview } = setup()
  await openAssistant(user)
  fireEvent.change(messageInput(), { target: { value: 'Please' } })
  await user.click(screen.getByRole('button', { name: 'Record voice message' }))
  await user.click(
    await screen.findByRole('button', { name: 'Stop recording' }),
  )
  expect(stopTrack).toHaveBeenCalledTimes(1)
  expect(
    screen.queryByRole('button', { name: 'Send message' }),
  ).not.toBeInTheDocument()
  expect(api.transcribeErrandAudio).not.toHaveBeenCalled()
  act(deliver)
  const send = screen.getByRole('button', { name: 'Send message' })
  expect(send).toBeDisabled()
  expect(messageInput()).toBeDisabled()
  await user.click(send)
  expect(api.transcribeErrandAudio).toHaveBeenCalledTimes(1)
  await act(async () => transcript.resolve('Coffee to COM3'))
  await waitFor(() =>
    expect(messageInput()).toHaveValue('Please\nCoffee to COM3'),
  )
  expect(api.chatWithErrandAi).not.toHaveBeenCalled()
  expect(onReview).not.toHaveBeenCalled()
  expect(screen.getByLabelText('Delivery location *')).toHaveValue('')
  expect(messageInput()).toBeEnabled()
  expect(send).toBeEnabled()
  await user.click(send)
  expect(vi.mocked(api.chatWithErrandAi).mock.calls[0][0].message).toBe(
    'Please\nCoffee to COM3',
  )
})

it('discards the final audio when cancelled after stop but before delivery', async () => {
  let deliver!: () => void
  const stopTrack = mockMicrophone((finish) => {
    deliver = finish
  })
  const { user } = setup()
  await openAssistant(user)
  fireEvent.change(messageInput(), { target: { value: 'Keep this' } })
  await user.click(screen.getByRole('button', { name: 'Record voice message' }))
  await user.click(
    await screen.findByRole('button', { name: 'Stop recording' }),
  )
  await user.click(screen.getByRole('button', { name: 'Cancel' }))
  act(deliver)
  expect(stopTrack).toHaveBeenCalledTimes(1)
  expect(api.transcribeErrandAudio).not.toHaveBeenCalled()
  expect(messageInput()).toHaveValue('Keep this')
  expect(screen.getByRole('button', { name: 'Send message' })).toBeEnabled()
})

it('acknowledges form changes without changing the draft or bypassing overwrite confirmation', async () => {
  const { user } = setup()
  await chat(user)
  await user.click(screen.getByRole('button', { name: 'Close AI assistant' }))
  fireEvent.change(screen.getByLabelText('Delivery location *'), {
    target: { value: 'COM2' },
  })
  await openAssistant(user)
  await user.click(
    screen.getByRole('button', { name: 'Continue current draft' }),
  )
  await user.click(screen.getByRole('button', { name: 'Close AI assistant' }))
  await openAssistant(user)
  expect(
    screen.queryByRole('button', { name: 'Continue current draft' }),
  ).not.toBeInTheDocument()
  await sendMessage(user, 'Reward 10')
  await waitFor(() => expect(api.chatWithErrandAi).toHaveBeenCalledTimes(2))
  expect(
    vi.mocked(api.chatWithErrandAi).mock.calls[1][0].draft.deliveryLocation,
  ).toBe('COM3')
  await user.click(screen.getByRole('button', { name: 'Fill into form' }))
  await user.click(screen.getByRole('button', { name: 'Keep my edits' }))
  expect(screen.getByLabelText('Delivery location *')).toHaveValue('COM2')
  fireEvent.change(screen.getByLabelText('Delivery location *'), {
    target: { value: 'COM1' },
  })
  await sendMessage(user, 'Next')
  expect(
    screen.getByRole('button', { name: 'Continue current draft' }),
  ).toBeInTheDocument()
  expect(api.chatWithErrandAi).toHaveBeenCalledTimes(2)
  await user.click(screen.getByRole('button', { name: 'Fill into form' }))
  await user.click(screen.getByRole('button', { name: 'Apply draft' }))
  expect(screen.getByLabelText('Delivery location *')).toHaveValue('COM3')
})

it.each(['message', 'supplier', 'retry'] as const)(
  'checks form changes before %s and restarts without losing unsent text',
  async (action) => {
    vi.mocked(api.chatWithErrandAi).mockResolvedValueOnce({
      ...result,
      supplierChoices: [pickup],
    })
    const { user } = setup()
    await chat(user)
    if (action === 'retry') {
      vi.mocked(api.chatWithErrandAi).mockRejectedValueOnce(
        new Error('unavailable'),
      )
      await user.click(screen.getByRole('button', { name: /Campus Cafe/ }))
      await screen.findByRole('button', { name: 'Retry message' })
    }
    const callsBefore = vi.mocked(api.chatWithErrandAi).mock.calls.length
    fireEvent.change(screen.getByLabelText('Delivery location *'), {
      target: { value: 'COM2' },
    })
    fireEvent.change(messageInput(), { target: { value: 'Reward 10' } })
    const name =
      action === 'message'
        ? 'Send message'
        : action === 'supplier'
          ? /Campus Cafe/
          : 'Retry message'
    await user.click(screen.getByRole('button', { name }))
    expect(api.chatWithErrandAi).toHaveBeenCalledTimes(callsBefore)
    await user.click(screen.getByRole('button', { name: 'Restart from form' }))
    expect(messageInput()).toHaveValue('Reward 10')
    expect(screen.getByRole('log')).toBeEmptyDOMElement()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Retry message' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Fill into form' }),
    ).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Send message' }))
    await waitFor(() =>
      expect(api.chatWithErrandAi).toHaveBeenCalledTimes(callsBefore + 1),
    )
    expect(vi.mocked(api.chatWithErrandAi).mock.lastCall?.[0]).toMatchObject({
      message: 'Reward 10',
      history: [],
      draft: { deliveryLocation: 'COM2' },
      selectedSupplierId: undefined,
    })
    await user.click(screen.getByRole('button', { name: 'Fill into form' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  },
)

it('prevents restarting during an outstanding chat request', async () => {
  const pending = deferred<AiChatResponse>()
  vi.mocked(api.chatWithErrandAi).mockReturnValue(pending.promise)
  const { user } = setup()
  await openAssistant(user)
  await sendMessage(user, 'Coffee')
  await user.click(screen.getByRole('button', { name: 'Close AI assistant' }))
  fireEvent.change(screen.getByLabelText('Delivery location *'), {
    target: { value: 'COM2' },
  })
  await openAssistant(user)
  expect(
    screen.getByRole('button', { name: 'Restart from form' }),
  ).toBeDisabled()
  await act(async () => pending.resolve(result))
  await user.click(screen.getByRole('button', { name: 'Restart from form' }))
  expect(screen.getByRole('log')).toBeEmptyDOMElement()
})

it('prevents restarting while requesting a microphone, recording, or transcribing', async () => {
  const stopTrack = mockMicrophone()
  const permission = deferred<MediaStream>()
  vi.mocked(navigator.mediaDevices.getUserMedia).mockReturnValue(
    permission.promise,
  )
  const transcript = deferred<string>()
  vi.mocked(api.transcribeErrandAudio).mockReturnValue(transcript.promise)
  const { user } = setup()
  await chat(user)
  fireEvent.change(screen.getByLabelText('Delivery location *'), {
    target: { value: 'COM2' },
  })
  await sendMessage(user, 'Next')
  await user.click(screen.getByRole('button', { name: 'Record voice message' }))
  expect(messageInput()).toBeDisabled()
  expect(
    screen.getByRole('button', { name: 'Restart from form' }),
  ).toBeDisabled()
  await act(async () =>
    permission.resolve({
      getTracks: () => [{ stop: stopTrack }],
    } as unknown as MediaStream),
  )
  expect(
    screen.getByRole('button', { name: 'Restart from form' }),
  ).toBeDisabled()
  await user.click(screen.getByRole('button', { name: 'Stop recording' }))
  expect(
    screen.getByRole('button', { name: 'Restart from form' }),
  ).toBeDisabled()
  await act(async () => transcript.resolve('Coffee'))
  await user.click(screen.getByRole('button', { name: 'Restart from form' }))
  expect(messageInput()).toHaveValue('Next\nCoffee')
  expect(stopTrack).toHaveBeenCalledTimes(1)
})

it('offers text-only chat when voice is disabled', async () => {
  vi.mocked(api.getErrandAiCapabilities).mockResolvedValue({
    chatEnabled: true,
    voiceEnabled: false,
  })
  const { user } = setup()
  await chat(user)
  expect(
    screen.queryByRole('button', { name: 'Record voice message' }),
  ).not.toBeInTheDocument()
})

it.each(['disabled', 'failed'] as const)(
  'keeps manual review available when AI is %s',
  async (mode) => {
    if (mode === 'failed')
      vi.mocked(api.getErrandAiCapabilities).mockRejectedValue(
        new Error('offline'),
      )
    else
      vi.mocked(api.getErrandAiCapabilities).mockResolvedValue({
        chatEnabled: false,
        voiceEnabled: false,
      })
    const { user, onReview } = setup(result.draft as CreateErrandValues)
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await waitFor(() => expect(onReview).toHaveBeenCalled())
    expect(
      screen.queryByRole('button', { name: 'Create with AI' }),
    ).not.toBeInTheDocument()
    expect(api.chatWithErrandAi).not.toHaveBeenCalled()
  },
)

it('hides the launcher while loading and discards chat state when the user changes', async () => {
  const capabilities = deferred<AiCapabilities>()
  vi.mocked(api.getErrandAiCapabilities).mockReturnValueOnce(
    capabilities.promise,
  )
  const { user } = setup()
  expect(
    screen.queryByRole('button', { name: 'Create with AI' }),
  ).not.toBeInTheDocument()
  await act(async () =>
    capabilities.resolve({ chatEnabled: true, voiceEnabled: true }),
  )
  await chat(user)
  act(() =>
    setAccessToken(
      `header.${btoa(JSON.stringify({ sub: 'another-user', roles: ['USER'] }))}.signature`,
    ),
  )
  await openAssistant(user)
  expect(screen.getByRole('log')).toBeEmptyDOMElement()
  expect(api.getErrandAiCapabilities).toHaveBeenCalledTimes(2)
})
