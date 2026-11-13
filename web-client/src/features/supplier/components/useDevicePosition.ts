import { useEffect, useState } from 'react'

export type DevicePosition =
  | { status: 'off' }
  | { status: 'locating' }
  | { status: 'found'; near: string }
  | { status: 'failed'; reason: string }

// Browsers share a position only with a page served over HTTPS, or from localhost.
const supported = window.isSecureContext && 'geolocation' in navigator

// Asks the browser for the device's position each time `wanted` turns on. The browser asks the
// student first. Three decimals are about 110 m: enough to sort the shops of one campus, and less
// personal than the exact spot. Nothing is stored.
export function useDevicePosition(wanted: boolean): DevicePosition {
  const [answer, setAnswer] = useState<DevicePosition | null>(null)

  useEffect(() => {
    if (!wanted || !supported) return
    let current = true
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (current) {
          const { latitude, longitude } = position.coords
          setAnswer({ status: 'found', near: `${latitude.toFixed(3)},${longitude.toFixed(3)}` })
        }
      },
      (error) => {
        if (current) {
          setAnswer({
            status: 'failed',
            reason:
              error.code === error.PERMISSION_DENIED
                ? 'Location access is blocked for this site. Allow it in the browser settings to sort by distance.'
                : 'Your location could not be found.',
          })
        }
      },
      // Accurate where the phone can manage it, but a position from the last minute is fine.
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    )
    return () => {
      current = false
      setAnswer(null)
    }
  }, [wanted])

  if (!wanted) return { status: 'off' }
  if (!supported) return { status: 'failed', reason: 'This page cannot ask for your location. It works only over HTTPS.' }
  return answer ?? { status: 'locating' }
}
