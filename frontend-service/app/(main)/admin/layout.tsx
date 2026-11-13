import { requireAdminView } from '@/lib/session';

export default async function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Hides these pages from everyone else; the services still check the role
  // on every request these pages make.
  await requireAdminView();
  return children;
}
