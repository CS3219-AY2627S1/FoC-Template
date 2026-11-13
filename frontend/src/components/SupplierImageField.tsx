/**
 * AI Assistance Disclosure
 * Tool: Cursor (Composer)
 * Scope: Optional image URL with pan/zoom crop window; Apply crop stores a framed image.
 * Author review: Frontend-only; blank stays valid. Cropped result is a data URL in image_url.
 */

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import Cropper, { type Area } from 'react-easy-crop'
import 'react-easy-crop/react-easy-crop.css'
import {
  getSupplierImageUrlError,
  isValidSupplierImageUrl,
  normalizeSupplierImageUrl,
} from '../api/suppliers'

type SupplierImageFieldProps = {
  value: string
  onChange: (value: string) => void
  error?: boolean
}

export type SupplierImageFieldHandle = {
  /** Ensure the current crop framing is written into the form value before submit. */
  prepareForSubmit: () => Promise<string>
  /** Raw URL field value (http link), before crop becomes a data URL. */
  getSourceUrl: () => string
}

/** Matches SupplierCard / SupplierHeroImage. */
const CROP_ASPECT = 16 / 9

/**
 * Normalized export size — independent of the source image.
 * Kept small so PATCH JSON stays well under gateway/service body limits.
 */
const OUTPUT_WIDTH = 320
const OUTPUT_HEIGHT = 180
const OUTPUT_QUALITY = 0.45

const MAX_CROPPED_DATA_URL_CHARS = 28_000

function isCroppedDataUrl(value: string): boolean {
  return value.trim().startsWith('data:image/')
}

async function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.addEventListener('load', () => resolve(image))
    image.addEventListener('error', () =>
      reject(new Error('Image failed to load')),
    )
    // crossOrigin on data: URLs can break canvas export in some browsers.
    if (/^https?:/i.test(url)) {
      image.crossOrigin = 'anonymous'
    }
    image.src = url
  })
}

/**
 * Crop → always resize to OUTPUT_WIDTH×OUTPUT_HEIGHT → compressed JPEG data URL.
 * Clamps to the image bounds so zoom-out / contain letterboxing becomes white, not a wrong crop.
 */
async function getNormalizedCropDataUrl(
  imageSrc: string,
  pixelCrop: Area,
): Promise<string> {
  const image = await createImage(imageSrc)
  const canvas = document.createElement('canvas')
  canvas.width = OUTPUT_WIDTH
  canvas.height = OUTPUT_HEIGHT

  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Could not crop image')
  }

  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT)

  const scaleX = OUTPUT_WIDTH / pixelCrop.width
  const scaleY = OUTPUT_HEIGHT / pixelCrop.height
  const sx = Math.max(0, pixelCrop.x)
  const sy = Math.max(0, pixelCrop.y)
  const ex = Math.min(image.naturalWidth, pixelCrop.x + pixelCrop.width)
  const ey = Math.min(image.naturalHeight, pixelCrop.y + pixelCrop.height)
  const sw = ex - sx
  const sh = ey - sy

  if (sw > 0 && sh > 0) {
    context.drawImage(
      image,
      sx,
      sy,
      sw,
      sh,
      (sx - pixelCrop.x) * scaleX,
      (sy - pixelCrop.y) * scaleY,
      sw * scaleX,
      sh * scaleY,
    )
  }

  for (const quality of [OUTPUT_QUALITY, 0.35, 0.28, 0.22]) {
    const dataUrl = canvas.toDataURL('image/jpeg', quality)
    if (dataUrl.length <= MAX_CROPPED_DATA_URL_CHARS) {
      return dataUrl
    }
  }

  const fallback = canvas.toDataURL('image/jpeg', 0.18)
  if (fallback.length > MAX_CROPPED_DATA_URL_CHARS) {
    throw new Error(
      'Could not prepare this crop for upload. Paste the original image link again (crop is optional), then Save.',
    )
  }
  return fallback
}

