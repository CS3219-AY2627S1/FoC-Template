import { useState } from 'react'
import { ArrowLeft, Building2, Clock3, Compass, MapPin, Tag } from 'lucide-react'
import { Link, useLocation, useParams } from 'react-router-dom'
import placeholderArtwork from '../assets/supplier-location-placeholder.svg'
import {
  SupplierApiError,
  useSupplierDetailQuery,
} from '../api/supplierQueries'
import { StatePanel } from '../components/DirectoryStates'
import {
  displayImageUrl,
  formatBuilding,
  formatOperatingHours,
  isUuid,
} from '../utils/supplierFormatting'
import { supplierPresentation } from '../utils/supplierPresentation'
import styles from './SupplierDetailPage.module.css'

interface ReturnLocationState {
  from?: string
}

function SupplierImage({
  category,
  name,
  url,
}: {
  category: string
  name: string
  url: string | null
}) {
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  const hasImage = Boolean(url) && !failed

  return (
    <div className={styles.imageFrame}>
      <div
        aria-label={hasImage ? undefined : `${name} photo not available`}
        aria-hidden={hasImage || undefined}
        className={styles.imagePlaceholder}
        role={hasImage ? undefined : 'img'}
      >
        <img alt="" src={placeholderArtwork} />
        <p className={styles.placeholderTitle}>Campus location</p>
        <p>{hasImage ? 'Loading photo…' : 'Photo not available'}</p>
        <span>{category}</span>
      </div>
      {hasImage && (
        <img
          alt={`${name} location`}
          className={`${styles.supplierImage} ${loaded ? styles.imageLoaded : ''}`}
          decoding="async"
          loading="eager"
          onError={() => setFailed(true)}
          onLoad={() => setLoaded(true)}
          referrerPolicy="no-referrer"
          src={url!}
        />
      )}
    </div>
  )
}

export function SupplierDetailPage() {
  const { id } = useParams()
  const location = useLocation()
  const validId = isUuid(id)
  const supplierQuery = useSupplierDetailQuery(id, validId)
  const state = location.state as ReturnLocationState | null
  const backTo = state?.from?.startsWith('/suppliers')
    ? state.from
    : '/suppliers'

  if (!validId) {
    return (
      <div className={styles.page}>
        <BackLink to={backTo} />
        <StatePanel
          message="This link doesn’t look right."
          title="Location not found"
          tone="error"
        />
      </div>
    )
  }

  if (supplierQuery.isPending) {
    return (
      <div className={styles.page}>
        <BackLink to={backTo} />
        <div
          aria-label="Loading location details"
          className={styles.detailSkeleton}
        >
          <span />
          <span />
          <span />
        </div>
      </div>
    )
  }

  if (supplierQuery.isError) {
    const notFound =
      supplierQuery.error instanceof SupplierApiError &&
      supplierQuery.error.status === 404
    return (
      <div className={styles.page}>
        <BackLink to={backTo} />
        <StatePanel
          actionLabel={notFound ? undefined : 'Try again'}
          message={
            notFound
              ? 'This location doesn’t exist or was removed.'
              : 'Please try again.'
          }
          onAction={notFound ? undefined : () => void supplierQuery.refetch()}
          title={
            notFound ? 'Location not found' : 'Location could not be loaded'
          }
          tone="error"
        />
      </div>
    )
  }

  const supplier = supplierQuery.data
  const imageUrl = displayImageUrl(supplier.imageUrl)
  const { Icon, tone } = supplierPresentation(supplier.type)

  return (
    <article className={styles.page}>
      <BackLink to={backTo} />
      {supplier.status === 'INACTIVE' && (
        <StatePanel
          message="This location is no longer listed."
          title="Location currently unavailable"
          tone="info"
        />
      )}
      <div className={styles.detailLayout}>
        <div className={styles.content}>
          <header className={`${styles.heading} ${styles[tone]}`}>
            <span
              className={`${styles.headingIcon} ${styles[tone]}`}
              aria-hidden="true"
            >
              <Icon />
            </span>
            <div className={styles.headingCopy}>
              <span className={styles.eyebrow}>Campus supplier</span>
              <span className={styles.badge}>{supplier.type}</span>
              <h1>{supplier.name}</h1>
              <p>
                <MapPin aria-hidden="true" />
                {formatBuilding(supplier.building, supplier.floor)}
              </p>
            </div>
          </header>

          <dl className={styles.details}>
            <div>
              <dt>
                <Tag aria-hidden="true" />
                Category
              </dt>
              <dd>{supplier.type ?? 'Not provided'}</dd>
            </div>
            <div>
              <dt>
                <Building2 aria-hidden="true" />
                Building and floor
              </dt>
              <dd>{formatBuilding(supplier.building, supplier.floor)}</dd>
            </div>
            <div>
              <dt>
                <Compass aria-hidden="true" />
                Directions
              </dt>
              <dd>
                {supplier.locationDescription ?? 'No directions provided'}
              </dd>
            </div>
            <div>
              <dt>
                <Clock3 aria-hidden="true" />
                Operating hours
              </dt>
              <dd>
                {formatOperatingHours(
                  supplier.openingTime,
                  supplier.closingTime,
                )}
              </dd>
            </div>
            <div>
              <dt>
                <MapPin aria-hidden="true" />
                Coordinates
              </dt>
              <dd>
                {supplier.latitude?.toFixed(6)},{' '}
                {supplier.longitude?.toFixed(6)}
              </dd>
            </div>
          </dl>
        </div>
        <SupplierImage
          key={supplier.id}
          category={supplier.type ?? 'Campus'}
          name={supplier.name ?? 'Campus'}
          url={imageUrl}
        />
      </div>
    </article>
  )
}

function BackLink({ to }: { to: string }) {
  return (
    <Link className={styles.backLink} to={to}>
      <ArrowLeft aria-hidden="true" />
      <span>Back to campus locations</span>
    </Link>
  )
}
