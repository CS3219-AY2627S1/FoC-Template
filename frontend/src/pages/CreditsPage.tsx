/**
 * AI Assistance Disclosure
 * Tool: Cursor (GPT-5.6 Sol Medium)
 * Scope: Assisted with frontend implementation, debugging and UI refinement.
 * Author review: The generated code was reviewed, tested, and iteratively refined by the author through follow-up instructions.
 */

import { Navigate } from 'react-router-dom'

/** Credits now live under Account. Keep this route as a friendly redirect. */
function CreditsPage() {
  return <Navigate to="/account?tab=credits" replace />
}

export default CreditsPage
