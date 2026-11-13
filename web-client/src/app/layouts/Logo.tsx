// The Relay logo: a route shaped like an R, from a start point at the top to a destination at the
// foot of the leg, on the coral tile. public/favicon.svg draws the same shape with fixed colours
// for the browser tab.
export function Logo() {
  return (
    <span aria-hidden="true" className="size-8 shrink-0 rounded-tile bg-accent-gradient text-on-accent">
      <svg viewBox="0 0 32 32" className="size-full">
        <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14.2 8.8H16.5A3.6 3.6 0 0 1 16.5 16H11L19.3 21.7" strokeWidth="2.8" />
          <circle cx="10.6" cy="8.8" r="2.4" strokeWidth="2.4" />
        </g>
        <circle cx="22" cy="23.6" r="3.3" fill="currentColor" />
      </svg>
    </span>
  )
}