const SupplierImageField = forwardRef<
  SupplierImageFieldHandle,
  SupplierImageFieldProps
>(function SupplierImageField({ value, onChange, error = false }, ref) {
  const [sourceUrl, setSourceUrl] = useState(
    isCroppedDataUrl(value) ? '' : value,
  )
  const [previewFailed, setPreviewFailed] = useState(false)
  const [cropError, setCropError] = useState('')
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  // Start at 1; allow zoom-out (<1) so a tall/wide photo can fit entirely in the 16:9 frame.
  const [zoom, setZoom] = useState(1)
  const croppedAreaPixelsRef = useRef<Area | null>(null)
  const cropDirtyRef = useRef(true)
  const valueRef = useRef(value)
  const sourceUrlRef = useRef(sourceUrl)
  const cropImageSrcRef = useRef<string | null>(null)

  const normalizedSource = normalizeSupplierImageUrl(sourceUrl)
  // Prefer a fresh http(s) URL; otherwise re-open the already-saved crop so Edit can re-frame it.
  const cropImageSrc =
    normalizedSource &&
    isValidSupplierImageUrl(sourceUrl) &&
    !isCroppedDataUrl(sourceUrl)
      ? normalizedSource
      : isCroppedDataUrl(value)
        ? value.trim()
        : null

  const canCropSource = Boolean(cropImageSrc) && !previewFailed

  useEffect(() => {
    valueRef.current = value
  }, [value])

  useEffect(() => {
    sourceUrlRef.current = sourceUrl
  }, [sourceUrl])

  useEffect(() => {
    cropImageSrcRef.current = cropImageSrc
  }, [cropImageSrc])

  useEffect(() => {
    setPreviewFailed(false)
    setCropError('')
    setZoom(1)
    setCrop({ x: 0, y: 0 })
    croppedAreaPixelsRef.current = null
    cropDirtyRef.current = true
  }, [cropImageSrc])

  useEffect(() => {
    if (!isCroppedDataUrl(value) && value !== sourceUrl) {
      setSourceUrl(value)
    }
  }, [value, sourceUrl])

  const onCropComplete = useCallback((_area: Area, pixels: Area) => {
    croppedAreaPixelsRef.current = pixels
    cropDirtyRef.current = false
  }, [])

  function handleCropChange(next: { x: number; y: number }) {
    // Keep last pixels — Safari sometimes never fires onCropComplete after pan.
    cropDirtyRef.current = true
    setCrop(next)
  }

  function handleZoomChange(next: number) {
    cropDirtyRef.current = true
    setZoom(next)
  }

  /**
   * Prefer a fresh onCropComplete frame; if Safari stalls, reuse the last known
   * pixels so Save is not blocked after drag/zoom.
   */
  function waitForFreshCropPixels(timeoutMs = 400): Promise<Area | null> {
    if (!cropDirtyRef.current && croppedAreaPixelsRef.current) {
      return Promise.resolve(croppedAreaPixelsRef.current)
    }
    return new Promise((resolve) => {
      const started = Date.now()
      const timer = window.setInterval(() => {
        const fresh =
          !cropDirtyRef.current && croppedAreaPixelsRef.current !== null
        const timedOut = Date.now() - started >= timeoutMs
        if (fresh || timedOut) {
          window.clearInterval(timer)
          resolve(croppedAreaPixelsRef.current)
        }
      }, 40)
    })
  }

  async function applyCurrentCrop(): Promise<string> {
    const currentValue = valueRef.current
    const source = cropImageSrcRef.current
    // No cropper open (blank image) — keep whatever is in the form.
    if (!source) {
      return currentValue.trim()
    }

    // Never silently fall back to the raw URL: list/detail would then
    // re-crop the original and look nothing like the framed window.
    const pixels = await waitForFreshCropPixels()
    if (!pixels) {
      throw new Error(
        'Could not read the crop frame yet. Nudge the image slightly, then Save again.',
      )
    }

    const dataUrl = await getNormalizedCropDataUrl(source, pixels)
    onChange(dataUrl)
    valueRef.current = dataUrl
    return dataUrl
  }

  useImperativeHandle(ref, () => ({
    prepareForSubmit: async () => {
      try {
        setCropError('')
        return await applyCurrentCrop()
      } catch (cropApplyError) {
        console.error(cropApplyError)
        const message =
          cropApplyError instanceof Error
            ? cropApplyError.message
            : 'Could not crop this image (the host may block canvas use). Try another direct image URL, or Save without cropping.'
        setCropError(message)
        throw new Error(message)
      }
    },
    getSourceUrl: () => sourceUrlRef.current.trim(),
  }))

  function handleUrlFieldChange(next: string) {
    setSourceUrl(next)
    onChange(next)
  }

  return (
    <Box>
      <TextField
        fullWidth
        label="Image URL"
        value={
          isCroppedDataUrl(value) && !sourceUrl.trim()
            ? ''
            : sourceUrl
        }
        placeholder={
          isCroppedDataUrl(value) && !sourceUrl.trim()
            ? 'Saved crop below — paste a new URL to replace, or re-frame and Save'
            : undefined
        }
        onChange={(event) => handleUrlFieldChange(event.target.value)}
        error={error || Boolean(cropError)}
        helperText={
          error
            ? getSupplierImageUrlError(sourceUrl || value)
            : isCroppedDataUrl(value) && !sourceUrl.trim()
              ? 'This supplier already has a cropped image. Re-frame it below and Save, or paste a new image URL.'
              : 'Optional. Frame the photo in the window below, then Save Changes.'
        }
      />

      {cropImageSrc && (
        <Box sx={{ mt: 1.5 }}>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: 'block', mb: 0.75 }}
          >
            Fixed 16∶9 frame (same as supplier cards). What you see here is what
            Save keeps — drag to move, scroll/pinch to zoom. No separate preview
            step.
          </Typography>
          {canCropSource ? (
            <Stack spacing={1.5}>
              <Box
                sx={{
                  position: 'relative',
                  width: '100%',
                  aspectRatio: `${CROP_ASPECT}`,
                  borderRadius: 2,
                  overflow: 'hidden',
                  bgcolor: '#111',
                  border: '1px solid',
                  borderColor: 'divider',
                  touchAction: 'none',
                }}
              >
                <Cropper
                  image={cropImageSrc}
                  crop={crop}
                  zoom={zoom}
                  minZoom={0.35}
                  maxZoom={3}
                  aspect={CROP_ASPECT}
                  onCropChange={handleCropChange}
                  onZoomChange={handleZoomChange}
                  onCropComplete={onCropComplete}
                  onMediaLoaded={() => setPreviewFailed(false)}
                  zoomWithScroll
                  showGrid
                  // Allow pulling the photo smaller than the frame so the whole image can fit.
                  restrictPosition={false}
                  objectFit="contain"
                />
                <Box
                  component="img"
                  src={cropImageSrc}
                  alt=""
                  onError={() => setPreviewFailed(true)}
                  sx={{ display: 'none' }}
                />
              </Box>
              {cropError && (
                <Typography variant="body2" color="error">
                  {cropError}
                </Typography>
              )}
            </Stack>
          ) : (
            <Box
              sx={{
                display: 'grid',
                placeItems: 'center',
                height: 120,
                borderRadius: 2,
                border: '1px dashed',
                borderColor: 'divider',
                bgcolor: 'action.hover',
                px: 2,
                textAlign: 'center',
              }}
            >
              <Typography variant="body2" color="text.secondary">
                {error || previewFailed
                  ? 'Image could not be loaded. The supplier card will use the type placeholder.'
                  : 'Enter a direct image URL to frame it.'}
              </Typography>
            </Box>
          )}
        </Box>
      )}
    </Box>
  )
})

export default SupplierImageField
