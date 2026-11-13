import { ClipboardCheck, HandHeart } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { useSessionRole } from '../hooks/useSessionRole'

/** Errand screens for the header role: Request help (Requester) or Run errands (Courier), plus My errands. */
export function ErrandTabs() {
  const role = useSessionRole()
  return (
    <nav aria-label={role === 'COURIER' ? 'Courier errands' : 'Errands'} className="errand-tabs">
      {role === 'REQUESTER' ? (
        <>
          <NavLink className="errand-tab" to="/errands/new">
            <HandHeart aria-hidden="true" />
            Request help
          </NavLink>
          <NavLink className="errand-tab" to="/errands/mine">
            <ClipboardCheck aria-hidden="true" />
            My errands
          </NavLink>
        </>
      ) : (
        <>
          <NavLink className="errand-tab" to="/errands/browse">
            Open requests
          </NavLink>
          <NavLink className="errand-tab" to="/errands/mine">
            Past errands
          </NavLink>
        </>
      )}
    </nav>
  )
}
