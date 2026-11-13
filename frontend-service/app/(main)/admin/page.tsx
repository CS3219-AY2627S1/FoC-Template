import { redirect } from 'next/navigation';

/** The admin view has no overview of its own; it opens on the users list. */
export default function AdminIndexPage() {
  redirect('/admin/users');
}
