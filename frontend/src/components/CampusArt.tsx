/**
 * AI Assistance Disclosure
 * Tool: Cursor (GPT-5.6 Sol Medium)
 * Scope: Assisted with frontend implementation, debugging and UI refinement.
 * Author review: The generated code was reviewed, tested, and iteratively refined by the author through follow-up instructions.
 */

import type { ReactNode } from 'react'
import { Box, SvgIcon, type SvgIconProps } from '@mui/material'

type CampusTone = 'blue' | 'teal'

function ArtIcon(props: SvgIconProps) {
  return <SvgIcon aria-hidden="true" {...props} />
}

export function CampusBuildingIcon(props: SvgIconProps) {
  return (
    <ArtIcon {...props}>
      <path d="M12 3 3 8v2h18V8L12 3Zm-7 9v7H7v-4h3v4h4v-4h3v4h2v-7H5Z" />
    </ArtIcon>
  )
}

export function MapPinIcon(props: SvgIconProps) {
  return (
    <ArtIcon {...props}>
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5Z" />
    </ArtIcon>
  )
}

export function DeliveryBagIcon(props: SvgIconProps) {
  return (
    <ArtIcon {...props}>
      <path d="M8 7V6a4 4 0 0 1 8 0v1h3v13H5V7h3Zm2 0h4V6a2 2 0 0 0-4 0v1Zm-1 5h2v2H9v-2Zm4 0h2v2h-2v-2Z" />
    </ArtIcon>
  )
}

export function PrinterIcon(props: SvgIconProps) {
  return (
    <ArtIcon {...props}>
      <path d="M18 8H6a3 3 0 0 0-3 3v6h4v4h10v-4h4v-6a3 3 0 0 0-3-3ZM8 4h8v2H8V4Zm8 15H8v-4h8v4Zm2-6a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z" />
    </ArtIcon>
  )
}

export function FoodIcon(props: SvgIconProps) {
  return (
    <ArtIcon {...props}>
      <path d="M8.1 13.34 3.9 9.14l3.53-3.53 4.2 4.2-3.53 3.53Zm10.55-9.19 1.41 1.41-9.2 9.2-1.41-1.42 2.83-2.82L9.87 8.1l4.6-4.6a3 3 0 0 1 4.18.42Zm-8.61 9.02 1.41 1.42-6.72 6.71-1.41-1.41 6.72-6.72Z" />
    </ArtIcon>
  )
}

export function StudentIcon(props: SvgIconProps) {
  return (
    <ArtIcon {...props}>
      <path d="M12 3 1 8l11 5 9-4.09V17h2V8L12 3Zm0 13.5L6 13v4.2c0 1.7 2.7 3.3 6 3.3s6-1.6 6-3.3V13l-6 3.5Z" />
    </ArtIcon>
  )
}

export function ClipboardIcon(props: SvgIconProps) {
  return (
    <ArtIcon {...props}>
      <path d="M19 3h-4.18A3 3 0 0 0 9.18 3H5a2 2 0 0 0-2 2v16h18V5a2 2 0 0 0-2-2Zm-7-1a1 1 0 1 1 0 2 1 1 0 0 1 0-2Zm3 15H7v-2h8v2Zm2-4H7v-2h10v2Zm0-4H7V7h10v2Z" />
    </ArtIcon>
  )
}

export function CheckTaskIcon(props: SvgIconProps) {
  return (
    <ArtIcon {...props}>
      <path d="M19 3h-4.18C14.4 1.84 13.3 1 12 1s-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm-2 14-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
    </ArtIcon>
  )
}

export function IconBadge({
  tone,
  children,
}: {
  tone: CampusTone
  children: ReactNode
}) {
  return (
    <Box
      sx={{
        display: 'grid',
        width: 56,
        height: 56,
        flexShrink: 0,
        placeItems: 'center',
        color: '#FFFFFF',
        bgcolor: tone === 'teal' ? 'secondary.main' : 'primary.main',
        borderRadius: 2.5,
        boxShadow:
          tone === 'teal'
            ? '0 8px 16px rgba(31, 98, 94, 0.22)'
            : '0 8px 16px rgba(23, 63, 95, 0.22)',
      }}
    >
      {children}
    </Box>
  )
}

function RoutePin({
  x,
  y,
  fill,
}: {
  x: number
  y: number
  fill: string
}) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path
        d="M0-16c-5.2 0-8.5 3.6-8.5 8.2C-8.5-2.2 0 6 0 6s8.5-8.2 8.5-13.8C8.5-12.4 5.2-16 0-16Zm0 11a2.8 2.8 0 1 1 0-5.6 2.8 2.8 0 0 1 0 5.6Z"
        fill={fill}
      />
    </g>
  )
}

export function CampusScene({ tone }: { tone: CampusTone }) {
  const ink = tone === 'teal' ? '#145E59' : '#12324C'
  const accent = tone === 'teal' ? '#2A9A90' : '#2A628F'
  const wash = tone === 'teal' ? '#E7F6F3' : '#E8F2F8'
  const label = tone === 'teal' ? '#0F4743' : '#0C2436'

  return (
    <Box
      component="svg"
      viewBox="0 0 360 230"
      role="img"
      aria-label="Campus errand route from COM2 to Utown, passing PC Commons and PGP"
      sx={{ width: '100%', height: 'auto', maxHeight: { xs: 200, md: 230 }, display: 'block' }}
    >
      <rect width="360" height="230" rx="22" fill={wash} />
      <circle cx="300" cy="34" r="26" fill="#FFFFFF" opacity="0.55" />
      <path
        d="M28 188h304"
        stroke={ink}
        strokeOpacity="0.12"
        strokeWidth="10"
        strokeLinecap="round"
      />
      <path
        d="M72 78 C130 40, 168 118, 214 86 S300 46, 292 118"
        fill="none"
        stroke={accent}
        strokeWidth="3"
        strokeDasharray="1.5 7"
        strokeLinecap="round"
      />
      <RoutePin x={72} y={78} fill={accent} />
      <RoutePin x={168} y={58} fill={ink} />
      <RoutePin x={214} y={128} fill={ink} />
      <RoutePin x={292} y={118} fill={accent} />
      <g transform="translate(132 96)">
        <circle cx="9" cy="7" r="6.5" fill={ink} />
        <path d="M3 18c0-3.6 2.6-5.4 6-5.4s6 1.8 6 5.4v8H3v-8Z" fill={ink} />
        <rect x="15" y="14" width="13" height="11" rx="2" fill={accent} />
        <path d="M18 14v-2.6a3.4 3.4 0 0 1 6.8 0V14" fill="none" stroke="#FFFFFF" strokeWidth="1.5" />
      </g>
      <g fill={label} fontFamily="Inter, ui-sans-serif, system-ui, sans-serif" fontSize="11" fontWeight="700">
        <text x="46" y="104">COM2</text>
        <text x="138" y="46">PC Commons</text>
        <text x="198" y="156">PGP</text>
        <text x="268" y="148">Utown</text>
      </g>
    </Box>
  )
}
