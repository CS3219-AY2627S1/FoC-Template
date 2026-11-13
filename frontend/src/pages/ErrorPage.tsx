import { Button } from '@base-ui/react/button'
import { useRouter } from '@tanstack/react-router'

import styles from './ErrorPage.module.scss'

export const ErrorPage = () => {
  const router = useRouter()

  return (
    <main className={styles.container}>
      <p role="alert">Something went wrong. Please try again.</p>
      <Button
        onClick={() => {
          void router.invalidate()
        }}
      >
        Try again
      </Button>
    </main>
  )
}
