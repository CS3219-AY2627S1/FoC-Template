/**
 * AI Assistance Disclosure
 * Tool: Cursor (Composer)
 * Scope: Shared supplier hero image with placeholder fallback when URL fails.
 * Author review: Reuses the same type-based placeholder look as SupplierCard.
 */

import { useEffect, useState, type ReactNode } from 'react'
import Box from '@mui/material/Box'
import {
  DeliveryBagIcon,
  FoodIcon,
  PrinterIcon,
  StudentIcon,
} from './CampusArt'

const placeholderByType: Record<
  string,
  { icon: ReactNode; wash: string }
> = {
  Food: {
    icon: <FoodIcon sx={{ fontSize: 56 }} />,
    wash: 'linear-gradient(145deg, #146E62 0%, #3EAEA0 100%)',
  },
  Printing: {
    icon: <PrinterIcon sx={{ fontSize: 56 }} />,
    wash: 'linear-gradient(145deg, #12324C 0%, #2E6F9E 100%)',
  },
  Convenience: {
    icon: <DeliveryBagIcon sx={{ fontSize: 56 }} />,
    wash: 'linear-gradient(145deg, #7A5428 0%, #C9924A 100%)',
  },
  Services: {
    icon: <StudentIcon sx={{ fontSize: 56 }} />,
    wash: 'linear-gradient(145deg, #31404C 0%, #6E8496 100%)',
  },
}

const defaultPlaceholder = {
  icon: <DeliveryBagIcon sx={{ fontSize: 56 }} />,
  wash: 'linear-gradient(145deg, #12324C 0%, #2E6F9E 100%)',
}

type SupplierHeroImageProps = {
  name: string
  type: string
  imageUrl?: string | null
  height?: number
}

function SupplierHeroImage({
  name,
  type,
  imageUrl,
  height = 180,
}: SupplierHeroImageProps) {
  const [imageFailed, setImageFailed] = useState(false)
  const placeholder =
    placeholderByType[type] ??
    (type.includes('Food') ? placeholderByType.Food : defaultPlaceholder)

  useEffect(() => {
    setImageFailed(false)
  }, [imageUrl])

  if (imageUrl && !imageFailed) {
    return (
      <Box
        component="img"
        src={imageUrl}
        alt={name}
        onError={() => setImageFailed(true)}
        sx={{
          display: 'block',
          width: '100%',
          // Match the Create/Edit crop window so applied crops are not cut again.
          aspectRatio: '16 / 9',
          height: 'auto',
          minHeight: height,
          // Crops are exported as 16:9; fill shows exactly what was framed.
          objectFit: 'fill',
          borderRadius: 3,
          bgcolor: 'grey.100',
        }}
      />
    )
  }

  return (
    <Box
      role="img"
      aria-label={`${name} placeholder image`}
      sx={{
        position: 'relative',
        display: 'grid',
        height,
        placeItems: 'center',
        borderRadius: 3,
        color: '#FFFFFF',
        background: placeholder.wash,
        overflow: 'hidden',
        '&::before, &::after': {
          content: '""',
          position: 'absolute',
          borderRadius: '50%',
          bgcolor: 'rgba(255,255,255,0.16)',
        },
        '&::before': { width: 92, height: 92, top: -24, right: -16 },
        '&::after': { width: 56, height: 56, bottom: -12, left: 16 },
      }}
    >
      <Box sx={{ position: 'relative', zIndex: 1 }}>{placeholder.icon}</Box>
    </Box>
  )
}

export default SupplierHeroImage
