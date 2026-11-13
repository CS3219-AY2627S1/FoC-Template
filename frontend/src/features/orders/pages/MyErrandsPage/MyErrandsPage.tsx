import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { Search } from 'lucide-react'
import { OrderCard } from '../../components/OrderCard/OrderCard'
import { OrderFeedback } from '../../components/OrderFeedback/OrderFeedback'
import { OrderPagination } from '../../components/OrderPagination/OrderPagination'
import { useMyErrands } from '../../hooks/useOrders'
import type { OrderListSearch } from '../../utils/orderFilters'
import styles from '../../styles/order.module.scss'
import pageStyles from './MyErrandsPage.module.scss'

const SEARCH_DELAY_MS = 300

export const MyErrandsPage = () => {
  const search = useSearch({ from: '/authenticated/user/errands' })
  const navigate = useNavigate()
  const [text, setText] = useState(search.q ?? '')
  // keep the filter update with user entered text & previous filter
  const [written, setWritten] = useState(search.q)
  const [seen, setSeen] = useState(search.q)

  if (search.q !== seen) {
    setSeen(search.q)
    if (search.q !== written) setText(search.q ?? '')
  }

  useEffect(() => {
    const q = text.trim() || undefined
    if (q === search.q) return
    const timer = setTimeout(() => {
      setWritten(q)
      void navigate({
        to: '/errands',
        search: { ...search, q, page: 0 },
        replace: true,
      })
    }, SEARCH_DELAY_MS)
    return () => clearTimeout(timer)
  }, [text, search, navigate])

  const query = useMyErrands({
    as:
      search.participation === 'requested'
        ? 'requester'
        : search.participation === 'delivering'
          ? 'courier'
          : 'all',
    view: search.tab,
    page: search.page,
    size: 20,
    q: search.q,
  })
  return (
    <div className={styles.page}>
      <h1 className={styles.pageTitle}>My Errands</h1>
      <div className={styles.toolbar}>
        <nav className={pageStyles.tabs} aria-label="Errand history">
          {(['active', 'history'] as const).map((tab) => (
            <Link
              className={pageStyles.tab}
              key={tab}
              to="/errands"
              search={{ ...search, tab, page: 0 }}
              aria-current={search.tab === tab ? 'page' : undefined}
            >
              {tab === 'active' ? 'Active' : 'History'}
            </Link>
          ))}
        </nav>
        <label className={pageStyles.search}>
          <Search size={16} aria-hidden="true" />
          <input
            type="search"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Search item, shop or place"
            aria-label="Search errands"
          />
        </label>
        <label className={pageStyles.filter}>
          Type
          <select
            className={styles.select}
            aria-label="Type"
            value={search.participation}
            onChange={(event) =>
              void navigate({
                to: '/errands',
                search: {
                  ...search,
                  participation: event.target
                    .value as OrderListSearch['participation'],
                  page: 0,
                },
              })
            }
          >
            <option value="all">All</option>
            <option value="requested">Requested by me</option>
            <option value="delivering">I'm delivering</option>
          </select>
        </label>
      </div>
      <OrderFeedback
        error={query.error}
        loading={query.isPending}
        retry={() => void query.refetch()}
      />
      {query.data && query.userId && !query.error && (
        <>
          {query.data.items.length ? (
            <ul className={`${styles.list} ${pageStyles.cards}`}>
              {query.data.items.map((order) => (
                <li key={order.id}>
                  <OrderCard
                    order={order}
                    userId={query.userId!}
                    listSearch={search}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <div className={styles.panel}>
              {search.q ? (
                <p>No errands match “{search.q}”.</p>
              ) : (
                <p>
                  No {search.tab === 'history' ? 'past' : 'active'} errands
                  match this view.{' '}
                  <Link className={styles.link} to="/request">
                    Request a pickup
                  </Link>{' '}
                  or{' '}
                  <Link className={styles.link} to="/deliver">
                    find an errand
                  </Link>
                  .
                </p>
              )}
            </div>
          )}
          <OrderPagination
            page={search.page}
            total={query.data.total}
            pending={query.isFetching}
            onPage={(page) =>
              void navigate({
                to: '/errands',
                search: { ...search, page },
                replace: true,
              })
            }
          />
        </>
      )}
    </div>
  )
}
