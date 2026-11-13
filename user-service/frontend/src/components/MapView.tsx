// AI Assistance Disclosure:
// Tool: ChatGPT (model: GPT-5.6 Luna), date: 2026-09-29
// Scope: Generated initial implementation, decomposed App.tsx into separate components
// Author review: I validated correctness and edited for style.

import nusMapImage from '../assets/nus-map.png'

export function MapView() {
  return (
    <aside className="user-map-panel" aria-label="Map of the National University of Singapore">
      <img
        className="user-map-frame"
        src={nusMapImage}
        alt="Map of the National University of Singapore and its surrounding campus"
      />
    </aside>
  )
}
