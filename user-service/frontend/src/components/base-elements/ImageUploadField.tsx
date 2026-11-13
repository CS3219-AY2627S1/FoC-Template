// AI Assistance Disclosure:
// Tool: ChatGPT (model: GPT-5.6 Luna), date: 2026-09-29
// Scope: Generated initial implementation, decomposed App.tsx into separate components
// Author review: I validated correctness and edited for style.

import {
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type KeyboardEvent,
} from 'react'
import type { ImageDataUrl } from '@relay/contracts'
import { ErrorMessage } from '@relay/ui'
import { fileToDataUrl, imageFileError } from '../../validation/validation'

export function ImageUploadField({
  value,
  onChange,
}: {
  value?: ImageDataUrl
  onChange: (value?: ImageDataUrl) => void
}) {
  const [errorMessage, setErrorMessage] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)

  async function chooseFile(file: File | undefined) {
    if (!file) return

    const validationError = imageFileError(file)
    if (validationError) {
      setErrorMessage(validationError)
      return
    }

    try {
      setErrorMessage('')
      onChange((await fileToDataUrl(file)) as ImageDataUrl)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to read the image.')
    }
  }

  function openFilePicker() {
    inputRef.current?.click()
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      openFilePicker()
    }
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setIsDragging(true)
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
    setIsDragging(false)
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setIsDragging(false)
    void chooseFile(event.dataTransfer.files[0])
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    void chooseFile(event.target.files?.[0])
    event.target.value = ''
  }

  return (
    <div className="file-upload">
      <div className="file-upload-heading">
        <span className="file-upload-label">
          Profile picture <span className="optional">optional</span>
        </span>
        <small>JPG or PNG, smaller than 5 MB.</small>
      </div>
      <div
        className={`image-dropzone${isDragging ? ' image-dropzone-dragging' : ''}${value ? ' image-dropzone-has-image' : ''}`}
        role="button"
        tabIndex={0}
        aria-controls={inputId}
        aria-label={value ? 'Replace profile picture' : 'Choose profile picture'}
        onClick={openFilePicker}
        onKeyDown={handleKeyDown}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {value ? (
          <img className="profile-preview" src={value} alt="Profile preview" />
        ) : (
          <span className="image-dropzone-icon" aria-hidden="true">
            ↑
          </span>
        )}
        <span className="image-dropzone-copy">
          <strong>{value ? 'Replace profile picture' : 'Drag and drop a photo'}</strong>
          <span>
            {value
              ? 'Drop a new image or tap to choose another'
              : 'or tap to select from your device'}
          </span>
        </span>
        <input
          ref={inputRef}
          id={inputId}
          className="image-dropzone-input"
          type="file"
          accept=".jpg,.png,image/jpeg,image/png"
          onChange={handleFileChange}
          onClick={(event) => event.stopPropagation()}
          tabIndex={-1}
        />
      </div>
      {value && (
        <button
          type="button"
          className="image-remove-button"
          onClick={() => {
            setErrorMessage('')
            onChange(undefined)
          }}
        >
          Remove photo
        </button>
      )}
      <ErrorMessage message={errorMessage} />
    </div>
  )
}
