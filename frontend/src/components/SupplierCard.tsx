/**
 * AI Assistance Disclosure
 * Tool: Cursor (GPT-5.6 Sol Medium)
 * Scope: Assisted with frontend implementation, debugging and UI refinement.
 * Author review: The generated code was reviewed, tested, and iteratively refined by the author through follow-up instructions.
 */
// AI Assistance Disclosure:
// Tool: GitHub Copilot (Copilot SDK), date: 2026-11-08
// Scope: Added the favourite toggle to the supplier card.
// Author review: Read through all code and verified through testing

import { useEffect, useState, type ReactNode } from 'react'
import {
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  Chip,
  Stack,
  Typography,
} from '@mui/material'
import { Link } from 'react-router-dom'
import SupplierFavouriteButton from './SupplierFavouriteButton'
import {
  DeliveryBagIcon,
  FoodIcon,
  PrinterIcon,
  StudentIcon,
} from './CampusArt'
import SupplierInfo from './SupplierInfo'

// These props describe the supplier information that the card accepts.
type SupplierCardProps = {
  id: string
  name: string
  type: string
  location: string
  // The question mark means this value is optional.
  operatingHours?: string
  imageUrl?: string
  isFavourite: boolean
  isFavouriteLoading: boolean
  onToggleFavourite: () => void
}

const placeholderByType: Record<
  string,
  { icon: ReactNode; wash: string; ink: string }
> = {
  Food: {
    icon: <FoodIcon sx={{ fontSize: 56 }} />,
    wash: 'linear-gradient(145deg, #146E62 0%, #3EAEA0 100%)',
    ink: '#146E62',
  },
  Printing: {
    icon: <PrinterIcon sx={{ fontSize: 56 }} />,
    wash: 'linear-gradient(145deg, #12324C 0%, #2E6F9E 100%)',
    ink: '#12324C',
  },
  Convenience: {
    icon: <DeliveryBagIcon sx={{ fontSize: 56 }} />,
    wash: 'linear-gradient(145deg, #7A5428 0%, #C9924A 100%)',
    ink: '#7A5428',
  },
  Services: {
    icon: <StudentIcon sx={{ fontSize: 56 }} />,
    wash: 'linear-gradient(145deg, #31404C 0%, #6E8496 100%)',
    ink: '#31404C',
  },
}

const defaultPlaceholder = {
  icon: <DeliveryBagIcon sx={{ fontSize: 56 }} />,
  wash: 'linear-gradient(145deg, #12324C 0%, #2E6F9E 100%)',
  ink: '#12324C',
}

function SupplierCard({
  id,
  name,
  type,
  location,
  operatingHours,
  imageUrl,
  isFavourite,
  isFavouriteLoading,
  onToggleFavourite,
}: SupplierCardProps) {
  const [imageFailed, setImageFailed] = useState(false)
  const placeholder = placeholderByType[type] ?? 
  (type.includes('Food') ? placeholderByType.Food : defaultPlaceholder)

  useEffect(() => {
    setImageFailed(false)
  }, [imageUrl])

  return (
    <Card
      variant="outlined"
      sx={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
        borderColor: 'divider',
        bgcolor: 'background.paper',
        boxShadow: '0 12px 28px rgba(18, 35, 48, 0.1)',
        transition: 'transform 160ms ease, box-shadow 160ms ease',
        '&:hover': {
          transform: 'translateY(-4px)',
          boxShadow: '0 18px 36px rgba(18, 35, 48, 0.16)',
        },
      }}
    >
      <Box sx={{ position: 'absolute', top: 8, right: 8, zIndex: 1 }}>
        <SupplierFavouriteButton
          isFavourite={isFavourite}
          isLoading={isFavouriteLoading}
          onClick={onToggleFavourite}
        />
      </Box>
      {imageUrl && !imageFailed ? (
        <Box
          component="img"
          src={imageUrl}
          alt={name}
          onError={() => setImageFailed(true)}
          sx={{
            display: 'block',
            width: '100%',
            aspectRatio: '16 / 9',
            height: 'auto',
            // Saved crops are already 16:9 — fill avoids re-cropping the framed image.
            objectFit: 'fill',
            bgcolor: 'grey.100',
          }}
        />
      ) : (
        <Box
          role="img"
          aria-label={`${name} placeholder image`}
          sx={{
            position: 'relative',
            display: 'grid',
            width: '100%',
            aspectRatio: '16 / 9',
            placeItems: 'center',
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
      )}

      <CardContent sx={{ flex: 1, p: 2.25 }}>
        <Stack spacing={1.25}>
          <Chip
            label={type}
            size="small"
            variant="outlined"
            sx={{
              alignSelf: 'flex-start',
              color: placeholder.ink,
              borderColor: placeholder.ink,
            }}
          />
          <Typography component="h2" variant="h6">
            {name}
          </Typography>
          <SupplierInfo location={location} operatingHours={operatingHours} />
        </Stack>
      </CardContent>

      <CardActions sx={{ px: 2.25, pb: 2.25 }}>
        <Button
          component={Link}
          to={`/suppliers/${id}`}
          variant="contained"
          fullWidth
        >
          View Details
        </Button>
      </CardActions>
    </Card>
  )
}

export default SupplierCard
