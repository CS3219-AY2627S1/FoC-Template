import { NavLink } from 'react-router'
import type { NavItem } from '../navigation'

type SideNavProps = {
  // Names the navigation for screen readers, e.g. "Main" or "Admin".
  label: string
  items: NavItem[]
}

export function SideNav({ label, items }: SideNavProps) {
  return (
    <nav aria-label={label}>
      <ul className="grid grid-cols-1 gap-1">
        {items.map((item) => (
          <li key={item.to}>
            <NavLink to={item.to} end={item.end} className="ds-nav-item">
              <item.icon aria-hidden="true" className="size-5 shrink-0" />
              <span className="min-w-0">{item.label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}