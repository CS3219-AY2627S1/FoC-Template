import { AdminSelectedUser } from "@/components/admin/admin-selected-user"

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <AdminSelectedUser userId={id} />
}
