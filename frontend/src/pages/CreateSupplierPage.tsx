/**
 * AI Assistance Disclosure
 * Tool: Cursor (GPT-5.6 Sol Medium)
 * Scope: Assisted with frontend implementation, debugging and UI refinement.
 * Author review: The generated code was reviewed, tested, and iteratively refined by the author through follow-up instructions.
 */

import { useRef, useState, type FormEvent } from 'react'
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
import { Link, useNavigate } from 'react-router-dom'
import SuccessSnackbar from '../components/SuccessSnackbar'
import SupplierImageField, {
  type SupplierImageFieldHandle,
} from '../components/SupplierImageField'
import SupplierLocationFields, {
  hasValidCoordinates,
} from '../components/SupplierLocationFields'
import SupplierTypeField from '../components/SupplierTypeField'
import {
  createSupplier,
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

function CreateSupplierPage() {
  const navigate = useNavigate()
  const imageFieldRef = useRef<SupplierImageFieldHandle>(null)
  const [isSuccessOpen, setIsSuccessOpen] = useState(false)
  const [submitError, setSubmitError] = useState('')

  // default initial values
  const [formValues, setFormValues] = useState({
    supplierName: '',
    type: '',
    building: '',
    floor: '',
    locationDescription: '',
    imageUrl: '',
    // Start at midnight so the time picker is usable (shows as 12:00 AM).
    startingTime: '00:00',
    closingTime: '00:00',
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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

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

    // Send the validated form to the team's existing Supplier Service.
    try {
      setSubmitError('')
      const imageUrlForSave =
        (await imageFieldRef.current?.prepareForSubmit()) ?? formValues.imageUrl
      if (!isValidSupplierImageUrl(imageUrlForSave)) {
        setErrors((current) => ({ ...current, imageUrl: true }))
        setSubmitError(getSupplierImageUrlError(imageUrlForSave))
        return
      }

      // No silent http fallback after a failed crop — create must persist the
      // exact image_url that was submitted (crop data URL or plain http link).
      await createSupplier({
        name: formValues.supplierName.trim(),
        type: trimmedType,
        building: formValues.building.trim(),
        floor: formValues.floor.trim(),
        location_description: formValues.locationDescription.trim(),
        starting_time: toSupplierTimePayload(formValues.startingTime),
        closing_time: toSupplierTimePayload(formValues.closingTime),
        latitude: Number(formValues.latitude),
        longitude: Number(formValues.longitude),
        image_url: normalizeSupplierImageUrl(imageUrlForSave),
      })
      setIsSuccessOpen(true)
    } catch (error) {
      console.error(error)
      setSubmitError(
        getSupplierRequestErrorMessage(
          error,
          'Uh oh, we could not create this supplier. Please try again.',
        ),
      )
    }
  }

  return (
    <Container component="main" maxWidth="md" sx={{ py: { xs: 3, md: 6 } }}>
      <Stack spacing={3}>
        <Box>
          <Typography component="h1" variant="h4">
            Create Supplier
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 0.5 }}>
            Add a campus service provider to the directory.
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
                    : '24-hour time, e.g. 09:00 (default 00:00)'
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
                    : '24-hour time, e.g. 18:00 (default 00:00)'
                }
                slotProps={{ inputLabel: { shrink: true } }}
              />

              {submitError && <FormHelperText error>{submitError}</FormHelperText>}

              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <Button type="submit" variant="contained">
                  Create Supplier
                </Button>
                <Button component={Link} to="/suppliers" variant="outlined">
                  Cancel
                </Button>
              </Stack>
            </Stack>
          </Paper>
        </form>
      </Stack>

      <SuccessSnackbar
        open={isSuccessOpen}
        message="Supplier created successfully."
        onClose={() => {
          setIsSuccessOpen(false)
          navigate('/suppliers')
        }}
      />
    </Container>
  )
}

export default CreateSupplierPage
