// AI Assistance Disclosure:
// Tool: GitHub Copilot (Copilot SDK), date: 2026-11-08
// Scope: Created a reusable Material UI favourite toggle button.
// Author review: Read through all code and verified through testing

import { IconButton, SvgIcon } from '@mui/material'

type SupplierFavouriteButtonProps = {
  isFavourite: boolean
  isLoading?: boolean
  onClick: () => void
}

function SupplierFavouriteButton({
  isFavourite,
  isLoading = false,
  onClick,
}: SupplierFavouriteButtonProps) {
  const label = isFavourite ? 'Remove from favourites' : 'Add to favourites'

  return (
    <IconButton
      aria-label={label}
      aria-pressed={isFavourite}
      title={label}
      onClick={onClick}
      disabled={isLoading}
      color={isFavourite ? 'warning' : 'default'}
      sx={{
        bgcolor: 'background.paper',
        boxShadow: 1,
        '&:hover': { bgcolor: 'background.paper' },
      }}
    >
      <SvgIcon>
        <path
          d="m12 17.27 6.18 3.73-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"
          fill={isFavourite ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeLinejoin="round"
          strokeWidth={isFavourite ? 0 : 1.7}
        />
      </SvgIcon>
    </IconButton>
  )
}

export default SupplierFavouriteButton
