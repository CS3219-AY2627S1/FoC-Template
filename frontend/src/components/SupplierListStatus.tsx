/**
 * AI Assistance Disclosure
 * Tool: Cursor (GPT-5.6 Sol Medium)
 * Scope: Assisted with frontend implementation, debugging and UI refinement.
 * Author review: The generated code was reviewed, tested, and iteratively refined by the author through follow-up instructions.
 */

import { Alert, Box, CircularProgress, Paper, Stack, Typography } from '@mui/material'
import { CampusBuildingIcon } from './CampusArt'

export type SupplierListStatusType =
  | 'loading'
  | 'empty'
  | 'no-results'
  | 'error'

type SupplierListStatusProps = {
  status: SupplierListStatusType
}

function SupplierListStatus({ status }: SupplierListStatusProps) {
  if (status === 'loading') {
    return (
      <Box role="status" sx={{ py: 6, textAlign: 'center' }}>
        <Stack spacing={2} sx={{ alignItems: 'center' }}>
          <CircularProgress />
          <Typography color="text.secondary">Loading suppliers...</Typography>
        </Stack>
      </Box>
    )
  }

  if (status === 'error') {
    return (
      <Alert severity="error">
        Suppliers could not be loaded. Please try again later.
      </Alert>
    )
  }

  if (status === 'empty') {
    return (
      <Paper variant="outlined" sx={{ p: 3, textAlign: 'center', bgcolor: 'background.paper' }}>
        <CampusBuildingIcon sx={{ fontSize: 40, color: 'primary.main' }} />
        <Typography sx={{ mt: 1 }}>No suppliers are available yet.</Typography>
      </Paper>
    )
  }

  return (
    <Paper variant="outlined" sx={{ p: 3, textAlign: 'center', bgcolor: 'background.paper' }}>
      <CampusBuildingIcon sx={{ fontSize: 40, color: 'primary.main' }} />
      <Typography sx={{ mt: 1 }}>
        No suppliers found. Try changing your search or supplier type.
      </Typography>
    </Paper>
  )
}

export default SupplierListStatus
