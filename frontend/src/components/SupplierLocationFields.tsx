/**
 * AI Assistance Disclosure
 * Tool: Cursor (Composer)
 * Scope: Building Autocomplete from nusLocations, Leaflet pin picker, advanced coordinates.
 * Author review: Frontend-only; API still receives numeric latitude/longitude.
 */

import { useEffect, useMemo, useState } from 'react'
import Autocomplete from '@mui/material/Autocomplete'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Collapse from '@mui/material/Collapse'
import FormHelperText from '@mui/material/FormHelperText'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import L from 'leaflet'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'
import { MapContainer, Marker, TileLayer, useMap, useMapEvents, ZoomControl } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { kentRidgeCentre, nusLocations, type NusLocation } from '../data/nusLocations'

const mapZoom = 15

const pinIcon = L.icon({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
})

export const LOCATION_COORDS_MESSAGE =
  'Please select a known campus location or place the supplier pin on the map.'

export function hasValidCoordinates(latitude: string, longitude: string): boolean {
  if (!latitude.trim() || !longitude.trim()) return false
  const lat = Number(latitude)
  const lng = Number(longitude)
  return Number.isFinite(lat) && Number.isFinite(lng)
}

type SupplierLocationFieldsProps = {
  building: string
  latitude: string
  longitude: string
  buildingError?: boolean
  coordinatesError?: boolean
  onBuildingChange: (building: string) => void
  onCoordinatesChange: (latitude: string, longitude: string) => void
  onKnownLocationSelect: (location: NusLocation) => void
}

function MapSizeFix() {
  const map = useMap()
  useEffect(() => {
    const timer = window.setTimeout(() => map.invalidateSize(), 120)
    return () => window.clearTimeout(timer)
  }, [map])
  return null
}

function MapClickPicker({
  onPick,
}: {
  onPick: (latitude: number, longitude: number) => void
}) {
  useMapEvents({
    click(event) {
      onPick(event.latlng.lat, event.latlng.lng)
    },
  })
  return null
}

function MapRecenter({
  latitude,
  longitude,
  hasPin,
}: {
  latitude: number
  longitude: number
  hasPin: boolean
}) {
  const map = useMap()
  useEffect(() => {
    if (!hasPin) return
    map.setView([latitude, longitude], Math.max(map.getZoom(), mapZoom))
  }, [hasPin, latitude, longitude, map])
  return null
}

