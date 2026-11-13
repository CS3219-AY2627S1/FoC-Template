import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useAudioRecorder } from '../hooks/useAudioRecorder'

const stopTrack = vi.fn()
const media = {
  getTracks: () => [{ stop: stopTrack }],
} as unknown as MediaStream
class Recorder {
  static isTypeSupported = (mime: string) => mime.includes('webm')
  state = 'inactive'
  mimeType = 'audio/webm'
  ondataavailable?: (event: { data: Blob }) => void
  onstop?: () => void
  onerror?: () => void
  start() {
    this.state = 'recording'
  }
  stop() {
    this.state = 'inactive'
    this.ondataavailable?.({ data: new Blob(['audio']) })
    this.onstop?.()
  }
}
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('MediaRecorder', Recorder)
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn().mockResolvedValue(media) },
  })
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})
it('stops microphone and returns correctly named audio on stop', async () => {
  const complete = vi.fn()
  const { result } = renderHook(() => useAudioRecorder(complete))
  await act(() => result.current.start())
  expect(result.current.recording).toBe(true)
  act(() => result.current.stop())
  expect(stopTrack).toHaveBeenCalled()
  expect(complete.mock.calls[0][0].name).toBe('recording.webm')
})
it('cancellation and unmount discard audio and release microphone', async () => {
  const complete = vi.fn()
  const { result, unmount } = renderHook(() => useAudioRecorder(complete))
  await act(() => result.current.start())
  act(() => result.current.cancel())
  expect(result.current.recording).toBe(false)
  expect(complete).not.toHaveBeenCalled()
  await act(() => result.current.start())
  unmount()
  expect(stopTrack).toHaveBeenCalledTimes(2)
  expect(complete).not.toHaveBeenCalled()
})
it('cancels pending permission without leaking its eventual stream', async () => {
  let grant!: (stream: MediaStream) => void
  vi.mocked(navigator.mediaDevices.getUserMedia).mockReturnValue(
    new Promise((resolve) => {
      grant = resolve
    }),
  )
  const complete = vi.fn()
  const { result } = renderHook(() => useAudioRecorder(complete))
  let pending!: Promise<void>
  act(() => {
    pending = result.current.start()
  })
  act(() => result.current.cancel())
  await act(async () => {
    grant(media)
    await pending
  })
  expect(stopTrack).toHaveBeenCalledTimes(1)
  expect(result.current.recording).toBe(false)
  expect(complete).not.toHaveBeenCalled()
})
it('handles denied permission and automatically stops at sixty seconds', async () => {
  vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValueOnce(
    new Error('denied'),
  )
  const complete = vi.fn()
  const { result } = renderHook(() => useAudioRecorder(complete))
  await act(() => result.current.start())
  await waitFor(() =>
    expect(result.current.error).toContain('Microphone access failed'),
  )
  vi.useFakeTimers()
  await act(() => result.current.start())
  act(() => vi.advanceTimersByTime(60_000))
  expect(result.current.recording).toBe(false)
  expect(complete).toHaveBeenCalledTimes(1)
})
