/**
 * AI Assistance Disclosure
 * Tool: Cursor (GPT-5.6 Sol Medium)
 * Scope: Assisted with frontend implementation, debugging and UI refinement.
 * Author review: The generated code was reviewed, tested, and iteratively refined by the author through follow-up instructions.
 */
// AI Assistance Disclosure:
// Tool: GitHub Copilot (Copilot SDK), date: 2026-11-08
// Scope: Added supplier favourite status and toggling to the supplier detail page.
// Author review: Read through all code and verified through testing


import { useEffect, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Chip,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Paper,
  Stack,
  Typography,
} from '@mui/material'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import type { UserMode } from '../components/AppNavigation'
import SuccessSnackbar from '../components/SuccessSnackbar'
import SupplierFavouriteButton from '../components/SupplierFavouriteButton'
import SupplierHeroImage from '../components/SupplierHeroImage'
import SupplierInfo from '../components/SupplierInfo'
import type { Supplier } from '../interfaces'
import {
  addFavouriteSupplier,
  deleteFavouriteSupplier,
  deleteSupplier,
  fetchSupplierById,
  getSupplierRequestErrorMessage,
} from '../api/suppliers'

type SupplierDetailPageProps = {
  isAdmin: boolean
  mode: UserMode
}

type DetailLocationState = {
  successMessage?: string
}