function SupplierLocationFields({
  building,
  latitude,
  longitude,
  buildingError = false,
  coordinatesError = false,
  onBuildingChange,
  onCoordinatesChange,
  onKnownLocationSelect,
}: SupplierLocationFieldsProps) {
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [coordsEditable, setCoordsEditable] = useState(false)

  const selectedLocation = useMemo(
    () => nusLocations.find((place) => place.name === building) ?? null,
    [building],
  )

  const hasPin = hasValidCoordinates(latitude, longitude)
  const pinLat = hasPin ? Number(latitude) : kentRidgeCentre.latitude
  const pinLng = hasPin ? Number(longitude) : kentRidgeCentre.longitude

  function handleBuildingInput(nextBuilding: string) {
    onBuildingChange(nextBuilding)
  }

  function handleBuildingSelect(option: string | NusLocation | null) {
    if (option == null) return
    if (typeof option === 'string') {
      onBuildingChange(option)
      return
    }
    onKnownLocationSelect(option)
  }

  return (
    <Stack spacing={2}>
      <Autocomplete
        freeSolo
        options={nusLocations}
        getOptionLabel={(option) =>
          typeof option === 'string' ? option : option.name
        }
        isOptionEqualToValue={(option, value) =>
          typeof value !== 'string' && option.id === value.id
        }
        value={selectedLocation}
        inputValue={building}
        onChange={(_event, newValue) => handleBuildingSelect(newValue)}
        onInputChange={(_event, newInputValue, reason) => {
          if (reason === 'input' || reason === 'clear') {
            handleBuildingInput(newInputValue)
          }
        }}
        renderOption={(props, option) => (
          <li {...props} key={option.id}>
            <Box>
              <Typography variant="body2">{option.name}</Typography>
              <Typography variant="caption" color="text.secondary">
                {option.detail}
              </Typography>
            </Box>
          </li>
        )}
        renderInput={(params) => (
          <TextField
            {...params}
            required
            label="Building"
            error={buildingError}
            helperText={
              buildingError
                ? 'Building is required'
                : 'Pick a campus place to auto-fill the map pin, or type a custom name'
            }
            slotProps={{
              ...params.slotProps,
              htmlInput: {
                ...params.slotProps.htmlInput,
              },
            }}
          />
        )}
      />

      <Box>
        <Typography variant="subtitle2" sx={{ mb: 0.75 }}>
          Map pin
        </Typography>
        <Typography color="text.secondary" variant="body2" sx={{ mb: 1 }}>
          Click the map to place or move the supplier pin.
        </Typography>
        <Box
          sx={{
            height: { xs: 240, sm: 280 },
            borderRadius: 2,
            overflow: 'hidden',
            border: '1px solid',
            borderColor: coordinatesError ? 'error.main' : 'divider',
            '& .leaflet-container': {
              height: '100%',
              width: '100%',
              fontFamily: 'inherit',
              cursor: 'crosshair',
            },
          }}
        >
          <MapContainer
            center={[pinLat, pinLng]}
            zoom={mapZoom}
            minZoom={12}
            maxZoom={19}
            scrollWheelZoom
            zoomControl={false}
            style={{ height: '100%', width: '100%' }}
          >
            <ZoomControl position="topright" />
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              maxZoom={19}
            />
            <MapSizeFix />
            <MapClickPicker
              onPick={(nextLat, nextLng) =>
                onCoordinatesChange(String(nextLat), String(nextLng))
              }
            />
            <MapRecenter latitude={pinLat} longitude={pinLng} hasPin={hasPin} />
            {hasPin && <Marker position={[pinLat, pinLng]} icon={pinIcon} />}
          </MapContainer>
        </Box>
        {coordinatesError && (
          <FormHelperText error sx={{ mt: 1 }}>
            {LOCATION_COORDS_MESSAGE}
          </FormHelperText>
        )}
        {!coordinatesError && hasPin && (
          <FormHelperText sx={{ mt: 1 }}>
            Pin set at {Number(latitude).toFixed(5)}, {Number(longitude).toFixed(5)}
          </FormHelperText>
        )}
      </Box>

      <Box>
        <Button
          type="button"
          size="small"
          onClick={() => setAdvancedOpen((open) => !open)}
          sx={{ px: 0 }}
        >
          {advancedOpen ? 'Hide coordinates' : 'Advanced / Coordinates'}
        </Button>
        <Collapse in={advancedOpen}>
          <Stack spacing={1.5} sx={{ mt: 1.5 }}>
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              spacing={1}
              sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between' }}
            >
              <Typography variant="body2" color="text.secondary">
                Sent to the Supplier Service with create/update.
              </Typography>
              <Button
                type="button"
                size="small"
                variant="outlined"
                onClick={() => setCoordsEditable((value) => !value)}
              >
                {coordsEditable ? 'Done' : 'Edit numbers'}
              </Button>
            </Stack>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                fullWidth
                type="number"
                label="Latitude"
                value={latitude}
                disabled={!coordsEditable}
                onChange={(event) =>
                  onCoordinatesChange(event.target.value, longitude)
                }
                slotProps={{ htmlInput: { step: 'any' } }}
              />
              <TextField
                fullWidth
                type="number"
                label="Longitude"
                value={longitude}
                disabled={!coordsEditable}
                onChange={(event) =>
                  onCoordinatesChange(latitude, event.target.value)
                }
                slotProps={{ htmlInput: { step: 'any' } }}
              />
            </Stack>
          </Stack>
        </Collapse>
      </Box>
    </Stack>
  )
}

export default SupplierLocationFields
