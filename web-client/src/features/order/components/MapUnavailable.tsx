import { Notice } from '@/components/Notice'

// A copy of features/supplier/components/MapUnavailable.tsx. Stands in for the map when its file
// cannot be downloaded, usually because a new release replaced it after this page was loaded.
export function MapUnavailable() {
  return (
    <Notice tone="danger" role="alert" title="The map could not load">
      Reload the page and try again.
    </Notice>
  )
}
