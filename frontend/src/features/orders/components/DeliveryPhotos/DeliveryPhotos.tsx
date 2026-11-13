import { useDeliveryPhotos } from '../../hooks/useOrders'
import { formatOrderTime } from '../../utils/orderFormat'
import type { Errand } from '../../types/errand.types'
import styles from './DeliveryPhotos.module.scss'

// the courier's photos for proof of delivery are kept with the errand as its record
export const DeliveryPhotos = ({ order }: { order: Errand }) => {
  const photos = useDeliveryPhotos(order)
  if (!order.hasDeliveryPhoto) return null
  return (
    <section className={styles.panel} aria-label="Proof of delivery">
      <h2>Proof of delivery</h2>
      {order.deliveredAt && (
        <p className={styles.muted}>
          Delivered {formatOrderTime(order.deliveredAt)}
        </p>
      )}
      {photos.data ? (
        <ul className={styles.grid} aria-label="Delivery photos">
          {photos.data.map((photo, index) => (
            <li key={photo.id}>
              <a href={photo.url} target="_blank" rel="noreferrer">
                <img src={photo.url} alt={`Delivery photo ${index + 1}`} />
              </a>
            </li>
          ))}
        </ul>
      ) : photos.isError ? (
        <p role="alert" className={styles.muted}>
          The photos could not be loaded.{' '}
          <button
            type="button"
            className={styles.retry}
            onClick={() => void photos.refetch()}
          >
            Try again
          </button>
        </p>
      ) : (
        <p className={styles.muted}>Loading photos…</p>
      )}
    </section>
  )
}
