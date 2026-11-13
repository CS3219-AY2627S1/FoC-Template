import type { FeatureRoutes } from '@/lib/routing'
import { AdminReportDetailPage } from './pages/AdminReportDetailPage'
import { AdminReportsPage } from './pages/AdminReportsPage'
import { AdminStudentDetailPage } from './pages/AdminStudentDetailPage'
import { AdminStudentsPage } from './pages/AdminStudentsPage'
import { ChangePasswordPage } from './pages/ChangePasswordPage'
import { EditProfilePage } from './pages/EditProfilePage'
import { LoginPage } from './pages/LoginPage'
import { NewReportPage } from './pages/NewReportPage'
import { ProfilePage } from './pages/ProfilePage'
import { SignupPage } from './pages/SignupPage'
import { VerifyPage } from './pages/VerifyPage'

export const userRoutes: FeatureRoutes = {
  guest: [
    { path: 'login', Component: LoginPage },
    { path: 'signup', Component: SignupPage },
    { path: 'verify', Component: VerifyPage },
  ],
  app: [
    { path: 'profile', Component: ProfilePage },
    { path: 'profile/edit', Component: EditProfilePage },
    { path: 'profile/password', Component: ChangePasswordPage },
    { path: 'reports/new', Component: NewReportPage },
  ],
  admin: [
    { path: 'students', Component: AdminStudentsPage },
    { path: 'students/:id', Component: AdminStudentDetailPage },
    { path: 'reports', Component: AdminReportsPage },
    { path: 'reports/:id', Component: AdminReportDetailPage },
  ],
}
