/**
 * AI Assistance Disclosure
 * Tool: Claude Code (Claude Opus 5)
 * Scope: Generated a small inline-SVG icon set so icons render identically
 *        across browsers (UI NFR12.1.2) instead of relying on emoji.
 * Reviewed by Ngooi Jun Sen.
 */

type IconName =
  | 'menu'
  | 'close'
  | 'bell'
  | 'mail'
  | 'pin'
  | 'search'
  | 'star'
  | 'arrowRight'
  | 'chevronDown'
  | 'check'
  | 'eye'
  | 'eyeOff'
  | 'bag'
  | 'lock'
  | 'users';

const PATHS: Record<IconName, string[]> = {
  menu: ['M4 6h16M4 12h16M4 18h16'],
  close: ['M6 6l12 12M18 6L6 18'],
  bell: ['M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0'],
  mail: ['M3 6h18v12H3z', 'm3 7 9 6 9-6'],
  pin: ['M12 21s7-5.5 7-11a7 7 0 10-14 0c0 5.5 7 11 7 11z', 'M12 10.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3z'],
  search: ['M11 19a8 8 0 100-16 8 8 0 000 16z', 'm21 21-4.3-4.3'],
  star: ['M12 3.5l2.6 5.3 5.9.9-4.25 4.15 1 5.85L12 16.95 6.75 19.7l1-5.85L3.5 9.7l5.9-.9z'],
  arrowRight: ['M4 12h16', 'm14 6 6 6-6 6'],
  chevronDown: ['m6 9 6 6 6-6'],
  check: ['m5 13 4 4 10-10'],
  eye: ['M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z', 'M12 15a3 3 0 100-6 3 3 0 000 6z'],
  eyeOff: [
    'M9.9 5.2A9.8 9.8 0 0112 5c6.5 0 10 7 10 7a17.6 17.6 0 01-3.2 4.2M6.6 6.6C3.9 8.4 2 12 2 12s3.5 7 10 7a9.7 9.7 0 005.4-1.6',
    'M9.9 9.9a3 3 0 004.2 4.2',
    'm3 3 18 18',
  ],
  bag: ['M5 8h14l-1 12H6z', 'M9 10V6a3 3 0 016 0v4'],
  lock: ['M6 11h12v9H6z', 'M8.5 11V8a3.5 3.5 0 017 0v3'],
  users: [
    'M9 11a4 4 0 100-8 4 4 0 000 8z',
    'M2 21v-1a6 6 0 016-6h2a6 6 0 016 6v1',
    'M16 3.1a4 4 0 010 7.8',
    'M22 21v-1a6 6 0 00-4-5.65',
  ],
};

export function Icon({
  name,
  size = 20,
  /** Solid rather than outlined. The rating star in the mockups is solid. */
  filled = false,
}: {
  name: IconName;
  size?: number;
  filled?: boolean;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={filled ? 0 : 2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
