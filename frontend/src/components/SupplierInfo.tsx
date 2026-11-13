/**
 * AI Assistance Disclosure
 * Tool: Cursor (GPT-5.6 Sol Medium)
 * Scope: Assisted with frontend implementation, debugging and UI refinement.
 * Author review: The generated code was reviewed, tested, and iteratively refined by the author through follow-up instructions.
 */

import { Stack, SvgIcon, Typography } from '@mui/material'

type SupplierInfoProps = {
  location: string
  operatingHours?: string
}

function LocationPinIcon() {
  return (
    <SvgIcon fontSize="small" aria-hidden="true">
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5Z" />
    </SvgIcon>
  )
}

function ClockIcon() {
  return (
    <SvgIcon fontSize="small" aria-hidden="true">
      <path d="M12 2a10 10 0 1 0 10 10A10.01 10.01 0 0 0 12 2Zm4.25 13.15L11 12V7h1.5v4.15l4.52 2.69-.77 1.31Z" />
    </SvgIcon>
  )
}

function SupplierInfo({ location, operatingHours }: SupplierInfoProps) {
  return (
    <Stack spacing={1} color="text.secondary">
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <LocationPinIcon />
        <Typography color="inherit">Location: {location}</Typography>
      </Stack>

      {operatingHours && (
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <ClockIcon />
          <Typography color="inherit">Hours: {operatingHours}</Typography>
        </Stack>
      )}
    </Stack>
  )
}

export default SupplierInfo
