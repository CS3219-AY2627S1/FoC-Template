import { useEffect, useRef, useState } from 'react'

const MAX_BYTES = 8 * 1024 * 1024
const MAX_SECONDS = 60

export function useAudioRecorder(onRecorded: (file: File) => void) {
  const [recording, setRecording] = useState(false)
  const [requesting, setRequesting] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [error, setError] = useState('')
  const recorder = useRef<MediaRecorder | null>(null)
  const stream = useRef<MediaStream | null>(null)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  const generation = useRef(0)
  const callback = useRef(onRecorded)
  callback.current = onRecorded

  const release = () => {
    stream.current?.getTracks().forEach((track) => track.stop())
    stream.current = null
    if (timer.current) clearInterval(timer.current)
    timer.current = null
  }
  const cancel = () => {
    generation.current += 1
    if (recorder.current?.state === 'recording') recorder.current.stop()
    recorder.current = null
    release()
    setRecording(false)
    setRequesting(false)
  }
  const stop = () => {
    if (recorder.current?.state === 'recording') recorder.current.stop()
    release()
    // Keep the composer locked until onstop receives the final audio chunk.
  }
  useEffect(
    () => () => {
      generation.current += 1
      if (recorder.current?.state === 'recording') recorder.current.stop()
      release()
    },
    [],
  )

  const start = async () => {
    if (recorder.current || requesting) return
    setError('')
    if (
      !('mediaDevices' in navigator) ||
      typeof MediaRecorder === 'undefined'
    ) {
      setError(
        'Voice input is not supported in this browser. Please type your message.',
      )
      return
    }
    const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find(
      (type) => MediaRecorder.isTypeSupported(type),
    )
    if (!mimeType) {
      setError(
        'This browser has no supported recording format. Please type your message.',
      )
      return
    }
    const current = ++generation.current
    setRequesting(true)
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (generation.current !== current) {
        media.getTracks().forEach((track) => track.stop())
        return
      }
      stream.current = media
      const instance = new MediaRecorder(media, { mimeType })
      recorder.current = instance
      const chunks: Array<Blob> = []
      let size = 0
      instance.ondataavailable = (event) => {
        if (generation.current !== current) return
        size += event.data.size
        if (size > MAX_BYTES) {
          cancel()
          setError('Recording is too large. Try a shorter recording.')
          return
        }
        chunks.push(event.data)
      }
      instance.onerror = () => {
        if (generation.current !== current) return
        cancel()
        setError('Recording failed. Try again or type your message.')
      }
      instance.onstop = () => {
        if (generation.current !== current) return
        release()
        recorder.current = null
        const blob = new Blob(chunks, { type: instance.mimeType || mimeType })
        if (!blob.size) {
          setError('No audio was recorded. Try again.')
        } else {
          callback.current(
            new File(
              [blob],
              blob.type.includes('mp4') ? 'recording.mp4' : 'recording.webm',
              { type: blob.type },
            ),
          )
        }
        setRecording(false)
      }
      instance.start(1000)
      setSeconds(0)
      setRecording(true)
      const started = Date.now()
      timer.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - started) / 1000)
        setSeconds(Math.min(elapsed, MAX_SECONDS))
        if (elapsed >= MAX_SECONDS) stop()
      }, 250)
    } catch {
      if (generation.current === current) {
        release()
        recorder.current = null
        setError(
          'Microphone access failed. Check permission or type your message.',
        )
      }
    } finally {
      if (generation.current === current) setRequesting(false)
    }
  }
  return { recording, requesting, seconds, error, start, stop, cancel }
}
