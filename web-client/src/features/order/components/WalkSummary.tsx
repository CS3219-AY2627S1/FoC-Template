type Walk = {
  metres: number
  seconds: number
  estimated: boolean
}

function distanceText(metres: number): string {
  return metres < 1000 ? `${metres} m` : `${(metres / 1000).toFixed(1)} km`
}

// One line for a walk the supplier-service measured: before posting, and on the errand afterwards.
export function WalkSummary({ walk }: { walk: Walk }) {
  return (
    <div className="grid grid-cols-1 gap-1">
      <p className="nums-tabular">
        {distanceText(walk.metres)} · about {Math.max(1, Math.round(walk.seconds / 60))} min walking
        {walk.estimated && <span className="text-muted"> (a rough estimate, the drop-off is off the walking map)</span>}
      </p>
      {!walk.estimated && (
        // The walking map is OpenStreetMap data, whose licence asks for this credit where it is used.
        <p className="text-sm text-muted">
          Measured on map data ©{' '}
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="underline">
            OpenStreetMap contributors
          </a>
        </p>
      )}
    </div>
  )
}
