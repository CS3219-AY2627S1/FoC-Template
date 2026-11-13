import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Dialog } from '@base-ui/react/dialog'
import { AlertDialog } from '@base-ui/react/alert-dialog'
import {
  ArrowUp,
  ClipboardList,
  MessageCircle,
  Mic,
  Sparkles,
  Square,
  X,
} from 'lucide-react'
import { useErrandAi } from '../../hooks/useErrandAi'
import { useErrandAiCapabilities } from '../../hooks/useErrandAiCapabilities'
import { useErrandAiFormSync } from '../../hooks/useErrandAiFormSync'
import { useAudioRecorder } from '../../hooks/useAudioRecorder'
import { draftFromForm } from '../../schemas/errandAi.schema'
import { expiryLabel } from '../../utils/orderFormat'
import type { ErrandDraft } from '../../schemas/errandAi.schema'
import type { CreateErrandValues } from '../../schemas/createErrand.schema'
import styles from './ErrandAiChat.module.scss'

type ChatProps = {
  getValues: () => CreateErrandValues
  onApply: (draft: ErrandDraft) => void
}

export function ErrandAiChat(props: ChatProps) {
  const capabilities = useErrandAiCapabilities()
  if (
    !capabilities.userId ||
    !capabilities.isSuccess ||
    capabilities.isFetching ||
    !capabilities.data.chatEnabled
  )
    return null
  return (
    <EnabledErrandAiChat
      key={capabilities.userId}
      {...props}
      voiceEnabled={capabilities.data.voiceEnabled}
    />
  )
}

function EnabledErrandAiChat({
  getValues,
  onApply,
  voiceEnabled,
}: ChatProps & { voiceEnabled: boolean }) {
  const [initial, setInitial] = useState<CreateErrandValues | null>(null)
  const [open, setOpen] = useState(false)
  const [notice, setNotice] = useState(false)
  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(false), 5000)
    return () => clearTimeout(timer)
  }, [notice])
  return (
    <Dialog.Root open={open} onOpenChange={setOpen} modal={false}>
      {createPortal(
        <>
          <Dialog.Trigger
            type="button"
            className={styles.launcher}
            aria-label="Create with AI"
            onClick={() => {
              if (!initial) setInitial(structuredClone(getValues()))
              setNotice(false)
            }}
          >
            {open ? <X size={25} /> : <MessageCircle size={25} />}
          </Dialog.Trigger>
          {notice && (
            <div className={styles.notice} role="status">
              Draft added to your form. Review the details, then continue.
            </div>
          )}
        </>,
        document.body,
      )}
      {initial && (
        <ChatPanel
          voiceEnabled={voiceEnabled}
          initial={initial}
          open={open}
          close={() => setOpen(false)}
          getValues={getValues}
          onApply={(draft) => {
            onApply(draft)
            setNotice(true)
          }}
        />
      )}
    </Dialog.Root>
  )
}

