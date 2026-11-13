import { NavLink } from 'react-router'
import type { NavItem } from '../navigation'

type TabBarProps = {
  // Names the navigation for screen readers, e.g. "Main".
  label: string
  items: NavItem[]
}

export function TabBar({ label, items }: TabBarProps) {
  return (
    <nav aria-label={label}>
      <ul className="ds-tabbar">
        {items.map((item) => (
          <li key={item.to} className="min-w-0">
            <NavLink to={item.to} end={item.end} className="ds-tabbar-item">
              <item.icon aria-hidden="true" className="size-5 shrink-0" />
              <span className="max-w-full text-center wrap-anywhere">{item.shortLabel ?? item.label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}