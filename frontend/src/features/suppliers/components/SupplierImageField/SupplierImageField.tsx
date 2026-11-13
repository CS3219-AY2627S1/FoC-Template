import { useRef, useState } from 'react'
import { Button } from '@base-ui/react/button'
import {
  ACCEPTED_IMAGE_TYPES,
  validateImageFile,
} from '../../utils/supplierImage'
import type { SupplierImageChange } from '../../types/supplier.types'
import ui from '../../styles/supplier.module.scss'
import styles from './SupplierImageField.module.scss'

type SupplierImageFieldProps = {
  // preview image: current, re-uploaded on, or null
  previewUrl: string | null
  hasSavedImage: boolean
  onChange: (change: SupplierImageChange) => void
}

// image only really updated when "save changes" btn clicked
export const SupplierImageField = ({
  previewUrl,
  hasSavedImage,
  onChange,
}: SupplierImageFieldProps) => {
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)

  const chooseFile = (file: File | undefined) => {
    if (!file) return
    const problem = validateImageFile(file)
    setError(problem)
    if (!problem) onChange({ type: 'upload', file })
  }

  const remove = () => {
    setError(null)
    // Clearing an unsaved choice leaves nothing to remove on the server.
    onChange(hasSavedImage ? { type: 'remove' } : { type: 'keep' })
  }

  return (
    <div className={styles.field}>
      <div className={styles.thumbnail}>
        {previewUrl ? (
          <img src={previewUrl} alt="Supplier image" className={styles.image} />
        ) : (
          <span className={styles.empty}>No image</span>
        )}
      </div>

      <div className={styles.details}>
        <div className={styles.buttons}>
          <Button
            type="button"
            className={ui.button}
            onClick={() => inputRef.current?.click()}
          >
            Upload image
          </Button>
          {previewUrl && (
            <Button
              type="button"
              className={`${ui.button} ${styles.remove}`}
              onClick={remove}
            >
              Remove
            </Button>
          )}
        </div>
        <p className={styles.hint}>JPEG or PNG, up to 5 MB.</p>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES.join(',')}
        className={styles.input}
        aria-label="Supplier image file"
        onChange={(event) => {
          chooseFile(event.currentTarget.files?.[0])
          event.currentTarget.value = ''
        }}
      />
    </div>
  )
}