function ChatPanel({
  initial,
  open,
  close,
  getValues,
  onApply,
  voiceEnabled,
}: {
  initial: CreateErrandValues
  open: boolean
  close: () => void
  getValues: () => CreateErrandValues
  onApply: (draft: ErrandDraft) => void
  voiceEnabled: boolean
}) {
  const ai = useErrandAi(draftFromForm(initial))
  const [input, setInput] = useState('')
  const [voiceText, setVoiceText] = useState('')
  const end = useRef<HTMLDivElement>(null)
  const audio = useAudioRecorder((file) => {
    void ai.transcribe(file).then((text) => {
      if (!text) return
      setInput((current) => {
        const combined = current ? `${current}\n${text}` : text
        return combined
      })
      setVoiceText('Transcription added. Check the text, then send.')
    })
  })
  const locked = ai.busy || audio.recording || audio.requesting
  const closePanel = () => {
    audio.cancel()
    close()
  }
  const formSync = useErrandAiFormSync({
    initial,
    open,
    locked,
    draft: ai.draft,
    getValues,
    restart: ai.restart,
    onApply,
    onApplied: closePanel,
  })
  useEffect(() => {
    if (!open) audio.cancel()
  }, [open])
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'nearest' })
  }, [ai.messages, ai.busy, open])
  const collapse = () => {
    formSync.setConfirm(false)
    closePanel()
  }
  const restartFromForm = () => {
    if (formSync.restartFromForm()) setVoiceText('')
  }
  const sendMessage = async (
    text: string,
    selectedSupplierId?: string,
    retry = false,
  ) => {
    if (!formSync.checkBeforeSend()) return false
    return ai.send(text, selectedSupplierId, retry)
  }
  const send = async () => {
    const text = input
    if (
      await sendMessage(
        text,
        undefined,
        ai.failed?.message === text.trim() && !ai.failed.selectedSupplierId,
      )
    ) {
      setInput((current) => (current === text ? '' : current))
      setVoiceText('')
    }
  }
  const retryMessage = async () => {
    const failed = ai.failed
    if (!failed) return
    if (await sendMessage(failed.message, failed.selectedSupplierId, true)) {
      if (!failed.selectedSupplierId)
        setInput((current) =>
          current.trim() === failed.message ? '' : current,
        )
    }
  }
  const entries = [
    ['Pickup', ai.draft.pickup?.name],
    ['Delivery', ai.draft.deliveryLocation],
    ['Item', ai.draft.description],
    ['Notes', ai.draft.notes === '' ? 'None' : ai.draft.notes],
    [
      'Reward',
      ai.draft.creditReward == null ? null : `${ai.draft.creditReward} credits`,
    ],
    [
      'Expiry',
      ai.draft.expiryMinutes == null
        ? null
        : expiryLabel(ai.draft.expiryMinutes),
    ],
  ]
  return (
    <>
      <Dialog.Portal keepMounted>
        <Dialog.Popup
          className={styles.panel}
          hidden={!open}
          aria-describedby="ai-description"
          onKeyDown={(event) => {
            event.stopPropagation()
            if (event.key === 'Escape') {
              event.preventDefault()
              collapse()
            }
          }}
        >
          <header className={styles.header}>
            <Sparkles size={22} />
            <div>
              <Dialog.Title>Create with AI</Dialog.Title>
              <Dialog.Description id="ai-description">
                Describe your errand. We’ll help with the details.
              </Dialog.Description>
            </div>
            <button
              type="button"
              aria-label="Close AI assistant"
              onClick={collapse}
            >
              <X size={20} />
            </button>
          </header>
          <div className={styles.body}>
            <div className={styles.assistant}>
              <small>FoC assistant</small>Hi! What would you like someone to
              pick up, and where should it be delivered?
            </div>
            <div role="log" aria-label="Conversation" aria-live="polite">
              {ai.messages.map((message, index) => (
                <div
                  key={index}
                  className={
                    message.role === 'user' ? styles.user : styles.assistant
                  }
                >
                  {message.role === 'assistant' && <small>FoC assistant</small>}
                  {message.content}
                </div>
              ))}
            </div>
            {!!ai.response?.supplierChoices.length && (
              <div className={styles.choices} aria-label="Pickup options">
                {ai.response.supplierChoices.map((choice) => (
                  <button
                    type="button"
                    key={choice.id}
                    disabled={locked}
                    onClick={() =>
                      void sendMessage(`Choose ${choice.name}`, choice.id)
                    }
                  >
                    <strong>{choice.name}</strong>
                    <small>{choice.address}</small>
                  </button>
                ))}
              </div>
            )}
            {ai.response && (
              <section className={styles.draft} aria-label="Errand draft">
                <h3>
                  <ClipboardList size={17} />
                  Errand draft
                </h3>
                <dl>
                  {entries.map(([label, value]) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd>{value || 'Not provided'}</dd>
                    </div>
                  ))}
                </dl>
                <button
                  type="button"
                  className={styles.primary}
                  onClick={formSync.fill}
                  disabled={locked}
                >
                  Fill into form
                </button>
                <small>Review and edit before posting.</small>
              </section>
            )}
            {ai.busy && (
              <p role="status" className={styles.hint}>
                Working on your request…
              </p>
            )}
            {(ai.error || audio.error) && (
              <div role="alert" className={styles.error}>
                {ai.error || audio.error}
                {ai.failed && (
                  <button
                    type="button"
                    disabled={locked}
                    onClick={() => void retryMessage()}
                  >
                    Retry message
                  </button>
                )}
              </div>
            )}
            <div ref={end} />
          </div>
          <div className={styles.composer}>
            {formSync.formChanged && (
              <div className={styles.formChanged} role="status">
                <p>
                  You edited the form. This conversation still uses the previous
                  draft.
                </p>
                <small>
                  Restarting clears the conversation. Your unsent text stays.
                </small>
                <div>
                  <button type="button" onClick={formSync.continueDraft}>
                    Continue current draft
                  </button>
                  <button
                    type="button"
                    onClick={restartFromForm}
                    disabled={locked}
                  >
                    Restart from form
                  </button>
                </div>
              </div>
            )}
            {audio.recording ? (
              <div className={styles.recording} role="status">
                <span>Recording · {audio.seconds}s / 60s</span>
                <button
                  type="button"
                  aria-label="Stop recording"
                  onClick={audio.stop}
                >
                  <Square size={18} />
                </button>
                <button type="button" onClick={audio.cancel}>
                  Cancel
                </button>
              </div>
            ) : (
              <>
                <textarea
                  aria-label="Message to AI assistant"
                  placeholder="Describe your errand…"
                  value={input}
                  rows={3}
                  disabled={locked}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (
                      event.key === 'Enter' &&
                      !event.shiftKey &&
                      !event.nativeEvent.isComposing
                    ) {
                      event.preventDefault()
                      if (!locked && input.trim() && input.length <= 2000)
                        void send()
                    }
                  }}
                />
                <div className={styles.tools}>
                  {voiceEnabled && (
                    <button
                      type="button"
                      aria-label="Record voice message"
                      disabled={locked}
                      onClick={() => void audio.start()}
                    >
                      <Mic size={20} />
                    </button>
                  )}
                  <span>
                    {input.length > 2000
                      ? 'Please shorten your message to 2000 characters.'
                      : audio.requesting
                        ? 'Waiting for microphone permission…'
                        : voiceEnabled
                          ? 'Voice input becomes editable text.'
                          : ''}
                  </span>
                  <button
                    type="button"
                    aria-label="Send message"
                    className={styles.send}
                    disabled={locked || !input.trim() || input.length > 2000}
                    onClick={() => void send()}
                  >
                    <ArrowUp size={20} />
                  </button>
                </div>
              </>
            )}
            {voiceText && <small role="status">{voiceText}</small>}
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
      <AlertDialog.Root
        open={formSync.confirm}
        onOpenChange={formSync.setConfirm}
      >
        <AlertDialog.Portal>
          <AlertDialog.Backdrop className={styles.backdrop} />
          <AlertDialog.Popup className={styles.confirm}>
            <AlertDialog.Title>Apply the AI draft?</AlertDialog.Title>
            <AlertDialog.Description>
              You edited the form after starting this draft. Applying it will
              replace the fields included in the draft.
            </AlertDialog.Description>
            <div>
              <AlertDialog.Close type="button">Keep my edits</AlertDialog.Close>
              <button
                type="button"
                className={styles.primary}
                onClick={formSync.apply}
              >
                Apply draft
              </button>
            </div>
          </AlertDialog.Popup>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </>
  )
}
