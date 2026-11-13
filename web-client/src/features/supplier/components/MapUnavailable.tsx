import { Notice } from '@/components/Notice'

// Stands in for the map when its file cannot be downloaded, usually because a new release replaced
// it after this page was loaded.
export function MapUnavailable() {
  return (
    <Notice tone="danger" role="alert" title="The map could not load">
      Reload the page and try again. You can still type the latitude and longitude.
    </Notice>
  )
}
