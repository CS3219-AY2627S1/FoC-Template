/**
 * AI Assistance Disclosure
 * Tool: Cursor (GPT-5.6 Sol Medium)
 * Scope: Assisted with frontend implementation, debugging and UI refinement.
 * Author review: The generated code was reviewed, tested, and iteratively refined by the author through follow-up instructions.
 */

import { Alert, Snackbar } from '@mui/material'

type SuccessSnackbarProps = {
  open: boolean
  message: string
  onClose: () => void
}

function SuccessSnackbar({
  open,
  message,
  onClose,
}: SuccessSnackbarProps) {
  return (
    <Snackbar
      open={open}
      autoHideDuration={4000}
      onClose={(_event, reason) => {
        // Ignore backdrop clicks so a save confirmation is not dismissed instantly.
        if (reason === 'clickaway') return
        onClose()
      }}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
    >
      <Alert
        severity="success"
        variant="filled"
        onClose={onClose}
        sx={{ width: '100%' }}
      >
        {message}
      </Alert>
    </Snackbar>
  )
}

export default SuccessSnackbar
