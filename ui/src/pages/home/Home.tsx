/*
AI Assistance Disclosure:
Tool: ChatGPT (model: GPT-5.6 Sol High), date: 2026-09-19
Scope: Adapted the home page to the shared account header
Author review: I reviewed correctness and edited the changes to fit the project
*/

import { Link } from 'react-router-dom'
import { routes } from '../../routes'
import styles from './Home.module.css'

const Home = () => {
  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <div className={styles.hero}>
          <div>
            <p className={styles.eyebrow}>NUS student community</p>
            <h1>Small errands.<br /><em>Shared routes.</em></h1>
            <p className={styles.intro}>
              Start with a campus pickup point, then ask for a small favour from someone already heading your way.
            </p>
            <Link className={styles.primaryAction} to={routes.suppliers}>Browse campus suppliers <span aria-hidden="true">↗</span></Link>
          </div>
          <aside>
            <span className={styles.eyebrow}>Start here</span>
            <strong>01</strong>
            <p>Choose a supplier and see its location and opening hours.</p>
          </aside>
        </div>
        <section className={styles.cards} aria-label="Campus Errands overview">
          <article>
            <span>01</span>
            <h2>Find a supplier</h2>
            <p>Browse live supplier data by name, category, or campus building.</p>
            <Link to={routes.suppliers}>View suppliers</Link>
          </article>
          <article>
            <span>02</span>
            <h2>Help nearby</h2>
            <p>Pick up an open request that already fits your route across campus—even while someone helps with yours.</p>
            <Link to="/orders">Explore orders</Link>
          </article>
          <article>
            <span>03</span>
            <h2>Pass it on</h2>
            <p>Earn credits for helping and use them when you need a hand later.</p>
          </article>
        </section>
      </main>
      <footer className={styles.footer}>Campus Errands · Small favours, better campus days.</footer>
    </div>
  )
}

export default Home