function SupplierDetailPage({ isAdmin, mode }: SupplierDetailPageProps) {
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [isDeleteSuccessOpen, setIsDeleteSuccessOpen] = useState(false)
  const [saveSuccessMessage, setSaveSuccessMessage] = useState('')
  const [isSaveSuccessOpen, setIsSaveSuccessOpen] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)
  const [isFavouriteLoading, setIsFavouriteLoading] = useState(false)
  const [favouriteError, setFavouriteError] = useState('')

  const navigate = useNavigate()
  const location = useLocation()
  const { supplierId } = useParams()

  const [supplier, setSupplier] = useState<Supplier | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
    if (!supplierId) return

    const state = location.state as DetailLocationState | null
    // Snackbar only from Save navigation — supplier data always comes from GET.
    if (state?.successMessage?.trim()) {
      setSaveSuccessMessage(state.successMessage.trim())
      setIsSaveSuccessOpen(true)
      navigate(location.pathname, { replace: true, state: null })
    }

    let cancelled = false
    fetchSupplierById(supplierId)
      .then((data) => {
        if (cancelled) return
        setSupplier(data)
        setStatus('ready')
      })
      .catch((error) => {
        if (cancelled) return
        console.error(error)
        setStatus('error')
      })

    return () => {
      cancelled = true
    }
    // location.state is read only on mount / supplier change (Save redirect).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: do not refetch when clearing state
  }, [supplierId])

  function closeDeleteDialog() {
    setIsDeleteDialogOpen(false)
    setDeleteError('')
  }

  async function handleDelete() {
    if (!supplier) return
    try {
      setDeleteError('')
      setIsDeleting(true)
      await deleteSupplier(supplier.id)
      setIsDeleteDialogOpen(false)
      setIsDeleteSuccessOpen(true)
    } catch (error) {
      console.error(error)
      setDeleteError(
        getSupplierRequestErrorMessage(
          error,
          'Could not delete supplier. Please try again.',
        ),
      )
    } finally {
      setIsDeleting(false)
    }
  }

  async function toggleFavourite() {
    if (!supplier) return
    try {
      setFavouriteError('')
      setIsFavouriteLoading(true)
      if (supplier.isFavourite) {
        await deleteFavouriteSupplier(supplier.id)
      } else {
        await addFavouriteSupplier(supplier.id)
      }
      setSupplier({ ...supplier, isFavourite: !supplier.isFavourite })
    } catch (error) {
      console.error(error)
      setFavouriteError('Could not update favourite. Please try again.')
    } finally {
      setIsFavouriteLoading(false)
    }
  }

  if (status === 'loading') {
    return (
      <Container component="main" maxWidth="md" sx={{ py: { xs: 3, md: 6 } }}>
        <Typography color="text.secondary">Loading supplier…</Typography>
      </Container>
    )
  }

  if (status === 'error') {
    return (
      <Container component="main" maxWidth="md" sx={{ py: { xs: 3, md: 6 } }}>
        <Stack spacing={2}>
          <Typography component="h1" variant="h4">
            Couldn&apos;t load supplier
          </Typography>
          <Button component={Link} to="/suppliers" variant="outlined">
            Back
          </Button>
        </Stack>
      </Container>
    )
  }

  if (!supplier) {
    return (
      <Container component="main" maxWidth="md" sx={{ py: { xs: 3, md: 6 } }}>
        <Stack spacing={2}>
          <Typography component="h1" variant="h4">
            Supplier not found
          </Typography>
          <Button component={Link} to="/suppliers" variant="outlined">
            Back
          </Button>
        </Stack>
      </Container>
    )
  }

  const isFood = supplier.type.includes('Food')

  return (
    <Container component="main" maxWidth="md" sx={{ py: { xs: 3, md: 6 } }}>
      <Stack spacing={3}>
        <Stack direction="row" spacing={2}>
          <Button
            component={Link}
            to="/suppliers"
            variant="outlined"
            // Carry the on-screen supplier (incl. just-saved crop) into the list.
            state={{ updatedSupplier: supplier }}
          >
            Back
          </Button>
          {isAdmin && (
            <>
              <Button
                component={Link}
                to={`/suppliers/${supplier.id}/edit`}
                variant="contained"
              >
                Edit
              </Button>
              <Button
                color="error"
                variant="outlined"
                onClick={() => setIsDeleteDialogOpen(true)}
              >
                Delete
              </Button>
            </>
          )}
        </Stack>

        <Paper
          variant="outlined"
          sx={{
            position: 'relative',
            p: { xs: 2.5, md: 3.5 },
            borderColor: 'divider',
            boxShadow: '0 8px 24px rgba(23, 35, 45, 0.06)',
          }}
        >
          {!isAdmin && (
            <Box sx={{ position: 'absolute', top: 16, right: 16, zIndex: 1 }}>
              <SupplierFavouriteButton
                isFavourite={supplier.isFavourite}
                isLoading={isFavouriteLoading}
                onClick={() => void toggleFavourite()}
              />
            </Box>
          )}
          <Stack spacing={1.5}>
            <SupplierHeroImage
              name={supplier.name}
              type={supplier.type}
              imageUrl={supplier.image_url}
              height={200}
            />
            <Typography component="h1" variant="h4">
              {supplier.name}
            </Typography>
            <Chip
              label={supplier.type}
              size="small"
              color={isFood ? 'secondary' : 'primary'}
              variant="outlined"
              sx={{ alignSelf: 'flex-start' }}
            />
            <SupplierInfo
              location={`${supplier.building}, Level ${supplier.floor}`}
              operatingHours={supplier.operatingHours}
            />
            {favouriteError && <Alert severity="error">{favouriteError}</Alert>}
            {mode === 'requester' && (
              <Button
                component={Link}
                to={`/requests/new?supplierId=${supplier.id}`}
                variant="contained"
                sx={{ alignSelf: { xs: 'stretch', sm: 'flex-start' } }}
              >
                Create Request
              </Button>
            )}
          </Stack>
        </Paper>
      </Stack>

      {isAdmin && (
        <Dialog open={isDeleteDialogOpen} onClose={closeDeleteDialog}>
          <DialogTitle>Delete {supplier.name}?</DialogTitle>
          <DialogContent>
            <DialogContentText>
              Are you sure you want to delete this supplier?
            </DialogContentText>
            {deleteError && (
              <DialogContentText color="error" sx={{ mt: 1 }}>
                {deleteError}
              </DialogContentText>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={closeDeleteDialog}>Cancel</Button>
            <Button
              color="error"
              variant="contained"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              Delete
            </Button>
          </DialogActions>
        </Dialog>
      )}

      <SuccessSnackbar
        open={isSaveSuccessOpen}
        message={saveSuccessMessage}
        onClose={() => setIsSaveSuccessOpen(false)}
      />

      <SuccessSnackbar
        open={isDeleteSuccessOpen}
        message="Supplier deleted successfully."
        onClose={() => {
          setIsDeleteSuccessOpen(false)
          navigate('/suppliers')
        }}
      />
    </Container>
  )
}

export default SupplierDetailPage
