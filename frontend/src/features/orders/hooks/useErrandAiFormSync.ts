import { useEffect, useRef, useState } from 'react'
import { draftFromForm } from '../schemas/errandAi.schema'
import type { CreateErrandValues } from '../schemas/createErrand.schema'
import type { ErrandDraft } from '../schemas/errandAi.schema'

type FormSyncOptions = {
  initial: CreateErrandValues
  open: boolean
  locked: boolean
  draft: ErrandDraft
  getValues: () => CreateErrandValues
  restart: (draft: ErrandDraft) => boolean
  onApply: (draft: ErrandDraft) => void
  onApplied: () => void
}

export function useErrandAiFormSync({
  initial,
  open,
  locked,
  draft,
  getValues,
  restart,
  onApply,
  onApplied,
}: FormSyncOptions) {
  const [confirm, setConfirm] = useState(false)
  const [formChanged, setFormChanged] = useState(false)
  // Acknowledging form edits must not bypass confirmation before overwriting them.
  const baseline = useRef(initial)
  const acknowledgedForm = useRef(initial)

  useEffect(() => {
    if (open)
      setFormChanged(
        JSON.stringify(getValues()) !==
          JSON.stringify(acknowledgedForm.current),
      )
  }, [open, getValues])

  const apply = () => {
    onApply(draft)
    baseline.current = structuredClone(getValues())
    acknowledgedForm.current = baseline.current
    setFormChanged(false)
    setConfirm(false)
    onApplied()
  }

  const fill = () => {
    if (JSON.stringify(getValues()) !== JSON.stringify(baseline.current))
      setConfirm(true)
    else apply()
  }

  const checkBeforeSend = () => {
    if (locked) return false
    const changed =
      JSON.stringify(getValues()) !== JSON.stringify(acknowledgedForm.current)
    setFormChanged(changed)
    return !changed
  }

  const continueDraft = () => {
    acknowledgedForm.current = structuredClone(getValues())
    setFormChanged(false)
  }

  const restartFromForm = () => {
    if (locked) return false
    const values = structuredClone(getValues())
    if (!restart(draftFromForm(values))) return false
    baseline.current = values
    acknowledgedForm.current = values
    setFormChanged(false)
    setConfirm(false)
    return true
  }

  return {
    confirm,
    setConfirm,
    formChanged,
    apply,
    fill,
    checkBeforeSend,
    continueDraft,
    restartFromForm,
  }
}
