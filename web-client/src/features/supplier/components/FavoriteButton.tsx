import { Heart } from 'lucide-react'
import { useSetFavorite } from '@/api/supplier/favorites'
import type { Supplier } from '@/api/supplier/types'
import { ApiError } from '@/lib/http'

type FavoriteButtonProps = {
  supplier: Pick<Supplier, 'id' | 'name'>
  favorite: boolean
}

// A toggle: the name stays the same and aria-pressed says whether it is on. Each button has its own
// mutation, so each one shows its own error.
export function FavoriteButton({ supplier, favorite }: FavoriteButtonProps) {
  const toggle = useSetFavorite()

  return (
    <div className="grid justify-items-end gap-1">
      <button
        type="button"
        aria-pressed={favorite}
        aria-label={`Favorite ${supplier.name}`}
        className="ds-btn ds-btn--icon"
        onClick={() => toggle.mutate({ id: supplier.id, favorite: !favorite })}
      >
        <Heart aria-hidden="true" className={favorite ? 'size-5 fill-accent text-accent' : 'size-5 text-muted'} />
      </button>
      {toggle.isError && (
        <p role="alert" className="ds-field-error text-right">
          {toggle.error instanceof ApiError ? toggle.error.message : 'Not saved'}
        </p>
      )}
    </div>
  )
}
