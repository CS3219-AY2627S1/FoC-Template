import { NotificationShell } from './components/NotificationShell'
import { NotificationsPage } from './NotificationsPage'

/** The Notifications page is the whole app; the gateway routes /notifications here. */
export function App() {
  return (
    <NotificationShell>
      <NotificationsPage />
    </NotificationShell>
  )
}
