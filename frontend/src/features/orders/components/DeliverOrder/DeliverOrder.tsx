import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@base-ui/react/button'
import { Dialog } from '@base-ui/react/dialog'
import { Camera, Plus, X } from 'lucide-react'
import {
  ACCEPTED_IMAGE_TYPES,
  validateImageFile,
} from '#/features/suppliers/utils/supplierImage'
import { useOrderActions } from '../../hooks/useOrderActions'
import { orderErrorMessage } from '../../utils/orderErrors'
import { MAX_DELIVERY_PHOTOS } from '../../types/errand.types'
import type { Errand } from '../../types/errand.types'
import styles from '../../styles/order.module.scss'
import dialog from '../OrderActions/OrderActions.module.scss'
import local from './DeliverOrder.module.scss'

// The courier take photos of the handover, then review (add or remove),
// then submits all photos at once. After that, the photos are fixed
export const DeliverOrder = ({
  order,
  onDelivered,
}: {
  order: Errand
  onDelivered: (message: string) => void
}) => {
  const { deliver } = useOrderActions()
  const inputRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [photos, setPhotos] = useState<Array<File>>([])
  const [selected, setSelected] = useState(0)
  const [problem, setProblem] = useState<string | null>(null)

  // display the chosen photos and free their memory if they are deleted or changed
  const previews = useMemo(
    () => photos.map((photo) => URL.createObjectURL(photo)),
    [photos],
  )
  useEffect(
    () => () => previews.forEach((url) => URL.revokeObjectURL(url)),
    [previews],
  )
  const shown = Math.min(selected, photos.length - 1)

  const choose = (files: Array<File>) => {
    deliver.reset()
    const room = MAX_DELIVERY_PHOTOS - photos.length
    const valid = files.filter((file) => !validateImageFile(file))
    const invalid = files.map(validateImageFile).find(Boolean)
    setProblem(
      invalid ??
        (valid.length > room
          ? `You can add up to ${MAX_DELIVERY_PHOTOS} photos.`
          : null),
    )
    const added = valid.slice(0, room)
    if (added.length) {
      setPhotos([...photos, ...added])
      setSelected(photos.length)
    }
  }
  const remove = (index: number) => {
    deliver.reset()
    setProblem(null)
    setPhotos(photos.filter((_, other) => other !== index))
    if (index <= selected) setSelected(Math.max(0, selected - 1))
  }
  const close = () => {
    if (deliver.isPending) return
    setOpen(false)
    setPhotos([])
    setSelected(0)
    setProblem(null)
    deliver.reset()
  }
  const submit = async () => {
    if (!photos.length || deliver.isPending) return
    try {
      await deliver.mutateAsync({ id: order.id, photos })
      setOpen(false)
      setPhotos([])
      onDelivered('Delivered. Errand updated.')
    } catch {
      // the error is shown in the dialog and the photos stay for another try
    }
  }

  return (
    <>
      <p className={styles.muted}>
        Hand the item to {order.requester.name ?? 'the Requester'} at{' '}
        {order.deliveryLocation}, then take photos as proof of delivery.
      </p>
      <div className={styles.actions}>
        <Button className={styles.button} onClick={() => setOpen(true)}>
          Mark as delivered
        </Button>
      </div>
      <Dialog.Root
        open={open}
        onOpenChange={(next) => (next ? setOpen(true) : close())}
      >
        <Dialog.Portal>
          <Dialog.Backdrop className={dialog.backdrop} />
          <Dialog.Popup className={dialog.popup}>
            <Dialog.Title>Proof of delivery</Dialog.Title>
            <Dialog.Description>
              {photos.length
                ? 'Review your photos. Add or remove any, then submit. You cannot change them after submission.'
                : `Take photos showing the item has been delivered. ${order.requester.name ?? 'The Requester'} will see them before confirming receipt.`}
            </Dialog.Description>

            {photos.length ? (
              <>
                <div className={local.preview}>
                  <img
                    src={previews[shown]}
                    alt={`Photo ${shown + 1} of ${photos.length}`}
                  />
                </div>
                <ul className={local.strip} aria-label="Chosen photos">
                  {previews.map((preview, index) => (
                    <li
                      key={preview}
                      className={local.thumb}
                      data-selected={index === shown}
                    >
                      <button
                        type="button"
                        className={local.view}
                        aria-label={`View photo ${index + 1}`}
                        aria-pressed={index === shown}
                        onClick={() => setSelected(index)}
                      >
                        <img src={preview} alt="" />
                      </button>
                      <button
                        type="button"
                        className={local.remove}
                        aria-label={`Remove photo ${index + 1}`}
                        disabled={deliver.isPending}
                        onClick={() => remove(index)}
                      >
                        <X size={12} aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                  {photos.length < MAX_DELIVERY_PHOTOS && (
                    <li>
                      <button
                        type="button"
                        className={local.add}
                        aria-label="Add photo"
                        disabled={deliver.isPending}
                        onClick={() => inputRef.current?.click()}
                      >
                        <Plus size={20} aria-hidden="true" />
                      </button>
                    </li>
                  )}
                </ul>
              </>
            ) : (
              <button
                type="button"
                className={local.start}
                onClick={() => inputRef.current?.click()}
              >
                <Camera size={28} aria-hidden="true" />
                Take or choose photos
              </button>
            )}
            <p className={local.hint}>
              {photos.length} of {MAX_DELIVERY_PHOTOS} photos · JPEG or PNG, up
              to 5 MB each
            </p>
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPTED_IMAGE_TYPES.join(',')}
              multiple
              hidden
              aria-label="Delivery photos"
              onChange={(event) => {
                choose(Array.from(event.target.files ?? []))
                event.target.value = ''
              }}
            />
            {problem && (
              <p role="alert" className={styles.error}>
                {problem}
              </p>
            )}
            {deliver.error && (
              <p role="alert" className={styles.error}>
                {orderErrorMessage(deliver.error)}
              </p>
            )}
            <div className={styles.actions}>
              <Dialog.Close
                className={styles.secondary}
                disabled={deliver.isPending}
              >
                Go back
              </Dialog.Close>
              <Button
                className={styles.button}
                disabled={!photos.length || deliver.isPending}
                onClick={() => void submit()}
              >
                {deliver.isPending
                  ? 'Submitting…'
                  : photos.length > 1
                    ? `Submit ${photos.length} photos`
                    : 'Submit photo'}
              </Button>
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  )
}
