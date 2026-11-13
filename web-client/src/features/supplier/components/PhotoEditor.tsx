import { ImageUp } from 'lucide-react'
import { useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { supplierImageUrl, useRemoveSupplierPhoto, useSetSupplierPhoto } from '@/api/supplier/photos'
import type { Supplier, SupplierPhotoInput } from '@/api/supplier/types'
import { FormError } from '@/components/FormError'
import { Notice } from '@/components/Notice'

// The supplier-service keeps at most 1 MB for the photo and 256 KB for the thumbnail. Shrinking in
// the browser keeps uploads small and spares the service the work: in the cloud each service may use
// only 256 MiB of memory, and a phone photo of 24 megapixels takes about 100 MB to decode.
const PHOTO_EDGE = 1280
const THUMBNAIL_EDGE = 240
const PHOTO_LIMIT = 1024 * 1024
const QUALITIES = [0.82, 0.7, 0.55]

function draw(image: ImageBitmap, edge: number, square: boolean, quality: number): string {
  let sx = 0
  let sy = 0
  let sw = image.width
  let sh = image.height
  if (square) {
    // The thumbnail is the middle square of the photo.
    const side = Math.min(sw, sh)
    sx = (sw - side) / 2
    sy = (sh - side) / 2
    sw = side
    sh = side
  }
  const scale = Math.min(1, edge / Math.max(sw, sh))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(sw * scale)
  canvas.height = Math.round(sh * scale)
  const context = canvas.getContext('2d')
  if (!context) throw new Error('No canvas')
  // JPEG has no transparency, so a transparent PNG gets a white background instead of a black one.
  context.fillStyle = 'white'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(image, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
  // JPEG, because every browser can encode it.
  return canvas.toDataURL('image/jpeg', quality)
}

const decodedBytes = (dataUrl: string) => Math.floor(((dataUrl.length - dataUrl.indexOf(',') - 1) * 3) / 4)

async function shrink(file: File): Promise<SupplierPhotoInput> {
  // Turns the photo upright from its camera data, as phones expect.
  const image = await createImageBitmap(file, { imageOrientation: 'from-image' })
  try {
    let photo = ''
    for (const quality of QUALITIES) {
      photo = draw(image, PHOTO_EDGE, false, quality)
      if (decodedBytes(photo) <= PHOTO_LIMIT) break
    }
    return { photo, thumbnail: draw(image, THUMBNAIL_EDGE, true, 0.8) }
  } finally {
    image.close()
  }
}

type PhotoEditorProps = {
  supplier: Supplier
}

export function PhotoEditor({ supplier }: PhotoEditorProps) {
  const save = useSetSupplierPhoto(supplier.id)
  const remove = useRemoveSupplierPhoto(supplier.id)
  const [prepared, setPrepared] = useState<SupplierPhotoInput | null>(null)
  const [preparing, setPreparing] = useState(false)
  const [unreadable, setUnreadable] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const chooseRef = useRef<HTMLButtonElement>(null)
  const busy = preparing || save.isPending || remove.isPending

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    // The same file can be chosen again after a cancel.
    event.target.value = ''
    if (!file) return
    save.reset()
    remove.reset()
    setUnreadable(false)
    setPreparing(true)
    try {
      setPrepared(await shrink(file))
    } catch {
      setUnreadable(true)
    } finally {
      setPreparing(false)
    }
  }

  // Saving, cancelling and removing take away the button that had the focus, so it goes back to
  // "Choose a photo".
  function done() {
    setPrepared(null)
    chooseRef.current?.focus()
  }

  const shown = prepared?.photo ?? (supplier.photo ? supplierImageUrl(supplier.photo.path) : null)

  return (
    <section aria-labelledby="supplier-photo" className="ds-surface grid grid-cols-1 gap-4 p-5">
      <h2 id="supplier-photo">Photo</h2>
      {shown ? (
        <img
          src={shown}
          alt={prepared ? `New photo of ${supplier.name}, not saved yet` : `Photo of ${supplier.name}`}
          className="h-56 w-full rounded-inset object-cover md:h-72"
        />
      ) : (
        <p className="text-muted">No photo yet. Students see a shop icon instead.</p>
      )}
      <p className="text-muted">
        Any JPEG, PNG or WebP photo works. It is made smaller in this browser before it is sent.
      </p>

      <div role="status" className="empty:hidden">
        {save.isSuccess && <Notice tone="success" title="Photo saved" />}
        {remove.isSuccess && <Notice tone="success" title="Photo removed" />}
        {prepared && <Notice tone="info" title="Not saved yet" />}
      </div>
      {unreadable && (
        <Notice tone="danger" role="alert" title="This file could not be read as a photo">
          Choose a JPEG, PNG or WebP image.
        </Notice>
      )}
      <FormError error={save.error ?? remove.error} />

      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={handleFile} />
      <div className="flex flex-wrap gap-2">
        <button
          ref={chooseRef}
          type="button"
          className="ds-btn ds-btn--glass"
          aria-disabled={busy || undefined}
          aria-busy={preparing || undefined}
          onClick={() => !busy && fileRef.current?.click()}
        >
          <ImageUp aria-hidden="true" className="size-5 shrink-0" />
          {preparing ? 'Preparing…' : supplier.photo ? 'Choose a new photo' : 'Choose a photo'}
        </button>
        {prepared && (
          <>
            <button
              type="button"
              className="ds-btn ds-btn--glass"
              aria-disabled={save.isPending || undefined}
              aria-busy={save.isPending || undefined}
              onClick={() => !save.isPending && save.mutate(prepared, { onSuccess: done })}
            >
              {save.isPending ? 'Saving…' : 'Save photo'}
            </button>
            <button type="button" className="ds-btn ds-btn--text" onClick={done}>
              Cancel
            </button>
          </>
        )}
        {!prepared && supplier.photo && (
          <button
            type="button"
            className="ds-btn ds-btn--text"
            aria-disabled={remove.isPending || undefined}
            onClick={() => !remove.isPending && remove.mutate(undefined, { onSuccess: done })}
          >
            {remove.isPending ? 'Removing…' : 'Remove photo'}
          </button>
        )}
      </div>
    </section>
  )
}
