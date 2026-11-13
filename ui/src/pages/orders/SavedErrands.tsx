import { useEffect, useRef, useState } from 'react'
import { useCampusErrandsAPI } from '../../api/useCampusErrandsAPI'
import type { SavedErrand } from './models'
import styles from './Orders.module.css'

type Props = {
  revision: number
  disabled: boolean
  onSelect: (template: SavedErrand, edit: boolean) => void
}
const message = (error: unknown) => error instanceof Error ? error.message : 'Please try again.'

export const SavedErrands = ({ revision, disabled, onSelect }: Props) => {
  const api = useCampusErrandsAPI()
  const [templates, setTemplates] = useState<SavedErrand[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  const [reload, setReload] = useState(0)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const deleteLock = useRef(false)
  const listGeneration = useRef(0)
  useEffect(() => {
    let active = true
    const generation = ++listGeneration.current
    const canApply = () => active && generation === listGeneration.current
    void api.savedErrands.list().then((value) => {
      if (canApply()) { setTemplates(value); setLoaded(true); setError('') }
    }).catch((reason) => { if (canApply()) { setError(message(reason)); setLoaded(true) } })
    return () => { active = false }
  }, [api, revision, reload])

  const remove = async (template: SavedErrand) => {
    if (disabled || deleteLock.current) return
    deleteLock.current = true
    ++listGeneration.current
    setDeleting(template.id)
    setFeedback('')
    try {
      await api.savedErrands.remove(template.id)
      setTemplates((current) => current.filter((entry) => entry.id !== template.id))
      setConfirmDelete(null)
      setFeedback(`Template “${template.name}” deleted. Existing orders are unchanged.`)
    } catch (reason) { setFeedback(`Template was not confirmed deleted. ${message(reason)}`); setReload((value) => value + 1) }
    finally { deleteLock.current = false; setDeleting(null) }
  }

  return <section className={styles.templates} aria-labelledby="saved-templates-title">
    <div className={styles.listHeading}><h2 id="saved-templates-title">Saved templates</h2><button type="button" disabled={deleting !== null} onClick={() => setReload((value) => value + 1)}>Refresh templates</button></div>
    <p>Reuse your usual errand. You can review every detail before submitting a new request.</p>
    {!loaded && <p role="status">Loading saved templates…</p>}
    {error && <p role="alert">Templates are temporarily unavailable. {error} Use Refresh templates to try again.</p>}
    {feedback && <p role="status">{feedback}</p>}
    {loaded && !error && templates.length === 0 && <p>No saved templates yet. Open New request to save one.</p>}
    <div className={styles.grid}>{templates.map((template) => <article className={styles.card} key={template.id}>
      <h3>{template.name}</h3>
      <p>{template.items.map((item) => `${item.quantity} × ${item.name}`).join(', ')}</p>
      <p>{template.delivery_location} · {template.credits} credits</p>
      <div className={styles.cardActions}>
        <button type="button" disabled={disabled || deleting !== null || !!error} onClick={() => onSelect(template, false)}>Use template</button>
        <button type="button" disabled={disabled || deleting !== null || !!error} onClick={() => onSelect(template, true)}>Edit / rename</button>
        <button type="button" disabled={disabled || deleting !== null} onClick={() => setConfirmDelete(template.id)}>Delete template</button>
      </div>
      {confirmDelete === template.id && <div role="group" aria-label={`Delete ${template.name}`}>
        <p>Delete this template? Existing orders will stay unchanged.</p>
        <button type="button" disabled={deleting !== null} onClick={() => setConfirmDelete(null)}>Keep template</button>
        <button type="button" disabled={disabled || deleting !== null} onClick={() => void remove(template)}>{deleting === template.id ? 'Deleting…' : 'Confirm delete'}</button>
      </div>}
    </article>)}</div>
  </section>
}
