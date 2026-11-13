import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { routes } from '../../routes'
import styles from './AuthLayout.module.css'

type AuthLayoutProps = {
  children: ReactNode
  eyebrow: string
  title: string
}

const AuthLayout = ({ children, eyebrow, title }: AuthLayoutProps) => (
  <main className={styles.layout}>
    <section className={styles.story}>
      <Link className={styles.wordmark} to={routes.signIn}>
        campus<span>errands.</span>
      </Link>
      <div className={styles.storyContent}>
        <p className={styles.eyebrow}>Made for the in-between</p>
        <h1>
          A small favour.
          <br />
          <em>A better campus day.</em>
        </h1>
        <p className={styles.storyDescription}>
          Prints from the library. A coffee between lectures. Get a hand from someone already on their way.
        </p>
      </div>
      <ol className={styles.steps}>
        <li><span>01</span>Ask for a pickup</li>
        <li><span>02</span>Help someone nearby</li>
        <li><span>03</span>Pass the favour on</li>
      </ol>
    </section>
    <section className={styles.formSection}>
      <div className={styles.formInner}>
        <p className={styles.eyebrow}>{eyebrow}</p>
        <h2>{title}</h2>
        {children}
      </div>
    </section>
  </main>
)

export default AuthLayout
