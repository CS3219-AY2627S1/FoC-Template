/**
 * AI Assistance Disclosure
 * Tool: Cursor (GPT-5.6 Sol Medium)
 * Scope: Assisted with frontend implementation, debugging and UI refinement.
 * Author review: The generated code was reviewed, tested, and iteratively refined by the author through follow-up instructions.
 */

import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  Box,
  Button,
  Container,
  FormHelperText,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { Link, useNavigate, useParams } from 'react-router-dom'
import SupplierImageField, {
  type SupplierImageFieldHandle,
} from '../components/SupplierImageField'
import SupplierLocationFields, {
  hasValidCoordinates,
} from '../components/SupplierLocationFields'
import SupplierTypeField from '../components/SupplierTypeField'
import type { Supplier } from '../interfaces'
import {
  updateSupplier,
  fetchSupplierById,
  getSupplierImageUrlError,
  getSupplierRequestErrorMessage,
  isValidSupplierImageUrl,
  isValidSupplierTime,
  normalizeSupplierImageUrl,
  toSupplierTimeInput,
  toSupplierTimePayload,
} from '../api/suppliers'
import {
  isValidSupplierType,
  normalizeSupplierType,
} from '../suppliers/supplierTypes'

function EditSupplierPage() {
  const navigate = useNavigate()
  const imageFieldRef = useRef<SupplierImageFieldHandle>(null)
  const [submitError, setSubmitError] = useState('')

  const { supplierId } = useParams()

  const [supplier, setSupplier] = useState<Supplier | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')

  // default initial values for when supplier still null
  const [formValues, setFormValues] = useState({
    supplierName: '',
    type: '',
    building: '',
    floor: '',
    locationDescription: '',
    imageUrl: '',
    startingTime: '',
    closingTime: '',
    latitude: '',
    longitude: ''
  })

  const [errors, setErrors] = useState({
    supplierName: false,
    type: false,
    building: false,
    imageUrl: false,
    startingTime: false,
    closingTime: false,
    location: false,
  })

  useEffect(() => {
    if (!supplierId) return
    fetchSupplierById(supplierId)
      .then((data) => {
        setSupplier(data)

        // Populate the form with fetched supplier data
        if (data) {
          setFormValues({
            supplierName: data.name,
            type: data.type,
            building: data.building,
            floor: data.floor,
            locationDescription: data.location_description,
            imageUrl: data.image_url ?? '',
            startingTime: toSupplierTimeInput(data.starting_time),
            closingTime: toSupplierTimeInput(data.closing_time),
            latitude: String(data.latitude),
            longitude: String(data.longitude)
          })
        }
        // console.log(data)
        setStatus('ready')
      })
      .catch((error) => {
        console.error(error)
        setStatus('error')
      })
  }, [supplierId])


  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supplier) return

    const trimmedType = normalizeSupplierType(formValues.type)
    const openingValid = isValidSupplierTime(formValues.startingTime)
    const closingValid = isValidSupplierTime(formValues.closingTime)
    const newErrors = {
      supplierName: formValues.supplierName.trim() === '',
      type: !isValidSupplierType(formValues.type),
      building: formValues.building.trim() === '',
      imageUrl: !isValidSupplierImageUrl(formValues.imageUrl),
      startingTime: !openingValid,
      closingTime: !closingValid,
      location: !hasValidCoordinates(formValues.latitude, formValues.longitude),
    }

    setErrors(newErrors)

    if (Object.values(newErrors).some((hasError) => hasError)) {
      if (!openingValid || !closingValid) {
        setSubmitError('Please enter a valid opening and closing time.')
      } else {
        setSubmitError('')
      }
      return
    }

    // Send the validated updates to the team's existing Supplier Service API.

    try {
      setSubmitError('')
      // prepareForSubmit returns a new crop data URL when the cropper is open,
      // otherwise the current http(s)/existing form value.
      const imageUrlForSave =
        (await imageFieldRef.current?.prepareForSubmit()) ?? formValues.imageUrl
      if (!isValidSupplierImageUrl(imageUrlForSave)) {
        setErrors((current) => ({ ...current, imageUrl: true }))
        setSubmitError(getSupplierImageUrlError(imageUrlForSave))
        return
      }

      const startingTime = toSupplierTimePayload(formValues.startingTime)
      const closingTime = toSupplierTimePayload(formValues.closingTime)
      // updateSupplier PATCHes then requires GET image_url === exact value sent.
      // No silent fallback to an old http(s) source after a failed crop save.
      await updateSupplier(supplier.id, {
        name: formValues.supplierName.trim(),
        type: trimmedType,
        building: formValues.building.trim(),
        floor: formValues.floor.trim(),
        location_description: formValues.locationDescription.trim(),
        starting_time: startingTime,
        closing_time: closingTime,
        latitude: Number(formValues.latitude),
        longitude: Number(formValues.longitude),
        image_url: normalizeSupplierImageUrl(imageUrlForSave),
      })
      navigate(`/suppliers/${supplier.id}`, {
        replace: true,
        state: {
          successMessage: 'Supplier changes saved successfully.',
        },
      })
    } catch (error) {
      console.error(error)
      setSubmitError(
        getSupplierRequestErrorMessage(
          error,
          'Uh oh, we could not save your changes. Please try again.',
        ),
      )
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
      <Container component="main" maxWidth="sm" sx={{ py: { xs: 3, md: 6 } }}>
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

  return (
    <Container component="main" maxWidth="md" sx={{ py: { xs: 3, md: 6 } }}>
      <Stack spacing={3}>
        <Box>
          <Typography component="h1" variant="h4">
            Edit Supplier
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 0.5 }}>
            Keep this supplier&apos;s campus information up to date.
          </Typography>
        </Box>

        <form onSubmit={handleSubmit} noValidate>
          <Paper
            variant="outlined"
            sx={{
              p: { xs: 2.5, md: 3.5 },
              borderColor: 'divider',
              boxShadow: '0 8px 24px rgba(23, 35, 45, 0.05)',
            }}
          >
            <Stack spacing={3}>
              <TextField
                required
                label="Supplier Name"
                value={formValues.supplierName}
                onChange={(event) =>
                  setFormValues((current) => ({
                    ...current,
                    supplierName: event.target.value,
                  }))
                }
                error={errors.supplierName}
                helperText={
                  errors.supplierName ? 'Supplier name is required' : ''
                }
              />

              <SupplierTypeField
                value={formValues.type}
                error={errors.type}
                onChange={(type) =>
                  setFormValues((current) => ({ ...current, type }))
                }
              />

              <SupplierLocationFields
                building={formValues.building}
                latitude={formValues.latitude}
                longitude={formValues.longitude}
                buildingError={errors.building}
                coordinatesError={errors.location}
                onBuildingChange={(building) =>
                  setFormValues((current) => ({ ...current, building }))
                }
                onCoordinatesChange={(latitude, longitude) =>
                  setFormValues((current) => ({ ...current, latitude, longitude }))
                }
                onKnownLocationSelect={(place) =>
                  setFormValues((current) => ({
                    ...current,
                    building: place.name,
                    latitude: String(place.latitude),
                    longitude: String(place.longitude),
                  }))
                }
              />

              <TextField
                label="Floor"
                value={formValues.floor}
                onChange={(event) =>
                  setFormValues((current) => ({
                    ...current,
                    floor: event.target.value,
                  }))
                }
              />

              <TextField
                label="Location Description"
                value={formValues.locationDescription}
                onChange={(event) =>
                  setFormValues((current) => ({
                    ...current,
                    locationDescription: event.target.value,
                  }))
                }
              />

              <SupplierImageField
                ref={imageFieldRef}
                value={formValues.imageUrl}
                error={errors.imageUrl}
                onChange={(imageUrl) =>
                  setFormValues((current) => ({ ...current, imageUrl }))
                }
              />

              <TextField
                required
                fullWidth
                type="text"
                label="Opening Time"
                placeholder="09:00"
                value={formValues.startingTime}
                onChange={(event) =>
                  setFormValues((current) => ({
                    ...current,
                    startingTime: event.target.value,
                  }))
                }
                onBlur={() =>
                  setFormValues((current) => ({
                    ...current,
                    startingTime:
                      toSupplierTimeInput(current.startingTime) ||
                      current.startingTime,
                  }))
                }
                error={errors.startingTime}
                helperText={
                  errors.startingTime
                    ? 'Use 24-hour time like 09:00.'
                    : '24-hour time, e.g. 09:00'
                }
                slotProps={{ inputLabel: { shrink: true } }}
              />
              <TextField
                required
                fullWidth
                type="text"
                label="Closing Time"
                placeholder="18:00"
                value={formValues.closingTime}
                onChange={(event) =>
                  setFormValues((current) => ({
                    ...current,
                    closingTime: event.target.value,
                  }))
                }
                onBlur={() =>
                  setFormValues((current) => ({
                    ...current,
                    closingTime:
                      toSupplierTimeInput(current.closingTime) ||
                      current.closingTime,
                  }))
                }
                error={errors.closingTime}
                helperText={
                  errors.closingTime
                    ? 'Use 24-hour time like 18:00.'
                    : '24-hour time, e.g. 18:00'
                }
                slotProps={{ inputLabel: { shrink: true } }}
              />

              {submitError && <FormHelperText error>{submitError}</FormHelperText>}

              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <Button type="submit" variant="contained">
                  Save Changes
                </Button>
                <Button
                  component={Link}
                  to={`/suppliers/${supplier.id}`}
                  variant="outlined"
                >
                  Cancel
                </Button>
              </Stack>
            </Stack>
          </Paper>
        </form>
      </Stack>
    </Container>
  )
}

export default EditSupplierPage
